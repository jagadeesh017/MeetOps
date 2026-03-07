const { runAction } = require("../services/ai-action-executor");
const Meeting = require("../models/meeting");

const ACTION_MAP = {
  schedule_meeting: "schedule",
  update_meeting: "update",
  cancel_meeting: "delete",
  find_available_slots: "slots",
};

const toActionPayload = (intent = {}, timezone = "UTC") => {
  const data = intent.data || {};
  const isSchedule = intent.action === "schedule_meeting";
  return {
    type: ACTION_MAP[intent.action],
    title: isSchedule ? (data.title || "meeting") : (data.title || null),
    attendees: Array.isArray(data.attendees) ? data.attendees : [],
    time: data.time || null,
    platform: isSchedule ? (data.platform || null) : (data.platform || null),
    duration: isSchedule ? (data.duration || null) : (data.duration || null),
    meetingRef: data.meetingRef || data.meeting_id || null,
    timezone,
  };
};

const toResponse = (result, fallbackMessage = "Done.") => {
  if (!result) return { reply: fallbackMessage };
  const messages = {
    schedule: `Your meeting '${result?.meeting?.title || "meeting"}' has been scheduled.`,
    update: `Your meeting '${result?.meeting?.title || "meeting"}' has been updated.`,
    delete: `Your meeting '${result?.meeting?.title || "meeting"}' has been cancelled.`,
    slots: "Here are the next available time slots.",
    select_update: "Which meeting did you mean? Reply with a number.",
    select_delete: "Which meeting did you mean? Reply with a number.",
  };
  const reply = messages[result.type] || fallbackMessage;
  const payload = {};
  if (result.meeting) payload.meeting = result.meeting;
  if (result.slots) payload.slots = result.slots;
  if (result.meetings) payload.meetings = result.meetings;
  return { reply, ...payload };
};

const executeIntent = async ({ userId, userEmail, intent, timezone }) => {
  if (intent.action === "query_meetings") {
    const scope = String(intent?.data?.scope || "today").toLowerCase();
    const now = new Date();
    const base = {
      $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }],
      status: "scheduled",
      startTime: { $gte: now },
    };
    const allUpcoming = await Meeting.find(base).sort({ startTime: 1 }).limit(20).lean();
    const dayKey = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: timezone || "UTC" });
    const fmt = (d) => new Date(d).toLocaleString("en-US", { timeZone: timezone || "UTC" });

    if (scope === "next") {
      if (!allUpcoming.length) return { reply: "You have no upcoming meetings." };
      const m = allUpcoming[0];
      return { reply: `Your next meeting is "${m.title}" at ${fmt(m.startTime)}.`, meeting: m };
    }

    if (scope === "upcoming") {
      if (!allUpcoming.length) return { reply: "You have no upcoming meetings." };
      return { reply: `You have ${allUpcoming.length} upcoming meeting${allUpcoming.length > 1 ? "s" : ""}.`, meetings: allUpcoming };
    }

    const todayMeetings = allUpcoming.filter((m) => dayKey(m.startTime) === dayKey(now));
    if (!todayMeetings.length) return { reply: "You have no meetings today." };
    if (todayMeetings.length === 1) {
      const m = todayMeetings[0];
      return { reply: `You have 1 meeting today: "${m.title}" at ${fmt(m.startTime)}.`, meetings: todayMeetings };
    }
    return { reply: `You have ${todayMeetings.length} meetings today.`, meetings: todayMeetings };
  }

  if (!ACTION_MAP[intent.action]) return { reply: intent.message || "I can help with meetings only." };
  const action = toActionPayload(intent, timezone);
  const result = await runAction(userId, userEmail, action);
  return toResponse(result, intent.message || "Done.");
};

module.exports = { executeIntent };
