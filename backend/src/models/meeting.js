const mongoose = require("mongoose");

const AttendeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
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

  platform: {
    type: String,
    enum: ["teams", "zoom", "google"],
    default: "teams"
  },
  organizerEmail: {
  type: String,
  required: true
},
  joinUrl: {
    type: String,
    default: ""
  },

  attendees: [AttendeeSchema],

  clusterUsed: {
    type: String,
    default: null
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
  type: String,
  enum: ["scheduled", "cancelled", "completed"],
  default: "scheduled"
}



});

module.exports = mongoose.model("Meeting", MeetingSchema);
