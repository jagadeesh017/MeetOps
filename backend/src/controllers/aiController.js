const Employee = require("../models/employee");
const { parsePrompt } = require("../ai/promptParser");
const { executeIntent } = require("../ai/actionRouter");
const { parseTime } = require("../utilities/date-utils");
const { DateTime } = require("luxon");

const respondOk = (res, reply, extra = {}) => res.status(200).json({ success: true, message: reply, reply, ...extra });
const sessionState = {};
const getSessionKey = (userId, sessionId) => (sessionId ? `${userId}:${sessionId}` : String(userId));
const getSession = (key) => {
  if (!sessionState[key]) sessionState[key] = { pendingSelection: null, pendingConfirmation: null };
  return sessionState[key];
};
const MUTATING_ACTIONS = new Set(["schedule_meeting", "update_meeting", "cancel_meeting"]);
const CONFIRM_YES = /^(yes|y|ok|okay|confirm|proceed|do it|go ahead|sure)$/i;
const CONFIRM_NO = /^(no|n|cancel|stop|don't|do not)$/i;

const shouldAskConfirmation = (intent, settings = {}) =>
  Boolean(settings?.ai?.autoConfirmBeforeCreate) && MUTATING_ACTIONS.has(intent?.action);

const RELATIVE_TIME_HINT = /\b(today|tomorrow|tonight|this\s+(morning|afternoon|evening)|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)|this\s+week)\b/i;

const formatUserTime = (timeValue, timezone) => {
  const d = parseTime(String(timeValue || ""), timezone || "UTC");
  if (!d || Number.isNaN(new Date(d).getTime())) return String(timeValue || "");
  return DateTime.fromJSDate(new Date(d))
    .setZone(timezone || "UTC")
    .toFormat("ccc, LLL d, h:mm a");
};

const normalizeIntentTime = (intent = {}, userPrompt = "", timezone = "UTC") => {
  if (!intent?.data?.time) return intent;
  if (!RELATIVE_TIME_HINT.test(String(userPrompt || ""))) return intent;

  const parsedFromIntent = parseTime(String(intent.data.time), timezone);
  if (!parsedFromIntent) return intent;
  const now = new Date();
  if (new Date(parsedFromIntent).getTime() > now.getTime()) return intent;

  const reparsed = parseTime(String(userPrompt || ""), timezone);
  if (!reparsed || new Date(reparsed).getTime() <= now.getTime()) return intent;

  return {
    ...intent,
    data: {
      ...(intent.data || {}),
      // Keep relative phrase context (e.g., "today 9am") so downstream parser uses current date semantics.
      time: String(userPrompt || ""),
    },
  };
};

const summarizeIntent = (intent = {}, timezone = "UTC") => {
  const data = intent.data || {};
  if (intent.action === "schedule_meeting") {
    return `Please confirm: schedule "${data.title || "meeting"}"${data.time ? ` at ${formatUserTime(data.time, timezone)}` : ""}${data.platform ? ` on ${data.platform}` : ""}?`;
  }
  if (intent.action === "update_meeting") {
    return `Please confirm: update meeting${data.meetingRef ? ` (${data.meetingRef})` : ""}${data.time ? ` to ${formatUserTime(data.time, timezone)}` : ""}?`;
  }
  if (intent.action === "cancel_meeting") {
    return `Please confirm: cancel meeting${data.meetingRef ? ` (${data.meetingRef})` : ""}?`;
  }
  return "Please confirm this action.";
};

const friendlyError = (err, settings = {}) => {
  const msg = String(err?.message || "");
  const includeConflictDetails = settings?.ai?.includeConflictDetails !== false;
  if (msg.includes("Cannot schedule meeting for past date or time")) return "That time is in the past. Please share a future date and time.";
  if (msg.includes("outside_working_hours")) return "That time is outside your configured working days/hours.";
  if (msg.includes("Meeting is outside your configured working hours/days")) return "That time is outside your configured working days/hours.";
  if (msg.includes("buffer_conflict")) return "That time violates your configured buffer time between meetings.";
  if (msg.includes("Meeting violates your configured buffer time")) return "That time violates your configured buffer time between meetings.";
  if (msg.includes("invalid_time") || msg.includes("Please provide a valid date and time")) return "I couldn't parse the meeting time. Please share date and time clearly.";
  if (msg.includes("Missing required fields")) return "I still need required details (title, attendees, and time) before scheduling.";
  if (msg.includes("Please specify at least one attendee") || msg.includes("No attendees specified")) return "Who should attend the meeting?";
  if (/meeting reference/i.test(msg) || /meeting ref/i.test(msg)) return "Please tell me which meeting to use. You can share meeting number, title, attendee, or time.";
  if (msg.includes("Zoom account is not connected")) return "Your Zoom account is not connected. Please connect it in Integrations or ask for Google Meet.";
  if (msg.includes("Google account is not connected")) return "Your Google account is not connected. Please connect it in Integrations or ask for Zoom.";
  if (msg.includes("Failed to create Google Meet")) return "I couldn't create the Google Meet right now. Please reconnect Google Calendar and try again.";
  if (msg.includes("Failed to create Zoom meeting")) return "I couldn't create the Zoom meeting right now. Please reconnect Zoom and try again.";
  if (msg.includes("meeting_not_found") || msg.includes("Meeting not found")) return "I couldn't find that meeting. Please share meeting title, attendee, or time.";
  if (msg.includes("Past meetings cannot be cancelled")) return "Past meetings cannot be cancelled.";
  if (msg.includes("not found. Use a person name, email, or group name")) return msg;
  if (msg.includes("missing_change")) return "What should I change for that meeting?";
  if (msg.includes("conflicting meeting")) return includeConflictDetails ? msg : "That time conflicts with another meeting. Please choose another time.";
  if (includeConflictDetails && msg && msg.length <= 220) return msg;
  return "I couldn't complete that meeting request yet. Please try again.";
};

const runIntent = async ({ userId, userEmail, intent, timezone, settings, state }) => {
  let result;
  try {
    result = await executeIntent({
      userId,
      userEmail,
      intent,
      timezone,
    });
  } catch (err) {
    throw new Error(friendlyError(err, settings));
  }

  if (Array.isArray(result.meetings) && /Which meeting did you mean/i.test(String(result.reply || ""))) {
    state.pendingSelection = {
      action: intent.action,
      data: intent.data || {},
      meetings: result.meetings,
    };
  } else {
    state.pendingSelection = null;
  }

  return result;
};

const chatHandler = async (req, res) => {
  try {
    const { prompt, conversationHistory = [], timezone } = req.body;
    const userPrompt = String(prompt || "").trim();
    if (!userPrompt) return respondOk(res, "How can I help with your meetings?");

    const user = await Employee.findById(req.user.id).select("email settings");
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    const effectiveTimezone = timezone || user.settings?.timezone || "UTC";

    const sessionKey = getSessionKey(req.user.id, req.body?.sessionId);
    const state = getSession(sessionKey);

    if (state.pendingConfirmation) {
      if (CONFIRM_NO.test(userPrompt)) {
        state.pendingConfirmation = null;
        return respondOk(res, "Okay, cancelled. Tell me what you want to do next.");
      }
      if (!CONFIRM_YES.test(userPrompt)) {
        return respondOk(res, 'Please reply with "yes" to confirm or "no" to cancel.');
      }

      const pending = state.pendingConfirmation;
      state.pendingConfirmation = null;
      try {
        const result = await runIntent({
          userId: req.user.id,
          userEmail: user.email,
          intent: pending.intent,
          timezone: pending.timezone || effectiveTimezone,
          settings: user.settings,
          state,
        });
        return respondOk(res, result.reply, result);
      } catch (execErr) {
        return respondOk(res, execErr.message || "I couldn't complete that meeting request yet. Please try again.");
      }
    }

    let intent;
    const selectedIdx = Number(userPrompt);
    if (
      Number.isInteger(selectedIdx) &&
      selectedIdx > 0 &&
      state.pendingSelection?.meetings?.length
    ) {
      const selected = state.pendingSelection.meetings[selectedIdx - 1];
      if (!selected?._id) {
        return respondOk(res, "Please reply with a valid meeting number from the list.");
      }
      intent = {
        action: state.pendingSelection.action,
        message: "",
        data: {
          ...(state.pendingSelection.data || {}),
          meetingRef: String(selected._id),
        },
      };
      console.log("[AI] prompt:", userPrompt);
      console.log("[AI] intent-from-selection:", JSON.stringify(intent));
    } else {
      if (Number.isInteger(selectedIdx) && selectedIdx > 0 && !state.pendingSelection?.meetings?.length) {
        return respondOk(res, "I don't have an active meeting list to select from. Ask me to list or find meetings first.");
      }
      console.log("[AI] prompt:", userPrompt);
      intent = await parsePrompt({ prompt: userPrompt, history: conversationHistory, timezone: effectiveTimezone });
    }

    intent = normalizeIntentTime(intent, userPrompt, effectiveTimezone);
    console.log("[AI] intent:", JSON.stringify(intent));

    if (intent.action === "ask_clarification" || intent.action === "no_op") {
      return respondOk(res, intent.message || "Could you share one more detail?");
    }

    if (shouldAskConfirmation(intent, user.settings)) {
      state.pendingConfirmation = { intent, timezone: effectiveTimezone };
      return respondOk(res, summarizeIntent(intent, effectiveTimezone));
    }

    let result;
    try {
      result = await runIntent({
        userId: req.user.id,
        userEmail: user.email,
        intent,
        timezone: effectiveTimezone,
        settings: user.settings,
        state,
      });
    } catch (err) {
      console.error("[AI] execute error:", err?.message || err);
      return respondOk(res, err?.message || "I couldn't complete that meeting request yet. Please try again.");
    }
    console.log("[AI] executed:", intent.action);
    return respondOk(res, result.reply, result);
  } catch (err) {
    const isRateLimit =
      err?.status === 429 ||
      err?.error?.code === "rate_limit_exceeded" ||
      (typeof err?.message === "string" && err.message.includes("rate_limit_exceeded"));
    if (isRateLimit) return res.status(429).json({ success: false, code: "rate_limit" });
    console.error("[AI] controller error:", err?.message || err);
    return respondOk(res, friendlyError(err, {}));
  }
};

module.exports = { chatHandler };
