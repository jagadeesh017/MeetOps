const meetingOps = require("./meeting-operations");
const { resolveMeetingReference } = require("./meeting-reference-resolver");
const Employee = require("../models/employee");
const { readPolicy } = require("./user-settings-policy");

const normalizePlatform = (platform) => {
  const p = String(platform || "").toLowerCase().trim();
  if (!p) return "zoom";
  if (p.includes("google") || p === "gmeet" || p === "meet") return "google";
  return "zoom";
};

const executeSchedule = async (userId, userEmail, action) => {
  let user = null;
  try { user = await Employee.findById(userId).select("settings"); } catch (_) {}
  const defaultPlatform = user?.settings?.defaultPlatform || "zoom";
  const defaultDuration = Number(user?.settings?.defaultDurationMinutes) || 60;
  const parsedTime = meetingOps.parseTime(action.time, action.timezone || user?.settings?.timezone || "UTC");
  if (!parsedTime) throw new Error("invalid_time");

  const meeting = await meetingOps.createMeeting(userId, userEmail, {
    title: action.title || "meeting",
    attendees: action.attendees || [],
    platform: normalizePlatform(action.platform || defaultPlatform),
    duration: action.duration || defaultDuration,
    description: "",
    parsedTime,
  });

  return { type: "schedule", meeting };
};

const executeDelete = async (userId, userEmail, action) => {
  const resolved = await resolveMeetingReference({ userEmail, action, timezone: action.timezone || "UTC" });
  if (resolved.status === "not_found") throw new Error("meeting_not_found");
  if (resolved.status === "ambiguous") return { type: "select_delete", meetings: resolved.meetings };

  const deleted = await meetingOps.deleteMeeting(resolved.meeting._id, userId, userEmail);
  return { type: "delete", meeting: deleted };
};

const executeUpdate = async (userId, userEmail, action) => {
  const resolved = await resolveMeetingReference({ userEmail, action, timezone: action.timezone || "UTC" });
  if (resolved.status === "not_found") throw new Error("meeting_not_found");
  if (resolved.status === "ambiguous") return { type: "select_update", meetings: resolved.meetings };

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

  const updated = await meetingOps.updateMeeting(resolved.meeting._id, userId, userEmail, updateData);
  return { type: "update", meeting: updated };
};

const executeSlots = async (userId, userEmail, action) => {
  let emails = [userEmail];
  if (action.attendees?.length) {
    try {
      emails = await meetingOps.resolveAttendees(action.attendees);
    } catch (_) {
      emails = [userEmail];
    }
  }

  let user = null;
  try { user = await Employee.findById(userId).select("settings"); } catch (_) {}
  const policy = readPolicy(user || {});
  const startDate = action.time ? meetingOps.parseTime(action.time, action.timezone || "UTC") : null;
  const slots = await meetingOps.suggestTimeSlots(
    emails,
    action.timezone || policy.timezone || "UTC",
    5,
    startDate || null,
    {
      durationMinutes: action.duration || user?.settings?.defaultDurationMinutes || 60,
      ownerEmail: userEmail,
      bufferMinutes: policy.bufferMinutes,
      workDays: policy.workDays,
      workStartMinute: policy.workStartMinute,
      workEndMinute: policy.workEndMinute,
      applyWorkingHours: policy.enforceWorkingHours,
    }
  );

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
  if (action.type === "slots") return executeSlots(userId, userEmail, action);
  return null;
};

module.exports = {
  runAction,
};
