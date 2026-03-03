const Meeting = require("../models/meeting");
const Employee = require("../models/employee");

const { createZoomMeeting, refreshZoomToken, deleteZoomMeeting } = require("../services/zoom-service");
const { createGoogleMeetMeeting, deleteGoogleMeetEvent } = require("../services/google-meet-service");
const { saveAndInvite } = require("../services/meetingService");
const { sendMeetingCancellations } = require("../services/email-invite-service");
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

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);
    if (Number.isNaN(newStart.getTime())) return res.status(400).json({ error: "Invalid startTime" });
    if (Number.isNaN(newEnd.getTime())) return res.status(400).json({ error: "Invalid endTime" });
    if (newEnd <= newStart) return res.status(400).json({ error: "endTime must be after startTime" });
    if (newStart <= new Date()) {
      return res.status(400).json({ error: "Cannot schedule meeting for past date or time. Please select a future date and time." });
    }

    const tz = timezone || DEFAULT_TIMEZONE;
    const desc = description || "";
    const safeAttendees = normalizeAttendees(attendees);

    const slots = generateSlots(newStart, newEnd, { isRecurring, pattern: recurrencePattern, endDate: recurrenceEndDate, count: recurrenceCount });

    
    for (const slot of slots) {
      const conflict = await hasConflict(organizerEmail, slot.startTime, slot.endTime);
      if (conflict) {
        return res.status(409).json({ error: "Organizer has a meeting conflict", message: `Busy at ${slot.startTime.toLocaleString()}`, isBusy: true });
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
          conflictStartTime: new Date(b.conflictStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          conflictEndTime: new Date(b.conflictEnd).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }));
        return res.status(409).json({ error: "Some attendees are busy", busyAttendees: busyList, canProceed: true });
      }
    }

    const videoResult = await createMeetingLink(platform, { title, startTime: newStart, endTime: newEnd, organizerEmail, attendees: safeAttendees, timezone: tz, description: desc }, user);
    if (!videoResult.success) return res.status(502).json({ error: videoResult.error });

    const externalId = videoResult.meetingId || videoResult.eventId || null;
    const joinUrl = videoResult.meetingUrl;

    const baseMeeting = { title, organizerEmail, attendees: safeAttendees, platform, timezone: tz, description: desc, joinUrl, externalId };
    const seriesId = isRecurring ? `series-${Date.now()}` : null;

    const meetingDocs = slots.map((slot) => ({
      ...baseMeeting,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isRecurring: isRecurring || false,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      recurrenceEndDate: isRecurring && recurrenceEndDate ? new Date(recurrenceEndDate) : null,
      recurrenceCount: isRecurring ? recurrenceCount : null,
      seriesId,
    }));

    const invitePayload = buildInvitePayload({ title, startTime: newStart, endTime: newEnd, organizerEmail, attendees: safeAttendees, description: desc, joinUrl, platform });
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
    const { userEmail } = req.query;
    const query = userEmail ? { $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }] } : {};
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
