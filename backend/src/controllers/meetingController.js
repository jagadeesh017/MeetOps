const Meeting = require("../models/meeting");
const Employee = require("../models/employee");

const { createZoomMeeting, refreshZoomToken, deleteZoomMeeting, updateZoomMeeting } = require("../services/zoom-service");
const { createGoogleMeetMeeting, deleteGoogleMeetEvent, updateGoogleMeetEvent } = require("../services/google-meet-service");
const { saveAndInvite } = require("../services/meetingService");
const { sendMeetingCancellations, sendMeetingUpdates } = require("../services/email-invite-service");
const { hasConflict, checkAttendeesConflicts } = require("../services/conflictService");
const { generateSlots } = require("../utilities/recurrence");

const DEFAULT_TIMEZONE = "IST";


function normalizeAttendees(raw) {
  if (!Array.isArray(raw)) return [];
  const emailRegex = /\S+@\S+\.\S+/;

  return raw
    .map((a) => {
      if (!a) return null;
      if (typeof a === "string") {
        const email = a.trim().toLowerCase();
        return emailRegex.test(email) ? { email } : null;
      }
      if (typeof a === "object") {
        const email = (a.email || "").trim().toLowerCase();
        if (!emailRegex.test(email)) return null;
        return { email, name: a.name || a.displayName || undefined };
      }
      return null;
    })
    .filter(Boolean)
    .reduce((acc, cur) => {
      if (!acc.find((x) => x.email === cur.email)) acc.push(cur);
      return acc;
    }, []);
}

function buildInvitePayload({ title, startTime, endTime, organizerEmail, attendees, description, joinUrl, platform }) {
  return { title, startTime, endTime, organizerEmail, attendees, description: description || "", joinUrl, platform };
}

async function createMeetingLink(platform, data, user) {
  if (platform === "zoom") {
    if (!user.zoomConnected) return { success: false, error: "Zoom not connected" };

    let result = await createZoomMeeting(data, user.zoomAccessToken, user.zoomRefreshToken);

    if (!result.success && result.status === 401 && user.zoomRefreshToken) {
      const tokens = await refreshZoomToken(user.zoomRefreshToken);
      user.zoomAccessToken = tokens.access_token;
      if (tokens.refresh_token) user.zoomRefreshToken = tokens.refresh_token;
      await user.save();
      result = await createZoomMeeting(data, user.zoomAccessToken, user.zoomRefreshToken);
    }

    return result;
  }

  if (platform === "meet" || platform === "google") {
    if (!user.googleConnected) return { success: false, error: "Google Meet not connected" };

    const result = await createGoogleMeetMeeting(data, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });

    if (result.success && result.newTokens) {
      if (result.newTokens.access_token) user.googleAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.googleRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }

    return result;
  }

  return { success: false, error: `Platform "${platform}" not supported` };
}

async function cancelExternalMeeting(meeting, user) {
  if (!meeting.externalId) return { success: true, skipped: true };

  if (meeting.platform === "zoom") {
    const result = await deleteZoomMeeting(meeting.externalId, user.zoomAccessToken, user.zoomRefreshToken);
    if (result.success && result.newTokens) {
      user.zoomAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }
    return result;
  }

  if (meeting.platform === "google" || meeting.platform === "meet") {
    return deleteGoogleMeetEvent(meeting.externalId, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });
  }

  return { success: true, skipped: true };
}

exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, endTime, organizerEmail, attendees, platform, timezone, description, isRecurring, recurrencePattern, recurrenceEndDate, recurrenceCount, ignoreBusy } = req.body;

    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!title || !startTime || !endTime || !organizerEmail) return res.status(400).json({ message: "Missing required fields" });
    if (title.length > 200) return res.status(400).json({ error: "Title must be 200 characters or less" });

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);
    if (Number.isNaN(newStart.getTime())) return res.status(400).json({ error: "Invalid startTime" });
    if (Number.isNaN(newEnd.getTime())) return res.status(400).json({ error: "Invalid endTime" });
    if (newEnd <= newStart) return res.status(400).json({ error: "endTime must be after startTime" });
    if (newStart <= new Date()) {
      return res.status(400).json({ error: "Cannot schedule meeting for past date or time. Please select a future date and time." });
    }
    if ((newEnd - newStart) > 24 * 60 * 60 * 1000) return res.status(400).json({ error: "Meeting duration cannot exceed 24 hours" });

    const tz = timezone || DEFAULT_TIMEZONE;
    const desc = description || "";
    const safeAttendees = normalizeAttendees(attendees);
    if (safeAttendees.length > 50) return res.status(400).json({ error: "Maximum 50 attendees allowed" });

    const slots = generateSlots(newStart, newEnd, { isRecurring, pattern: recurrencePattern, endDate: recurrenceEndDate, count: recurrenceCount });


    for (const slot of slots) {
      const conflict = await hasConflict(organizerEmail, slot.startTime, slot.endTime);
      if (conflict) {
        return res.status(409).json({ error: "Organizer has a meeting conflict", message: `Busy at ${slot.startTime.toISOString()}`, isBusy: true });
      }
    }

    if (!ignoreBusy && safeAttendees.length > 0) {
      const emails = safeAttendees.map((a) => a.email);
      const busy = await checkAttendeesConflicts(emails, slots);

      if (busy.length > 0) {
        const busyList = busy.map((b) => ({
          email: b.email,
          name: (safeAttendees.find((a) => a.email === b.email) || {}).name || b.email,
          isBusy: true,
          conflictStartTime: new Date(b.conflictStart).toISOString(),
          conflictEndTime: new Date(b.conflictEnd).toISOString(),
        }));
        return res.status(409).json({ error: "Some attendees are busy", busyAttendees: busyList, canProceed: true });
      }
    }

    const seriesId = isRecurring ? `series-${Date.now()}` : null;
    const meetingDocs = [];

    for (const slot of slots) {
      const slotData = { title, startTime: slot.startTime, endTime: slot.endTime, organizerEmail, attendees: safeAttendees, timezone: tz, description: desc };
      const videoResult = await createMeetingLink(platform, slotData, user);
      if (!videoResult.success) return res.status(502).json({ error: videoResult.error });

      meetingDocs.push({
        title,
        organizerEmail,
        attendees: safeAttendees,
        platform,
        timezone: tz,
        description: desc,
        joinUrl: videoResult.meetingUrl,
        externalId: videoResult.meetingId || videoResult.eventId || null,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isRecurring: isRecurring || false,
        recurrencePattern: isRecurring ? recurrencePattern : null,
        recurrenceEndDate: isRecurring && recurrenceEndDate ? new Date(recurrenceEndDate) : null,
        recurrenceCount: isRecurring ? recurrenceCount : null,
        seriesId,
      });
    }

    const invitePayload = buildInvitePayload({ title, startTime: newStart, endTime: newEnd, organizerEmail, attendees: safeAttendees, description: desc, joinUrl: meetingDocs[0].joinUrl, platform });
    const created = await saveAndInvite(meetingDocs, invitePayload);

    if (created.length === 1) {
      return res.status(201).json(created[0]);
    }
    return res.status(201).json({ message: `Created ${created.length} recurring meetings`, meetings: created, seriesId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
    const { attendees, startTime, endTime, excludeMeetingId } = req.body;

    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) return res.status(400).json({ message: "Attendees array is required" });
    if (!startTime || !endTime) return res.status(400).json({ message: "Start and end time required" });

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);
    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) return res.status(400).json({ message: "Invalid date format" });

    const busyAttendees = [];
    for (const attendee of attendees) {
      const email = attendee.email || attendee;
      const conflict = await hasConflict(email, newStart, newEnd, excludeMeetingId);
      if (conflict) {
        busyAttendees.push({ email, name: attendee.name || email, conflict: { title: conflict.title, startTime: conflict.startTime, endTime: conflict.endTime, joinUrl: conflict.joinUrl } });
      }
    }

    return res.json({ available: busyAttendees.length === 0, busyAttendees, checkedCount: attendees.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
exports.cancelMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;

    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (meeting.status === "cancelled") return res.status(400).json({ message: "Meeting already cancelled" });
    if (meeting.organizerEmail !== user.email) return res.status(403).json({ message: "Only organizer can cancel" });

    const cancelResult = await cancelExternalMeeting(meeting, user);
    if (!cancelResult.success && !cancelResult.skipped) {
      return res.status(502).json({ message: cancelResult.error || "Failed to cancel on platform" });
    }


    meeting.status = "cancelled";
    meeting.cancelledAt = new Date();
    meeting.cancelledBy = user.email;
    await meeting.save();

    if (Array.isArray(meeting.attendees) && meeting.attendees.length > 0) {
      sendMeetingCancellations({
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        organizerEmail: meeting.organizerEmail,
        attendees: meeting.attendees,
        description: meeting.description || "",
        platform: meeting.platform,
      })
        .then((result) => console.log(`📧 Cancellations: sent=${result.sent}, failed=${result.failed}`))
        .catch((err) => console.error("Failed to send cancellation emails:", err && err.message));
    }

    return res.json({ success: true, message: "Meeting cancelled", meeting });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

async function updateExternalMeeting(meeting, updateData, user) {
  if (!meeting.externalId) return { success: true, skipped: true };

  if (meeting.platform === "zoom") {
    const result = await updateZoomMeeting(meeting.externalId, updateData, user.zoomAccessToken, user.zoomRefreshToken);
    if (result.success && result.newTokens) {
      user.zoomAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }
    return result;
  }

  if (meeting.platform === "google" || meeting.platform === "meet") {
    return updateGoogleMeetEvent(meeting.externalId, updateData, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });
  }

  return { success: true, skipped: true };
}

exports.updateMeeting = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { title, startTime, endTime, description, attendees, timezone, ignoreBusy } = req.body;

    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    if (meeting.status === "cancelled") return res.status(400).json({ message: "Cannot edit a cancelled meeting" });
    if (meeting.organizerEmail !== user.email) return res.status(403).json({ message: "Only organizer can edit" });
    if (title && title.length > 200) return res.status(400).json({ error: "Title must be 200 characters or less" });

    const isCompleted = new Date(meeting.endTime) < new Date();
    if (isCompleted) return res.status(400).json({ message: "Cannot edit a completed meeting" });

    const newStart = startTime ? new Date(startTime) : meeting.startTime;
    const newEnd = endTime ? new Date(endTime) : meeting.endTime;
    if (startTime && Number.isNaN(newStart.getTime())) return res.status(400).json({ error: "Invalid startTime" });
    if (endTime && Number.isNaN(newEnd.getTime())) return res.status(400).json({ error: "Invalid endTime" });
    if (newEnd <= newStart) return res.status(400).json({ error: "endTime must be after startTime" });
    if (startTime && newStart <= new Date()) {
      return res.status(400).json({ error: "Cannot schedule meeting for past date or time. Please select a future date and time." });
    }
    if ((newEnd - newStart) > 24 * 60 * 60 * 1000) return res.status(400).json({ error: "Meeting duration cannot exceed 24 hours" });

    if (startTime || endTime) {
      const conflict = await hasConflict(meeting.organizerEmail, newStart, newEnd, meetingId);
      if (conflict) {
        return res.status(409).json({ error: "Organizer has a meeting conflict", message: `Busy at ${newStart.toISOString()}`, isBusy: true });
      }
    }

    const safeAttendees = attendees ? normalizeAttendees(attendees) : undefined;
    if (safeAttendees && safeAttendees.length > 50) return res.status(400).json({ error: "Maximum 50 attendees allowed" });

    if (!ignoreBusy && safeAttendees && safeAttendees.length > 0 && (startTime || endTime)) {
      const emails = safeAttendees.map((a) => a.email);
      const slots = [{ startTime: newStart, endTime: newEnd }];
      const busy = await checkAttendeesConflicts(emails, slots, meetingId);
      if (busy.length > 0) {
        const busyList = busy.map((b) => ({
          email: b.email,
          name: (safeAttendees.find((a) => a.email === b.email) || {}).name || b.email,
          isBusy: true,
          conflictStartTime: new Date(b.conflictStart).toISOString(),
          conflictEndTime: new Date(b.conflictEnd).toISOString(),
        }));
        return res.status(409).json({ error: "Some attendees are busy", busyAttendees: busyList, canProceed: true });
      }
    }

    const tz = timezone || meeting.timezone || DEFAULT_TIMEZONE;
    const updateData = {
      title: title || meeting.title,
      startTime: newStart,
      endTime: newEnd,
      timezone: tz,
      description: description !== undefined ? description : meeting.description,
      attendees: safeAttendees || meeting.attendees,
      organizerEmail: meeting.organizerEmail,
    };

    const externalResult = await updateExternalMeeting(meeting, updateData, user);
    if (!externalResult.success && !externalResult.skipped) {
      return res.status(502).json({ message: externalResult.error || "Failed to update on platform" });
    }

    if (title) meeting.title = title;
    if (startTime) meeting.startTime = newStart;
    if (endTime) meeting.endTime = newEnd;
    if (description !== undefined) meeting.description = description;
    if (safeAttendees) meeting.attendees = safeAttendees;
    if (timezone) meeting.timezone = tz;
    meeting.updatedAt = new Date();

    await meeting.save();

    const allAttendees = meeting.attendees || [];
    if (allAttendees.length > 0) {
      sendMeetingUpdates({
        title: meeting.title,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        organizerEmail: meeting.organizerEmail,
        attendees: allAttendees,
        description: meeting.description || "",
        joinUrl: meeting.joinUrl,
        platform: meeting.platform,
      })
        .then((result) => console.log(`📧 Updates: sent=${result.sent}, failed=${result.failed}`))
        .catch((err) => console.error("Failed to send update emails:", err && err.message));
    }

    return res.json({ success: true, message: "Meeting updated", meeting });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
