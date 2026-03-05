const Employee = require("../models/employee");
const { runAction } = require("../services/ai-action-executor");
const {
  emptyState,
  normalizeUserText,
  extractMeetingEntities,
  resetForIntent,
  mergeState,
  getMissingField,
  questionForMissing,
  reminderForMissing,
  hasMeaningfulNewData,
  evaluateSlotsFlow,
  buildAction,
  buildClarificationReply,
  confirmationMessage,
  friendlyActionError,
} = require("../services/ai-agent-core");

const sessionState = {};

const clearSession = (sessionKey, keepLastMeetingRef = null) => {
  const next = emptyState();
  if (keepLastMeetingRef) next.lastMeetingRef = keepLastMeetingRef;
  sessionState[sessionKey] = next;
};

const resetSessions = () => {
  for (const key of Object.keys(sessionState)) delete sessionState[key];
};

const respondOk = (res, reply, extra = {}) => res.status(200).json({ success: true, message: reply, reply, ...extra });

const hydrateSelectionRef = (state, entities, userPrompt) => {
  if (state.pendingMeetings?.length && entities.selectionIndex) {
    const selected = state.pendingMeetings[entities.selectionIndex - 1];
    if (selected?._id) entities.meetingRef = String(selected._id);
    entities.time = null;
    entities.title = null;
    entities.titleProvided = false;
    entities.attendees = [];
    entities.duration = null;
    entities.platform = null;
    entities.type = state.intent || entities.type;
  }

  const isPronoun = entities.meetingRef === "it" || /\b(it|this|that)\b/i.test(userPrompt);
  if (isPronoun && ["update", "delete"].includes(entities.type || state.intent)) {
    entities.meetingRef = state.meetingRef || state.lastMeetingRef || entities.meetingRef;
  }

  if (!entities.type && state.intent) entities.type = state.intent;
  return entities;
};

const askForMissing = (state, entities, prevIntent) => {
  const missingField = getMissingField(state);
  if (!state.intent || !missingField) return null;

  const repeated =
    state.lastAskedField === missingField &&
    state.lastAskedIntent === state.intent &&
    !hasMeaningfulNewData(entities, prevIntent);

  state.lastAskedField = missingField;
  state.lastAskedIntent = state.intent;
  return repeated ? reminderForMissing(missingField) : questionForMissing(missingField);
};

const handleSelectionResponse = (result, state) => {
  if (result?.type !== "select_update" && result?.type !== "select_delete") return null;

  state.pendingMeetings = result.meetings;
  state.intent = result.type === "select_update" ? "update" : "delete";
  state.lastAskedField = "meetingRef";
  state.lastAskedIntent = state.intent;
  return "Which meeting did you mean? Reply with a number.";
};

const chatHandler = async (req, res) => {
  try {
    const { prompt, conversationHistory, timezone = "UTC", sessionId } = req.body;
    const userPrompt = normalizeUserText(String(prompt || "").trim());

    if (!userPrompt) return respondOk(res, "How can I help with your meetings?");

    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const employees = await Employee.find().select("name email").lean();
    const sessionKey = sessionId ? `${user.id}:${sessionId}` : String(user.id);
    if (!sessionState[sessionKey]) sessionState[sessionKey] = emptyState();

    let state = sessionState[sessionKey];
    const prevIntent = state.intent;

    const entities = hydrateSelectionRef(
      state,
      extractMeetingEntities({ message: userPrompt, timezone, employees, currentIntent: state.intent }),
      userPrompt
    );

    state = mergeState(resetForIntent(state, entities.type), entities);

    if (state.intent === "schedule") {
      state.title = state.title || "meeting";
      state.platform = state.platform || "zoom";
      state.duration = state.duration || 60;
    }

    if (prevIntent && entities.type && prevIntent !== entities.type) {
      state.lastAskedField = null;
      state.lastAskedIntent = null;
      state.slotsAskedAttendees = false;
    }

    const slotsFlow = evaluateSlotsFlow({ state, entities, userPrompt, prevIntent });
    state = slotsFlow.state;
    sessionState[sessionKey] = state;
    if (slotsFlow.reply) return respondOk(res, slotsFlow.reply);

    const missingReply = askForMissing(state, entities, prevIntent);
    if (missingReply) {
      sessionState[sessionKey] = state;
      return respondOk(res, missingReply);
    }

    if (state.intent && state.intent !== "query") {
      state.lastAskedField = null;
      state.lastAskedIntent = null;

      try {
        const action = buildAction(state, timezone);
        const result = await runAction(req.user.id, user.email, action);

        const selectionReply = handleSelectionResponse(result, state);
        sessionState[sessionKey] = state;
        if (selectionReply) return respondOk(res, selectionReply, { meetings: result.meetings });

        const confirmation = confirmationMessage(result?.type, action, result?.meeting, timezone);
        const lastMeetingRef = result?.meeting?._id ? String(result.meeting._id) : state.meetingRef || state.lastMeetingRef;
        clearSession(sessionKey, lastMeetingRef || null);

        const { type: _ignoredType, ...payload } = result || {};
        return respondOk(res, confirmation, payload);
      } catch (actionErr) {
        return respondOk(res, friendlyActionError(actionErr, state.intent));
      }
    }

    const aiChatService = require("../services/ai-chat-service");
    const ai = await aiChatService.chatWithAI({
      userId: req.user.id,
      userEmail: user.email,
      userMessage: userPrompt,
      conversationHistory: conversationHistory || [],
      timezone,
    });

    let reply = ai.message || "I only help with meetings.";
    if (/not sure how to help|rephrase your meeting request/i.test(reply)) {
      reply = buildClarificationReply(state);
    }

    return respondOk(res, reply);
  } catch (err) {
    const isRateLimit =
      err.status === 429 ||
      err?.error?.code === "rate_limit_exceeded" ||
      (typeof err.message === "string" && err.message.includes("rate_limit_exceeded"));

    if (isRateLimit) return res.status(429).json({ success: false, code: "rate_limit" });

    return respondOk(res, "I couldn't process that meeting request yet. Please try again.");
  }
};

module.exports = {
  chatHandler,
  extractMeetingEntities,
  mergeState,
  getMissingField,
  resetSessions,
};
