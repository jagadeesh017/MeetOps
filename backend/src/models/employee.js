const mongoose = require('mongoose');

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  defaultPlatform: 'zoom',
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
  workHours: { start: '9:00', end: '19:00', days: [1, 2, 3, 4, 5], availableAllTime: false },
  ai: { autoConfirmBeforeCreate: false, includeConflictDetails: true },
  notifications: { emailRemindersEnabled: false, reminderMinutesBefore: 15 },
};

const EmployeeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  empId: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  department: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },

  googleRefreshToken: { type: String, default: null },
  googleAccessToken: { type: String, default: null },
  googleConnected: { type: Boolean, default: false },
  googleEmail: { type: String, default: null },

  zoomRefreshToken: { type: String, default: null },
  zoomAccessToken: { type: String, default: null },
  zoomConnected: { type: Boolean, default: false },
  zoomEmail: { type: String, default: null },

  // Auth refresh token (hashed)
  refreshToken: { type: String, default: null },

  settings: {
    timezone: { type: String, default: DEFAULT_SETTINGS.timezone },
    defaultPlatform: { type: String, enum: ['zoom', 'google', 'meet', 'teams'], default: DEFAULT_SETTINGS.defaultPlatform },
    defaultDurationMinutes: { type: Number, default: DEFAULT_SETTINGS.defaultDurationMinutes },
    bufferMinutes: { type: Number, default: DEFAULT_SETTINGS.bufferMinutes },
    workHours: {
      start: { type: String, default: DEFAULT_SETTINGS.workHours.start },
      end: { type: String, default: DEFAULT_SETTINGS.workHours.end },
      days: { type: [Number], default: DEFAULT_SETTINGS.workHours.days },
      availableAllTime: { type: Boolean, default: DEFAULT_SETTINGS.workHours.availableAllTime },
    },
    ai: {
      autoConfirmBeforeCreate: { type: Boolean, default: DEFAULT_SETTINGS.ai.autoConfirmBeforeCreate },
      includeConflictDetails: { type: Boolean, default: DEFAULT_SETTINGS.ai.includeConflictDetails },
    },
    notifications: {
      emailRemindersEnabled: { type: Boolean, default: DEFAULT_SETTINGS.notifications.emailRemindersEnabled },
      reminderMinutesBefore: { type: Number, default: DEFAULT_SETTINGS.notifications.reminderMinutesBefore },
    },
  },
});

module.exports = mongoose.model('Employee', EmployeeSchema);
