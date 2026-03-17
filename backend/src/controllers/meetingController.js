const Meeting = require("../models/meeting");
const Employee = require("../models/employee");
const meetingOperations = require("../services/operations");
const { checkAttendeesConflicts } = require("../services/conflicts");

const resolveAuthEmail = async (req) => {
  if (req.user?.email) return req.user.email;
  if (!req.user?.id) return null;
  const user = await Employee.findById(req.user.id);
  return user?.email || null;
};

const mapAttendeeBusy = (busy = [], attendees = []) => {
  const byEmail = new Map((attendees || []).map((a) => [a.email, a.name || a.email]));
  return busy.map((b) => ({
    email: b.email,
    name: byEmail.get(b.email) || b.email,
    conflictStart: b.conflictStart,
    conflictEnd: b.conflictEnd,
    conflictStartTime: new Date(b.conflictStart).toLocaleString(),
    conflictEndTime: new Date(b.conflictEnd).toLocaleString(),
  }));
};

const toSchedulingErrorResponse = (err) => {
  if (err?.message === "outside_working_hours") {
    return {
      status: 400,
      body: {
        message: "Selected time is outside organizer working hours.",
        error: err.message,
        code: "organizer_outside_working_hours",
        unavailabilityType: "organizer_working_hours",
      },
    };
  }

  if (err?.code === "attendees_busy") {
    return {
      status: 409,
      body: {
        message: "Some attendees are unavailable for this time slot.",
        error: err.message,
        code: "attendees_busy",
        unavailabilityType: "attendees_busy",
        busyAttendees: err.busyAttendees || [],
      },
    };
  }

  if (err?.code === "organizer_busy") {
    return {
      status: 409,
      body: {
        message: err.message,
        error: err.message,
        code: "organizer_busy",
        unavailabilityType: "organizer_busy",
      },
    };
  }

  return null;
};

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

    const authEmail = await resolveAuthEmail(req);
    if (!authEmail) return res.status(401).json({ message: "Unable to resolve authenticated user email" });

    const parsedStart = new Date(startTime);
    const parsedEnd = endTime ? new Date(endTime) : null;
    const duration = parsedEnd ? Math.round((parsedEnd - parsedStart) / 60000) : (Number(req.user.settings?.defaultDurationMinutes) || 30);

    const meeting = await meetingOperations.createMeeting(req.user.id, authEmail, {
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
    const schedulingErr = toSchedulingErrorResponse(err);
    if (schedulingErr) return res.status(schedulingErr.status).json(schedulingErr.body);

    let status = 500;
    if (err.message === "buffer_conflict") status = 409;
    else if (err.message.includes("provide a valid date") || err.message.includes("specify at least one") || err.message.includes("past date")) status = 400;
    else if (err.message.includes("not found")) status = 404;
    return res.status(status).json({ message: err.message, error: err.message });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const authEmail = await resolveAuthEmail(req);
    const userEmail = req.query.userEmail || authEmail;
    if (!userEmail) return res.status(400).json({ message: "userEmail is required" });
    const query = { $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }] };
    const meetings = await Meeting.find(query).sort({ startTime: 1 });
    return res.json(meetings);
  } catch (err) {
    return res.status(500).json({ message: err.message, error: err.message });
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
    if (available) {
      return res.json({ available: true, unavailabilityType: null, busyAttendees: [] });
    }

    const busyAttendeesRaw = await checkAttendeesConflicts(resolvedEmails, [{ startTime: start, endTime: end }]);
    const attendeeObjects = attendees.map((a) => (typeof a === "string" ? { email: a, name: a.split("@")[0] } : a));
    const busyAttendees = mapAttendeeBusy(busyAttendeesRaw, attendeeObjects);

    return res.json({
      available: false,
      unavailabilityType: "attendees_busy",
      busyAttendees,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message, error: err.message });
  }
};

exports.cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const authEmail = await resolveAuthEmail(req);
    if (!authEmail) return res.status(401).json({ message: "Unable to resolve authenticated user email" });
    const result = await meetingOperations.deleteMeeting(meetingId, req.user.id, authEmail);
    return res.json({ success: true, message: "Meeting cancelled", meeting: result });
  } catch (err) {
    let status = 500;
    if (err.message.includes("not found")) status = 404;
    else if (err.message.includes("Only the organizer")) status = 403;
    else if (err.message.includes("cancelled") || err.message.includes("Past meetings")) status = 400;
    else if (err.message.includes("Failed Zoom") || err.message.includes("Failed Google")) status = 502;
    return res.status(status).json({ message: err.message, error: err.message });
  }
};

exports.updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { title, startTime, endTime, description, attendees } = req.body;
    const authEmail = await resolveAuthEmail(req);
    if (!authEmail) return res.status(401).json({ message: "Unable to resolve authenticated user email" });

    const parsedStart = startTime ? new Date(startTime) : null;
    const parsedEnd = endTime ? new Date(endTime) : null;
    const duration = (parsedStart && parsedEnd) ? Math.round((parsedEnd - parsedStart) / 60000) : null;

    const meeting = await meetingOperations.updateMeeting(meetingId, req.user.id, authEmail, {
      title,
      parsedTime: parsedStart,
      duration,
      description,
      attendees
    });

    return res.json({ success: true, message: "Meeting updated", meeting });
  } catch (err) {
    const schedulingErr = toSchedulingErrorResponse(err);
    if (schedulingErr) return res.status(schedulingErr.status).json(schedulingErr.body);

    let status = 500;
    if (err.message.includes("not found")) status = 404;
    else if (err.message.includes("Only the organizer")) status = 403;
    else if (err.message.includes("cancelled") || err.message.includes("Past meetings")) status = 400;
    return res.status(status).json({ message: err.message, error: err.message });
  }
};
