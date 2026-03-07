const Meeting = require("../models/meeting");
const Employee = require("../models/employee");
const meetingOperations = require("../services/meeting-operations");

exports.createMeeting = async (req, res) => {
  try {
    const {
      title,
      startTime,
      endTime,
      organizerEmail,
      attendees,
      platform,
      timezone,
      description,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate,
      recurrenceCount,
      ignoreBusy,
    } = req.body;

    const parsedStart = new Date(startTime);
    const parsedEnd = endTime ? new Date(endTime) : null;
    const duration = parsedEnd ? Math.round((parsedEnd - parsedStart) / 60000) : (Number(req.user.settings?.defaultDurationMinutes) || 30);

    const meeting = await meetingOperations.createMeeting(req.user.id, organizerEmail, {
      title,
      attendees,
      platform,
      timezone,
      description,
      parsedTime: parsedStart,
      duration,
      isRecurring,
      recurrencePattern,
      recurrenceEndDate,
      recurrenceCount,
      ignoreBusy
    });

    return res.status(201).json(meeting);
  } catch (err) {
    console.error("Create meeting error:", err);
    return res.status(err.message === "buffer_conflict" ? 409 : 500).json({ error: err.message });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const userEmail = req.query.userEmail || req.user?.email;
    if (!userEmail) return res.status(400).json({ message: "userEmail is required" });
    const query = { $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }] };
    const meetings = await Meeting.find(query).sort({ startTime: 1 });
    return res.json(meetings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.checkAttendeeAvailability = async (req, res) => {
  try {
    const { attendees, startTime, endTime } = req.body;
    if (!attendees || !Array.isArray(attendees)) return res.status(400).json({ message: "Attendees array is required" });

    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = Math.round((end - start) / 60000);

    const resolvedEmails = await meetingOperations.resolveAttendees(attendees);
    const available = await meetingOperations.isTimeAvailable(resolvedEmails, start, duration);

    return res.json({ available });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await meetingOperations.deleteMeeting(meetingId, req.user.id, req.user.email);
    return res.json({ success: true, message: "Meeting cancelled", meeting: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { title, startTime, endTime, description, attendees } = req.body;

    const parsedStart = startTime ? new Date(startTime) : null;
    const parsedEnd = endTime ? new Date(endTime) : null;
    const duration = (parsedStart && parsedEnd) ? Math.round((parsedEnd - parsedStart) / 60000) : null;

    const meeting = await meetingOperations.updateMeeting(meetingId, req.user.id, req.user.email, {
      title,
      parsedTime: parsedStart,
      duration,
      description,
      attendees
    });

    return res.json({ success: true, message: "Meeting updated", meeting });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
