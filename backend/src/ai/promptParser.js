const Groq = require("groq-sdk");
const chrono = require("chrono-node");
const { systemPrompt } = require("./systemPrompt");

const MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
let groq = null;
const getClient = () => {
  if (groq) return groq;
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("missing_groq_api_key");
  groq = new Groq({ apiKey: key });
  return groq;
};

const parseJson = (text = "") => {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch (_) {}
  const fenced = direct.match(/```json\s*([\s\S]*?)```/i) || direct.match(/```([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) {}
  }
  const first = direct.indexOf("{");
  const last = direct.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(direct.slice(first, last + 1));
    } catch (_) {}
  }
  return null;
};

const unique = (arr = []) => [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];

const fallbackParse = (prompt = "") => {
  const text = String(prompt || "").trim();
  const lower = text.toLowerCase();
  const datePhrase = text.match(/\b(today|tomorrow|on\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+|on\s+[a-z]+\s+\d{1,2}(?:st|nd|rd|th)?)\b/i)?.[0] || null;
  const timePhrase = text.match(/\b(at\s+\d{1,2}(?::\d{1,2})?\s*(?:am|pm))\b/i)?.[0] || null;
  const parsedTimes = chrono.parse(text, new Date(), { forwardDate: true });
  const bestTime = parsedTimes
    .slice()
    .sort((a, b) => {
      const aHasHour = a.start?.isCertain?.("hour") ? 1 : 0;
      const bHasHour = b.start?.isCertain?.("hour") ? 1 : 0;
      if (bHasHour !== aHasHour) return bHasHour - aHasHour;
      return (b.text?.length || 0) - (a.text?.length || 0);
    })[0];
  const time = datePhrase && timePhrase ? `${datePhrase} ${timePhrase}` : bestTime ? bestTime.text : null;
  const platform = /\b(google\s+meet|gmeet|meet)\b/i.test(text) ? "google" : /\bzoom\b/i.test(text) ? "zoom" : null;
  const attendeesRaw = [];
  const withMatch = text.match(/\bwith\s+([^.!?]+?)(?=\b(today|tomorrow|on|at|for|in|by|from|to)\b|$)/i);
  if (withMatch?.[1]) attendeesRaw.push(...withMatch[1].split(/,|\band\b|&/i));
  const attendees = unique(attendeesRaw.map((a) => a.trim().replace(/^\s*(the|a|an)\s+/i, "")));
  const titleMatch = text.match(/\bfor\s+([^.!?]+?)(?=\b(today|tomorrow|on|at|in|by|from|to)\b|$)/i);
  const title = titleMatch?.[1] ? titleMatch[1].trim() : null;
  const idMatch = text.match(/\b[0-9a-fA-F]{24}\b/);
  const meetingRef = idMatch ? idMatch[0] : attendees.length ? `with ${attendees.join(" ")}` : null;

  if (/\b(what meetings do i have today|meetings today|today's meetings|todays meetings)\b/i.test(lower)) {
    return { action: "query_meetings", message: "Checking your meetings for today.", data: { scope: "today" } };
  }
  if (/\b(next meeting|when is my next meeting)\b/i.test(lower)) {
    return { action: "query_meetings", message: "Checking your next meeting.", data: { scope: "next" } };
  }
  if (/\b(upcoming meetings|list meetings|what meetings do i have)\b/i.test(lower)) {
    return { action: "query_meetings", message: "Checking your upcoming meetings.", data: { scope: "upcoming" } };
  }

  if (/\b(slots?|availability|available|free time|free slots?)\b/i.test(lower)) {
    return { action: "find_available_slots", message: "Checking available slots.", data: { attendees, time } };
  }
  if (/\b(cancel|delete|remove|drop)\b/i.test(lower)) {
    return { action: "cancel_meeting", message: "Cancelling the meeting.", data: { meetingRef, attendees, time } };
  }
  if (/\b(reschedule|move|change|update|postpone|shift)\b/i.test(lower)) {
    return { action: "update_meeting", message: "Updating the meeting.", data: { meetingRef, attendees, time, title } };
  }
  if (/\b(schedule|book|arrange|set\s*up|create)\b/i.test(lower)) {
    if (!attendees.length) {
      return { action: "ask_clarification", message: "Who should attend the meeting?", data: {} };
    }
    if (!time) {
      return { action: "ask_clarification", message: "What date and time should I schedule it for?", data: { attendees } };
    }
    return { action: "schedule_meeting", message: "Scheduling the meeting.", data: { attendees, time, platform, title: title || "meeting" } };
  }
  return { action: "ask_clarification", message: "Could you rephrase that meeting request?", data: {} };
};

const normalizeIntent = (intent = {}) => {
  const action = String(intent.action || "").trim();
  const data = intent.data && typeof intent.data === "object" ? intent.data : {};
  return { action, message: intent.message || "", data };
};

const hasRequiredData = (intent = {}) => {
  const data = intent.data || {};
  if (intent.action === "schedule_meeting") return Array.isArray(data.attendees) && data.attendees.length > 0 && Boolean(data.time);
  if (intent.action === "update_meeting") return Boolean(data.meetingRef || data.meeting_id || (Array.isArray(data.attendees) && data.attendees.length));
  if (intent.action === "cancel_meeting") return Boolean(data.meetingRef || data.meeting_id || (Array.isArray(data.attendees) && data.attendees.length));
  if (intent.action === "query_meetings") return true;
  if (intent.action === "find_available_slots") return true;
  return true;
};

const parsePrompt = async ({ prompt, history = [], timezone = "UTC" }) => {
  if (!process.env.GROQ_API_KEY) return fallbackParse(prompt);

  const messages = [
    { role: "system", content: `${systemPrompt}\nTIMEZONE:${timezone}` },
    ...history.slice(-8).map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: String(m.content || "") })),
    { role: "user", content: String(prompt || "") },
  ];

  for (const model of MODELS) {
    try {
      const client = getClient();
      const response = await client.chat.completions.create({ model, messages, temperature: 0.1, max_tokens: 220 });
      const raw = response?.choices?.[0]?.message?.content || "";
      const parsed = normalizeIntent(parseJson(raw) || {});
      if (parsed?.action) {
        if (!hasRequiredData(parsed)) return fallbackParse(prompt);
        return parsed;
      }
    } catch (err) {
      const rateLimit = err?.status === 429 || err?.error?.code === "rate_limit_exceeded";
      if (rateLimit && model !== MODELS[MODELS.length - 1]) continue;
      return fallbackParse(prompt);
    }
  }

  return fallbackParse(prompt);
};

module.exports = { parsePrompt };
