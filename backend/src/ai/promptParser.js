const Groq = require("groq-sdk");
const { systemPrompt } = require("./systemPrompt");

const MODELS = ["openai/gpt-oss-20b","llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
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
  } catch (_) { }
  const fenced = direct.match(/```json\s*([\s\S]*?)```/i) || direct.match(/```([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch (_) { }
  }
  const first = direct.indexOf("{");
  const last = direct.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(direct.slice(first, last + 1));
    } catch (_) { }
  }
  return null;
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
  if (intent.action === "cancel_meeting") {
    return Boolean(
      data.meetingRef ||
      data.meeting_id ||
      data.time ||
      data.title ||
      (Array.isArray(data.attendees) && data.attendees.length)
    );
  }
  if (intent.action === "query_meetings") return true;
  if (intent.action === "find_available_slots") return true;
  return true;
};

const parsePrompt = async ({ prompt, history = [], timezone = "UTC" }) => {
  if (!process.env.GROQ_API_KEY) throw new Error("Missing GROQ_API_KEY. AI Chat is disabled.");

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
        if (!hasRequiredData(parsed)) {
          throw new Error("AI returned incomplete data: " + JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (err) {
      const rateLimit = err?.status === 429 || err?.error?.code === "rate_limit_exceeded";
      if (rateLimit && model !== MODELS[MODELS.length - 1]) continue;
      throw err;
    }
  }

  throw new Error("AI failed to parse prompt.");
};

module.exports = { parsePrompt };
