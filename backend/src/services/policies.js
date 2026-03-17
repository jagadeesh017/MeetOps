const Meeting = require("../models/meeting");
const { DateTime } = require("luxon");

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
  const dt = DateTime.fromJSDate(new Date(dateInput)).setZone(timezone || "UTC");
  return {
    weekday: dt.weekday === 7 ? 0 : dt.weekday, // Luxon: Mon=1, Sun=7. System: Sun=0, Mon=1.
    minuteOfDay: dt.hour * 60 + dt.minute,
  };
};

const readPolicy = (user = {}) => {
  const settings = user.settings || {};
  const availableAllTime = Boolean(settings.workHours?.availableAllTime);
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
    enforceWorkingHours: !availableAllTime && hasExplicitWorkHours,
    availableAllTime,
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
  const start = DateTime.fromJSDate(new Date(startTime));
  const end = DateTime.fromJSDate(new Date(endTime));
  const bufferedStart = start.minus({ minutes: bufferMinutes }).toJSDate();
  const bufferedEnd = end.plus({ minutes: bufferMinutes }).toJSDate();

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
