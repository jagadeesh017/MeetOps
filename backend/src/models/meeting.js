const mongoose = require("mongoose");

const AttendeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: true }
  },
  { _id: false }
);

const MeetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },

  startTime: {
    type: Date,
    required: true
  },

  endTime: {
    type: Date,
    required: true
  },

  organizerEmail: {
    type: String,
    required: true
  },

  platform: {
    type: String,
    enum: ["zoom", "meet", "google", "teams"],
    default: "zoom",
    required: false
  },

  joinUrl: {
    type: String,
    default: ""
  },

  externalId: {
    type: String,
    default: null,
    required: false
  },

  attendees: {
    type: [AttendeeSchema],
    default: []
  },

  timezone: {
    type: String,
    default: "IST"
  },

  description: {
    type: String,
    default: ""
  },

  isRecurring: {
    type: Boolean,
    default: false
  },

  recurrencePattern: {
    type: String,
    enum: ["daily", "weekly", "monthly", null],
    default: null,
    required: false
  },

  recurrenceEndDate: {
    type: Date,
    default: null,
    required: false
  },

  recurrenceCount: {
    type: Number,
    default: null,
    required: false
  },

  seriesId: {
    type: String,
    default: null,
    required: false
  },

  clusterUsed: {
    type: String,
    default: null,
    required: false
  },

  status: {
    type: String,
    enum: ["scheduled", "cancelled", "completed"],
    default: "scheduled"
  },

  cancelledAt: {
    type: Date,
    default: null
  },

  cancelledBy: {
    type: String,
    default: null
  },


  createdAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: null
  }
});

MeetingSchema.index({ startTime: 1, endTime: 1 });
MeetingSchema.index({ organizerEmail: 1 });
MeetingSchema.index({ "attendees.email": 1 });

module.exports = mongoose.model("Meeting", MeetingSchema);
