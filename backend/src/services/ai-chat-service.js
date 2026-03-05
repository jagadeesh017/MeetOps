const Groq = require("groq-sdk");
const Meeting = require("../models/meeting");
const Employee = require("../models/employee");
const Cluster = require("../models/groups");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const formatMeeting = (m, timezone, index) => {
  const names = (m.attendees || []).map((a) => a.name || a.email).join(", ");
  const time = new Date(m.startTime).toLocaleString("en-US", { timeZone: timezone });
  return `[${index + 1}] "${m.title}" | ID:${m._id} | ${time} | ${names || "—"}`;
};

const buildUserContext = async (userEmail, timezone = "UTC") => {
  const now = new Date();
  const userFilter = {
    $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }],
  };

  const [upcoming, past, employees, groups] = await Promise.all([
    Meeting.find({ ...userFilter, status: { $ne: "cancelled" }, startTime: { $gte: now } })
      .sort({ startTime: 1 }).limit(8).lean(),
    Meeting.find({ ...userFilter, startTime: { $lt: now } })
      .sort({ startTime: -1 }).limit(5).lean(),
    Employee.find().select("name email department").limit(25).lean(),
    Cluster.find().select("name").lean(),
  ]);

  const groupSection = groups.length
    ? groups.map((g) => {
        const members = employees
          .filter((e) => e.department && g.name && e.department.toLowerCase().includes(g.name.split(" ")[0].toLowerCase()))
          .map((e) => e.name || e.email);
        return `• ${g.name}${members.length ? " (" + members.join(", ") + ")" : ""}`;
      }).join("\n")
    : "No groups.";

  return {
    upcoming,
    past,
    contextString: `TODAY: ${now.toLocaleString("en-US", { timeZone: timezone })} (${timezone})

UPCOMING MEETINGS (${upcoming.length}):
${upcoming.length ? upcoming.map((m, i) => formatMeeting(m, timezone, i)).join("\n") : "None."}

PAST MEETINGS:
${past.length ? past.map((m, i) => formatMeeting(m, timezone, i)).join("\n") : "None."}

PEOPLE:
${employees.length ? employees.map((e) => `• ${e.name} (${e.email})${e.department ? " — " + e.department : ""}`).join("\n") : "None."}

GROUPS:
${groupSection}`.trim(),
  };
};

const buildSystemPrompt = (context, timezone) => `
You are MeetBot — AI meeting assistant for MeetOps. ONLY handle meeting requests. Anything else → "I only help with meetings."

${context}

TIMEZONE: ${timezone} | DEFAULT PLATFORM: zoom

RULES:

1. Always begin your response with a reasoning block:

<thought>
intent: schedule | update | delete | slots | query
available_data: attendees | time | meetingRef
missing_data: fields still needed
target_meeting: MongoDB _id if known
</thought>

2. If ALL required data is present → immediately emit ACTION. Never ask for confirmation.

3. If required data is missing → ask exactly ONE short question. Do NOT emit ACTION.

4. meetingRef must always be the exact 24-character MongoDB _id provided in context. Never invent IDs.

5. Keep the visible reply to **1–2 short sentences maximum**.

6. If the user replies with a number after a meeting list, map that number to the corresponding meeting ID.

7. If multiple meetings match a request and meetingRef is unclear → ask:
"Which meeting did you mean?"

8. Handle casual language, typos, and short replies like:
"move it", "change it", "cancel it".

Assume these refer to the **most recently referenced meeting**.

9. If the request is unrelated to meetings, reply exactly:
"I only help with meetings."

10. TIME FORMAT:

All actions must use full datetime format:

"Month D, YYYY H:MM AM/PM"

Interpret natural phrases as:

morning → 9:00 AM  
afternoon → 2:00 PM  
evening → 6:00 PM  

11. REQUIRED DATA:

schedule → attendees + time  
update → meetingRef + change  
delete → meetingRef  
slots → optional attendees or date

12. ACTION OUTPUT:

When data is complete, the **final line must contain only the ACTION JSON**.

schedule:
ACTION:{"type":"schedule","title":"...","attendees":["name"],"time":"Month D, YYYY H:MM AM/PM","platform":"zoom","duration":60}

update:
ACTION:{"type":"update","meetingRef":"ID","time":"Month D, YYYY H:MM AM/PM"}

delete:
ACTION:{"type":"delete","meetingRef":"ID"}

slots:
ACTION:{"type":"slots","attendees":["name"],"time":"Month D, YYYY"}`.trim();

const MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

const callGroq = async (messages) => {
  for (const model of MODELS) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 350,
      });
      return response.choices[0].message.content.trim();
    } catch (err) {
      const isRateLimit =
        err.status === 429 ||
        err?.error?.code === "rate_limit_exceeded" ||
        (typeof err.message === "string" && err.message.includes("rate_limit_exceeded"));

      if (isRateLimit && model !== MODELS[MODELS.length - 1]) {
        continue;
      }
      throw err;
    }
  }
};
const ACTION_RE = /ACTION:\s*\{[\s\S]*?\}/gi;

const extractAction = (text) => {
  const matchIdx = text.search(/ACTION:\s*\{/i);
  if (matchIdx === -1) return null;
  const jsonStart = text.indexOf("{", matchIdx);
  let depth = 0;
  for (let i = jsonStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(jsonStart, i + 1));
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
};

const chatWithAI = async ({ userEmail, userMessage, conversationHistory = [], timezone = "UTC" }) => {
  const { contextString, upcoming, past } = await buildUserContext(userEmail, timezone);
  const systemPrompt = buildSystemPrompt(contextString, timezone);

  const history = conversationHistory
    .slice(-6)
    .map((m) => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.type === "bot" ? m.content.replace(ACTION_RE, "").trim() : m.content,
    }));

  const raw = await callGroq([
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ]);

  const withoutThought = raw.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
  const action = extractAction(withoutThought);

  const finalMessage = withoutThought
    .replace(/ACTION:\s*\{[\s\S]*$/i, "")
    .trim() || "I'm not sure how to help with that. Could you rephrase your meeting request?";

  return { message: finalMessage, action, upcoming, past };
};

module.exports = { chatWithAI, buildUserContext };
