const Meeting = require("../models/meeting");

const defaultSettings = {
  timezone: "UTC",
  bufferMinutes: 0,
  workHours: { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
};

const parseHm = (value, fallback) => {
  const src = String(value || fallback || "09:00");
  const m = src.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return parseHm(fallback || "09:00", "09:00");
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + mm;
};

const partsInTimezone = (dateInput, timezone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(dateInput));
  const pick = (type) => parts.find((p) => p.type === type)?.value || "";
  const h = Number(pick("hour")) === 24 ? 0 : Number(pick("hour"));
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: dayMap[pick("weekday")] ?? 0,
    minuteOfDay: h * 60 + Number(pick("minute")),
  };
};

const readPolicy = (user = {}) => {
  const settings = user.settings || {};
  const hasExplicitWorkHours = Boolean(settings?.workHours && (
    settings.workHours.start || settings.workHours.end || (Array.isArray(settings.workHours.days) && settings.workHours.days.length)
  ));
  const hasExplicitBuffer = settings?.bufferMinutes !== undefined && settings?.bufferMinutes !== null;
  const timezone = settings.timezone || defaultSettings.timezone;
  const bufferMinutes = Number.isFinite(Number(settings.bufferMinutes))
    ? Math.max(0, Math.min(60, Number(settings.bufferMinutes)))
    : defaultSettings.bufferMinutes;
  const days = Array.isArray(settings.workHours?.days) && settings.workHours.days.length
    ? [...new Set(settings.workHours.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : defaultSettings.workHours.days;
  return {
    timezone,
    bufferMinutes: hasExplicitBuffer ? bufferMinutes : 0,
    enforceWorkingHours: hasExplicitWorkHours,
    workStartMinute: parseHm(settings.workHours?.start, defaultSettings.workHours.start),
    workEndMinute: parseHm(settings.workHours?.end, defaultSettings.workHours.end),
    workDays: days,
  };
};

const assertWithinWorkingPolicy = ({ startTime, endTime, user }) => {
  const policy = readPolicy(user);
  if (!policy.enforceWorkingHours) return;
  const start = partsInTimezone(startTime, policy.timezone);
  const end = partsInTimezone(endTime, policy.timezone);

  if (!policy.workDays.includes(start.weekday)) {
    throw new Error("outside_working_hours");
  }
  if (!policy.workDays.includes(end.weekday)) {
    throw new Error("outside_working_hours");
  }
  if (start.minuteOfDay < policy.workStartMinute || end.minuteOfDay > policy.workEndMinute) {
    throw new Error("outside_working_hours");
  }
};

const hasBufferConflict = async ({ email, startTime, endTime, bufferMinutes, excludeMeetingId = null }) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const bufferedStart = new Date(start.getTime() - bufferMinutes * 60000);
  const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60000);

  const q = {
    status: { $ne: "cancelled" },
    ...(excludeMeetingId ? { _id: { $ne: excludeMeetingId } } : {}),
    startTime: { $lt: bufferedEnd },
    endTime: { $gt: bufferedStart },
    $or: [{ organizerEmail: email }, { "attendees.email": email }],
  };
  const conflict = await Meeting.findOne(q).select("_id title startTime endTime");
  return Boolean(conflict);
};

module.exports = {
  readPolicy,
  assertWithinWorkingPolicy,
  hasBufferConflict,
};
