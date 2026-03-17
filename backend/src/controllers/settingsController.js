const Employee = require("../models/employee");

const clampInt = (value, fallback, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const normalizeDays = (days) => {
  if (!Array.isArray(days)) return [1, 2, 3, 4, 5];
  const clean = [...new Set(days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  return clean.length ? clean.sort((a, b) => a - b) : [1, 2, 3, 4, 5];
};

const mergeSettings = (current = {}, input = {}) => ({
  ...current,
  timezone: input.timezone || current.timezone || "Asia/Kolkata",
  defaultPlatform: ["zoom", "google", "meet", "teams"].includes(input.defaultPlatform)
    ? input.defaultPlatform
    : (current.defaultPlatform || "zoom"),
  defaultDurationMinutes: clampInt(input.defaultDurationMinutes, current.defaultDurationMinutes || 30, 15, 180),
  bufferMinutes: clampInt(input.bufferMinutes, current.bufferMinutes || 10, 0, 60),
  workHours: {
    start: input.workHours?.start || current.workHours?.start || "09:00",
    end: input.workHours?.end || current.workHours?.end || "18:00",
    days: normalizeDays(input.workHours?.days || current.workHours?.days),
    availableAllTime: Boolean(input.workHours?.availableAllTime ?? current.workHours?.availableAllTime ?? false),
  },
  ai: {
    autoConfirmBeforeCreate: Boolean(
      input.ai?.autoConfirmBeforeCreate ?? current.ai?.autoConfirmBeforeCreate ?? false
    ),
    includeConflictDetails: Boolean(
      input.ai?.includeConflictDetails ?? current.ai?.includeConflictDetails ?? true
    ),
  },
  notifications: {
    emailRemindersEnabled: Boolean(
      input.notifications?.emailRemindersEnabled ?? current.notifications?.emailRemindersEnabled ?? true
    ),
    reminderMinutesBefore: clampInt(
      input.notifications?.reminderMinutesBefore,
      current.notifications?.reminderMinutesBefore || 15,
      5,
      120
    ),
  },
});

exports.getMySettings = async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id).select("settings");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user.settings || {});
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to fetch settings" });
  }
};

exports.updateMySettings = async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.settings = mergeSettings(user.settings || {}, req.body || {});
    await user.save();
    return res.json({ success: true, settings: user.settings });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update settings" });
  }
};

