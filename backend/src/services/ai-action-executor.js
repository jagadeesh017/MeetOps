const meetingOps = require("./meeting-operations");

const executeSchedule = async (userId, userEmail, action) => {
  const parsedTime = meetingOps.parseTime(action.time, action.timezone);
  if (!parsedTime) throw new Error("invalid_time");

  const meeting = await meetingOps.createMeeting(userId, userEmail, {
    title: action.title || "meeting",
    attendees: action.attendees || [],
    platform: action.platform || "zoom",
    duration: action.duration || 60,
    description: "",
    parsedTime,
  });

  return { type: "schedule", meeting };
};

const executeDelete = async (userId, userEmail, action) => {
  const now = new Date();
  const rawMatches = await meetingOps.findMeetingsBySearch(action.meetingRef, userEmail, true, action.timezone);
  const matches = (rawMatches || []).filter((m) => new Date(m.startTime) > now);

  if (!matches.length) throw new Error("meeting_not_found");
  if (matches.length > 1) return { type: "select_delete", meetings: matches };

  const deleted = await meetingOps.deleteMeeting(matches[0]._id, userId, userEmail);
  return { type: "delete", meeting: deleted };
};

const executeUpdate = async (userId, userEmail, action) => {
  const now = new Date();
  let matches = await meetingOps.findMeetingsBySearch(action.meetingRef, userEmail, true, action.timezone);

  if (!matches.length && action.title) {
    matches = await meetingOps.findMeetingsBySearch(action.title, userEmail, true, action.timezone);
  }
  if (!matches.length && action.attendees?.length) {
    matches = await meetingOps.findMeetingsBySearch(`with ${action.attendees.join(" ")}`, userEmail, true, action.timezone);
  }

  matches = (matches || []).filter((m) => new Date(m.startTime) > now);
  if (!matches.length) throw new Error("meeting_not_found");
  if (matches.length > 1) return { type: "select_update", meetings: matches };

  const updateData = {};
  if (action.title) updateData.title = action.title;
  if (action.time) {
    const parsedTime = meetingOps.parseTime(action.time, action.timezone);
    if (!parsedTime) throw new Error("invalid_time");
    updateData.parsedTime = parsedTime;
  }
  if (action.attendees?.length) updateData.attendees = action.attendees;
  if (action.duration) updateData.duration = action.duration;
  if (!Object.keys(updateData).length) throw new Error("missing_change");

  const updated = await meetingOps.updateMeeting(matches[0]._id, userId, userEmail, updateData);
  return { type: "update", meeting: updated };
};

const executeSlots = async (userEmail, action) => {
  let emails = [userEmail];
  if (action.attendees?.length) {
    try {
      emails = await meetingOps.resolveAttendees(action.attendees);
    } catch (_) {
      emails = [userEmail];
    }
  }

  const startDate = action.time ? meetingOps.parseTime(action.time, action.timezone || "UTC") : null;
  const slots = await meetingOps.suggestTimeSlots(emails, action.timezone || "UTC", 5, startDate || null);

  return {
    type: "slots",
    slots: slots.map((s) => ({
      time: s.toISOString(),
      formatted: s.toLocaleString("en-US", { timeZone: action.timezone || "UTC" }),
    })),
  };
};

const runAction = async (userId, userEmail, action) => {
  if (action.type === "schedule") return executeSchedule(userId, userEmail, action);
  if (action.type === "update") return executeUpdate(userId, userEmail, action);
  if (action.type === "delete") return executeDelete(userId, userEmail, action);
  if (action.type === "slots") return executeSlots(userEmail, action);
  return null;
};

module.exports = {
  runAction,
};
