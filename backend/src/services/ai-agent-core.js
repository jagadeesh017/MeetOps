const chrono = require("chrono-node");

const INTENT_SCHEMAS = {
  schedule: { required: ["attendees", "time", "title"] },
  update: { required: ["meetingRef", "change"] },
  delete: { required: ["meetingRef"] },
  slots: { required: ["time"] },
  query: { required: [] },
};

const FIELD_PROMPTS = {
  title: {
    question: "What should the meeting title be?",
    reminder: "I still need the meeting title before I can schedule it.",
  },
  attendees: {
    question: "Who should attend the meeting?",
    reminder: "I still need attendee names before I can continue.",
  },
  time: {
    question: "What time should I schedule it?",
    reminder: "I still need the meeting time before I can continue.",
  },
  meetingRef: {
    question: "Which meeting should I use?",
    reminder: "I still need the target meeting reference before I can continue.",
  },
  change: {
    question: "What should I change for that meeting?",
    reminder: "I still need to know what should change for that meeting.",
  },
  slotDate: {
    question: "Which day should I check for available time slots?",
    reminder: "I still need the day to check available slots.",
  },
  slotAttendees: {
    question: 'Any specific attendees to include? You can say names, emails, or say "all".',
    reminder: 'I can check slots for specific people, or for everyone. You can say "all".',
  },
};

const emptyState = () => ({
  intent: null,
  title: null,
  titleProvided: false,
  attendees: [],
  time: null,
  platform: "zoom",
  duration: 60,
  meetingRef: null,
  lastMeetingRef: null,
  pendingMeetings: null,
  lastAskedField: null,
  lastAskedIntent: null,
  slotsAskedAttendees: false,
  updateAttendeesProvided: false,
});

const normalizePlatform = (value) => {
  if (!value) return "zoom";
  const p = String(value).toLowerCase().trim();
  if (["google", "google meet", "gmeet", "meet", "google_meet"].includes(p)) return "google";
  if (p.includes("google") && p.includes("meet")) return "google";
  return p.includes("zoom") ? "zoom" : "zoom";
};

const dedupe = (values = []) => {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
};

const humanList = (items = []) => {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const toActionDateTime = (date, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const pick = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${pick("month")} ${pick("day")}, ${pick("year")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`.trim();
};

const normalizeUserText = (text = "") => {
  let normalized = String(text || "");
  normalized = normalized.replace(/\b(\d{1,2})\.(\d{1,2})\s*(am|pm)\b/gi, (_, h, m, ap) => {
    const minutes = m.length === 1 ? `0${m}` : m;
    return `${h}:${minutes} ${ap}`;
  });
  return normalized;
};

const detectIntent = (text, currentIntent = null) => {
  const input = String(text || "").toLowerCase();

  if (/\b(cancel|delete|remove|drop)\b/.test(input)) return "delete";
  if (/\b(reschedule|move|change|update|postpone|shift)\b/.test(input)) return "update";
  if (/\b(available(?:\s+\w+){0,2}\s+slots?|free(?:\s+\w+){0,2}\s+slots?|availability|find(?:\s+\w+){0,2}\s+slots?)\b/.test(input)) return "slots";
  if (/\b(schedule|book|arrange|set\s*up|create)\b/.test(input)) return "schedule";
  if (/\b(next\s+meeting|upcoming\s+meetings?|what\s+meetings|list\s+meetings|when\s+is\s+my)\b/.test(input)) return "query";

  return currentIntent;
};

const parseDuration = (text) => {
  const m = String(text || "").match(/\bfor\s+(\d{1,3})\s*(minute|minutes|min|hour|hours|hr|hrs)\b/i);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return /^h|hr/i.test(m[2]) ? amount * 60 : amount;
};

const extractTime = (message, timezone) => {
  const parsed = chrono.parse(String(message || ""), new Date(), { forwardDate: true });
  const first = parsed[0];
  if (!first) return { time: null, rawText: null };
  return {
    time: toActionDateTime(first.start.date(), timezone),
    rawText: first.text,
  };
};

const parseAttendeesFromPatterns = (message) => {
  const chunks = [];
  const patterns = [
    /\bwith\s+([^.!?]+?)(?=\b(?:tomorrow|today|next|this|on|at|in|by|for|around|from|to)\b|$)/gi,
    /\binvite\s+([^.!?]+?)(?=\b(?:tomorrow|today|next|this|on|at|in|by|for|around|from|to)\b|$)/gi,
    /\badd\s+([^.!?]+?)(?=\b(?:tomorrow|today|next|this|on|at|in|by|for|around|from|to)\b|$)/gi,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(message)) !== null) {
      if (m[1]) chunks.push(m[1]);
    }
  }

  return chunks
    .flatMap((chunk) => chunk.split(/,|\band\b|&/i))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/^\s*(the|a|an)\s+/i, "").trim())
    .map((value) => value.replace(/\b(team|group)\b$/i, "").trim())
    .filter(Boolean)
    .filter((value) => !/^me$|^myself$/i.test(value));
};

const parseAttendeesFromEmployeeContext = (message, employees = []) => {
  const found = [];
  const lower = String(message || "").toLowerCase();

  for (const emp of employees) {
    const fullName = String(emp.name || "").trim();
    if (!fullName) continue;

    const firstName = fullName.split(/\s+/)[0];
    const escapedFull = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedFirst = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fullRegex = new RegExp(`\\b${escapedFull}\\b`, "i");
    const firstRegex = firstName.length >= 3 ? new RegExp(`\\b${escapedFirst}\\b`, "i") : null;

    if (fullRegex.test(lower) || (firstRegex && firstRegex.test(lower))) {
      found.push(firstName || fullName);
    }
  }

  return found;
};

const extractAttendees = (message, employees = []) => {
  const byPattern = parseAttendeesFromPatterns(message);
  const byContext = parseAttendeesFromEmployeeContext(message, employees);
  const byEmail = (String(message || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase());
  return dedupe([...byPattern, ...byContext, ...byEmail]);
};

const extractMeetingRef = (message, intent) => {
  const text = String(message || "");
  const idMatch = text.match(/\b[0-9a-fA-F]{24}\b/);
  if (idMatch) return idMatch[0];
  if ((intent === "update" || intent === "delete") && /\b(it|this|that)\b/i.test(text)) return "it";

  const quoted = text.match(/["']([^"']{2,})["']/);
  if (quoted?.[1]) return quoted[1].trim();

  return null;
};

const extractTitle = (message, intent, timeRawText, attendees = []) => {
  if (intent !== "schedule") return { title: null, titleProvided: false };

  let working = String(message || "");
  if (timeRawText) working = working.replace(timeRawText, " ");

  working = working
    .replace(/\b(in|on|via)\s+(google\s+meet|gmeet|zoom|google)\b/gi, " ")
    .replace(/\bfor\s+\d{1,3}\s*(minute|minutes|min|hour|hours|hr|hrs)\b/gi, " ")
    .replace(/^(please\s+)?(can\s+you\s+)?(schedule|book|arrange|set\s*up|create)\s+/i, "")
    .replace(/^\s*(a|an|the)\s+/i, "")
    .trim();

  if (attendees.length) working = working.replace(/\bwith\s+[^.!?]+$/i, " ").trim();

  const cleaned = working.replace(/\s+/g, " ").trim();
  if (!cleaned) return { title: null, titleProvided: false };
  if (/^(meeting|meet|a\s+meet|a\s+meeting)$/i.test(cleaned)) return { title: null, titleProvided: false };

  return { title: cleaned, titleProvided: true };
};

const extractMeetingEntities = ({ message, timezone, employees = [], currentIntent = null }) => {
  const text = normalizeUserText(String(message || "").trim());
  const intent = detectIntent(text, currentIntent);
  const { time, rawText } = extractTime(text, timezone);
  const attendees = extractAttendees(text, employees);
  const meetingRef = extractMeetingRef(text, intent);
  const duration = parseDuration(text);
  const platform = /\b(google\s+meet|gmeet|google)\b/i.test(text)
    ? "google"
    : /\bzoom\b/i.test(text)
      ? "zoom"
      : null;
  const titleInfo = extractTitle(text, intent, rawText, attendees);
  const attendeesAsChange = /\b(add|include|invite|remove|drop|replace)\b/i.test(text) && attendees.length > 0;

  let normalizedMeetingRef = meetingRef;
  if (!normalizedMeetingRef && intent === "update") {
    if (attendees.length) normalizedMeetingRef = `with ${attendees.join(" ")}`;
    else if (titleInfo.title) normalizedMeetingRef = titleInfo.title;
  }

  const selection = text.match(/^\s*(\d{1,2})\s*$/);

  return {
    type: intent,
    title: intent === "schedule" ? (titleInfo.title || "meeting") : titleInfo.title,
    titleProvided: titleInfo.titleProvided,
    attendees,
    time,
    platform: intent === "schedule" ? normalizePlatform(platform || "zoom") : platform,
    duration: intent === "schedule" ? (duration || 60) : duration,
    meetingRef: normalizedMeetingRef,
    selectionIndex: selection ? Number(selection[1]) : null,
    attendeesAsChange,
  };
};

const resetForIntent = (state, intent) => {
  if (!intent || state.intent === intent) return state;
  return {
    ...emptyState(),
    intent,
    lastMeetingRef: state.lastMeetingRef || null,
  };
};

const mergeState = (state, entities) => {
  const merged = { ...state };

  if (entities.type) merged.intent = entities.type;
  if (entities.titleProvided && entities.title) merged.title = entities.title;
  else if (!merged.title && entities.type === "schedule" && entities.title) merged.title = entities.title;
  if (entities.titleProvided) merged.titleProvided = true;
  if (entities.time) merged.time = entities.time;
  if (entities.platform) merged.platform = normalizePlatform(entities.platform);
  if (entities.duration) merged.duration = entities.duration;
  if (entities.meetingRef) merged.meetingRef = entities.meetingRef;
  if (entities.attendees?.length) merged.attendees = dedupe([...(merged.attendees || []), ...entities.attendees]);
  if (entities.attendeesAsChange) merged.updateAttendeesProvided = true;

  return merged;
};

const getMissingField = (state) => {
  if (!state.intent) return null;
  const schema = INTENT_SCHEMAS[state.intent];
  if (!schema) return null;

  for (const field of schema.required) {
    if (field === "attendees" && !state.attendees?.length) return "attendees";
    if (field === "time" && !state.time) return "time";
    if (field === "title" && !state.titleProvided) return "title";
    if (field === "meetingRef" && !state.meetingRef) return "meetingRef";
    if (field === "change") {
      const hasChange = Boolean(state.time) || Boolean(state.title) || Boolean(state.updateAttendeesProvided);
      if (!hasChange) return "change";
    }
  }

  return null;
};

const questionForMissing = (field) => FIELD_PROMPTS[field]?.question || "Could you share one more detail?";
const reminderForMissing = (field) => FIELD_PROMPTS[field]?.reminder || "I still need one more detail to continue.";

const hasMeaningfulNewData = (entities, previousIntent) =>
  Boolean(
    (entities.type && entities.type !== previousIntent) ||
    entities.titleProvided ||
    entities.time ||
    entities.meetingRef ||
    entities.duration ||
    entities.platform ||
    entities.selectionIndex ||
    (entities.attendees && entities.attendees.length)
  );

const isAllKeyword = (text = "") => /^(all|everyone|anyone|none|no one|just me|myself)$/i.test(String(text).trim());

const evaluateSlotsFlow = ({ state, entities, userPrompt, prevIntent }) => {
  if (state.intent !== "slots") return { state, reply: null };

  const next = { ...state };

  if (!next.time) {
    const field = "slotDate";
    const repeated = next.lastAskedField === field && next.lastAskedIntent === next.intent && !hasMeaningfulNewData(entities, prevIntent);
    next.lastAskedField = field;
    next.lastAskedIntent = next.intent;
    return { state: next, reply: repeated ? reminderForMissing(field) : questionForMissing(field) };
  }

  if (isAllKeyword(userPrompt)) {
    next.attendees = [];
    next.slotsAskedAttendees = true;
    next.lastAskedField = null;
    next.lastAskedIntent = null;
    return { state: next, reply: null };
  }

  if (entities.attendees?.length) {
    next.slotsAskedAttendees = true;
    next.lastAskedField = null;
    next.lastAskedIntent = null;
    return { state: next, reply: null };
  }

  if (!next.slotsAskedAttendees) {
    const field = "slotAttendees";
    next.slotsAskedAttendees = true;
    next.lastAskedField = field;
    next.lastAskedIntent = next.intent;
    return { state: next, reply: questionForMissing(field) };
  }

  next.attendees = [];
  next.lastAskedField = null;
  next.lastAskedIntent = null;
  return { state: next, reply: null };
};

const buildAction = (state, timezone) => ({
  type: state.intent,
  title: state.intent === "schedule" ? (state.title || "meeting") : state.title,
  attendees: state.intent === "update"
    ? (state.updateAttendeesProvided ? (state.attendees || []) : [])
    : (state.attendees || []),
  time: state.time,
  platform: normalizePlatform(state.platform || "zoom"),
  duration: state.duration || 60,
  meetingRef: state.meetingRef,
  timezone,
});

const buildClarificationReply = (state) => {
  if (state.lastAskedField) return reminderForMissing(state.lastAskedField);
  if (!state.intent) return "I can help schedule, reschedule, cancel, or find free slots. What would you like to do?";
  const missing = getMissingField(state);
  if (missing) return reminderForMissing(missing);
  if (state.intent === "slots" && !state.time) return reminderForMissing("slotDate");
  return "I can continue from here. Share one more detail and I'll proceed.";
};

const formatMeetingTime = (value, timezone) => {
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) return String(value || "");
  return toActionDateTime(asDate, timezone);
};

const confirmationMessage = (resultType, action, meeting, timezone) => {
  if (resultType === "schedule") {
    const names = humanList((action.attendees || []).map((a) => a[0]?.toUpperCase() + a.slice(1)));
    return `Your meeting '${action.title || "meeting"}' with ${names} has been scheduled for ${formatMeetingTime(meeting?.startTime || action.time, timezone)}.`;
  }
  if (resultType === "update") {
    return `Your meeting '${meeting?.title || action.title || "meeting"}' has been updated to ${formatMeetingTime(meeting?.startTime || action.time, timezone)}.`;
  }
  if (resultType === "delete") {
    return `Your meeting '${meeting?.title || "meeting"}' has been cancelled.`;
  }
  if (resultType === "slots") return "Here are the next available time slots.";
  return "Done.";
};

const friendlyActionError = (err, intent) => {
  const message = String(err?.message || "");

  const directRules = [
    { when: () => message.includes("Google account is not connected"), text: "I couldn't schedule this yet because your Google account is not connected. Please connect it in Integrations." },
    { when: () => message.includes("Zoom account is not connected"), text: "I couldn't schedule this yet because your Zoom account is not connected. Please connect it in Integrations." },
    { when: () => message.includes("Zoom token refresh failed") || message.includes("Zoom access token expired and no refresh token"), text: "I couldn't reach Zoom because your Zoom session expired. Please reconnect Zoom in Integrations, then try cancelling again." },
    { when: () => message === "invalid_time", text: "I couldn't parse that time. What time should it be?" },
    { when: () => message.includes("Cannot schedule meeting for past date or time"), text: "That time is in the past. Please share a future date and time." },
    { when: () => message === "missing_change", text: "I can update it once you tell me what should change." },
    { when: () => message.includes("conflicting meeting"), text: "That time conflicts with another meeting. What time should I schedule it instead?" },
    { when: () => message.includes("Please provide a valid date and time"), text: "I couldn't parse the meeting time. What time should I schedule it?" },
    { when: () => message.includes("Please specify at least one attendee"), text: "Who should attend the meeting?" },
    { when: () => message.includes("Failed to create Zoom meeting"), text: "I couldn't create the Zoom meeting right now. Do you want me to try another time or use Google Meet?" },
    { when: () => message.includes("Failed to create Google Meet"), text: "I couldn't create the Google Meet right now. Do you want me to try again or use Zoom?" },
  ];

  const rule = directRules.find((r) => r.when());
  if (rule) return rule.text;

  if (message === "meeting_not_found") {
    return intent === "delete"
      ? "I couldn't find that meeting to cancel. Which meeting should I cancel?"
      : "I couldn't find that meeting to update. Which meeting should I update?";
  }

  if (message.includes("not found. Use a person name, email, or group name")) {
    const unknown = message.match(/"([^"]+)"/)?.[1];
    return unknown
      ? `I couldn't find \"${unknown}\" in your employee or group list. Who should attend? You can share a full name or email.`
      : "I couldn't resolve one of the attendees. Who should attend? You can share a full name or email.";
  }

  return "I couldn't complete that meeting request yet. Could you share one more detail?";
};

module.exports = {
  emptyState,
  normalizePlatform,
  normalizeUserText,
  extractMeetingEntities,
  resetForIntent,
  mergeState,
  getMissingField,
  questionForMissing,
  reminderForMissing,
  hasMeaningfulNewData,
  isAllKeyword,
  evaluateSlotsFlow,
  buildAction,
  buildClarificationReply,
  confirmationMessage,
  friendlyActionError,
};
