const Meeting = require("../models/meeting");
const { createZoomMeeting, refreshZoomToken } = require("../services/zoom-service");
const { createGoogleMeetMeeting } = require("../services/google-meet-service");
const { sendMeetingInvites } = require("../services/email-invite-service");
const Employee = require("../models/employee");

const DEFAULT_TIMEZONE = "IST";


async function checkConflict(userEmail, startTime, endTime, excludeMeetingId = null) {
  const query = {
    status: { $ne: "cancelled" },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }],
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  return await Meeting.findOne(query);
}

async function createMeetingLink(platform, meetingData, user) {
  if (platform === "zoom") {
    if (!user.zoomConnected) {
      return { success: false, error: "Zoom not connected" };
    }

    try {
      let result = await createZoomMeeting(meetingData, user.zoomAccessToken, user.zoomRefreshToken);

      // If unauthorized, try to refresh token and retry once
      if (!result.success && result.status === 401 && user.zoomRefreshToken) {
        console.log("🔄 Zoom token expired, attempting refresh...");
        try {
          const refreshedTokens = await refreshZoomToken(user.zoomRefreshToken);

          // Update user in DB
          user.zoomAccessToken = refreshedTokens.access_token;
          if (refreshedTokens.refresh_token) {
            user.zoomRefreshToken = refreshedTokens.refresh_token;
          }
          await user.save();

          console.log(" Zoom token refreshed, retrying meeting creation...");
          
          result = await createZoomMeeting(meetingData, user.zoomAccessToken, user.zoomRefreshToken);
        } catch (refreshErr) {
          console.error("Zoom token refresh failed:", refreshErr.message);
          return { success: false, error: "Zoom token expired and refresh failed." };
        }
      }

      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (platform === "meet" || platform === "google") {
    if (!user.googleConnected) {
      return { success: false, error: "Google Meet not connected" };
    }

    const result = await createGoogleMeetMeeting(meetingData, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });

    
    if (result.success && result.newTokens) {
      console.log("💾 Saving refreshed Google tokens...");
      if (result.newTokens.access_token) {
        user.googleAccessToken = result.newTokens.access_token;
      }
      if (result.newTokens.refresh_token) {
        user.googleRefreshToken = result.newTokens.refresh_token;
      }
      await user.save();
    }

    return result;
  }

  return { success: false, error: `Platform "${platform}" is not yet supported.` };
}

function buildInvitePayload({
  title,
  startTime,
  endTime,
  organizerEmail,
  attendees,
  description,
  joinUrl,
  platform,
}) {
  return {
    title,
    startTime,
    endTime,
    organizerEmail,
    attendees,
    description: description || "",
    joinUrl,
    platform,
  };
}

function sendInvitesIfAny(payload) {
  if (!payload.attendees || payload.attendees.length === 0) {
    return;
  }

  sendMeetingInvites(payload).then((result) => {
    console.log(`📧 Invites: sent=${result.sent}, failed=${result.failed}`);
  });
}

function applyRecurrence(start, end, recurrencePattern) {
  switch (recurrencePattern) {
    case "daily":
      start.setDate(start.getDate() + 1);
      end.setDate(end.getDate() + 1);
      break;
    case "weekly":
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 7);
      break;
    case "monthly":
      start.setMonth(start.getMonth() + 1);
      end.setMonth(end.getMonth() + 1);
      break;
    default:
      break;
  }
}

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
      ignoreBusy, // flag to ignore busy attendees
    } = req.body;

    const user = await Employee.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!title || !startTime || !endTime || !organizerEmail) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    if (Number.isNaN(newStart.getTime())) {
      return res.status(400).json({
        error: "Invalid startTime format. Expected ISO 8601 date string.",
        received: startTime,
      });
    }

    if (Number.isNaN(newEnd.getTime())) {
      return res.status(400).json({
        error: "Invalid endTime format. Expected ISO 8601 date string.",
        received: endTime,
      });
    }

    if (newEnd <= newStart) {
      return res.status(400).json({ error: "endTime must be after startTime" });
    }

    const normalizedTimezone = timezone || DEFAULT_TIMEZONE;
    const safeDescription = description || "";
    const safeAttendees = attendees || [];

    // --- CONFLICT CHECK ---
    const proposedMeetings = [];
    if (isRecurring && (recurrencePattern || recurrenceCount)) {
      const maxOccurrences = recurrenceCount || 365;
      let recurrenceEnd = null;
      if (recurrenceEndDate) {
        recurrenceEnd = new Date(recurrenceEndDate);
        recurrenceEnd.setHours(23, 59, 59, 999);
      }

      let currentStart = new Date(newStart);
      let currentEnd = new Date(newEnd);

      for (let i = 0; i < maxOccurrences; i += 1) {
        if (recurrenceEnd && currentStart > recurrenceEnd) break;
        proposedMeetings.push({
          startTime: new Date(currentStart),
          endTime: new Date(currentEnd),
        });
        applyRecurrence(currentStart, currentEnd, recurrencePattern);
      }
    } else {
      proposedMeetings.push({ startTime: newStart, endTime: newEnd });
    }

    // Check organizer for conflicts (always required)
    for (const m of proposedMeetings) {
      const conflict = await checkConflict(organizerEmail, m.startTime, m.endTime);
      if (conflict) {
        return res.status(409).json({
          error: "Organizer has a meeting conflict",
          message: `You have a conflicting meeting at ${m.startTime.toLocaleString()}: "${conflict.title}"`,
          conflict,
        });
      }
    }

    // Check attendees for conflicts (only if not ignored)
    if (!ignoreBusy && safeAttendees.length > 0) {
      const busyAttendees = [];
      
      for (const m of proposedMeetings) {
        for (const attendee of safeAttendees) {
          const email = attendee.email || attendee;
          const conflict = await checkConflict(email, m.startTime, m.endTime);
          if (conflict && !busyAttendees.find(ba => ba.email === email)) {
            busyAttendees.push({
              email,
              name: attendee.name || email,
              conflict: {
                title: conflict.title,
                startTime: conflict.startTime,
                endTime: conflict.endTime,
              },
            });
          }
        }
      }

      if (busyAttendees.length > 0) {
        return res.status(409).json({
          error: "Some attendees are busy",
          message: "One or more attendees have conflicting meetings",
          busyAttendees,
          canProceed: true, // Indicates user can ignore and proceed
        });
      }
    }
    // --- END CONFLICT CHECK ---

    const videoResult = await createMeetingLink(
      platform,
      {
        title,
        startTime: newStart,
        endTime: newEnd,
        organizerEmail,
        attendees: safeAttendees,
        timezone: normalizedTimezone,
        description: safeDescription,
      },
      user
    );

    if (!videoResult.success) {
      return res.status(502).json({ error: videoResult.error });
    }

    if (isRecurring && (recurrencePattern || recurrenceCount)) {
      const seriesId = `series-${Date.now()}`;
      const seriesJoinUrl = videoResult.meetingUrl;
      const maxOccurrences = recurrenceCount || 365;

      let recurrenceEnd = null;
      if (recurrenceEndDate) {
        recurrenceEnd = new Date(recurrenceEndDate);
        recurrenceEnd.setHours(23, 59, 59, 999);
      }

      const meetings = proposedMeetings.map((m) => ({
        ...m,
        title,
        organizerEmail,
        attendees: safeAttendees,
        platform,
        timezone: normalizedTimezone,
        description: safeDescription,
        joinUrl: seriesJoinUrl,
        isRecurring: true,
        recurrencePattern,
        recurrenceEndDate: recurrenceEnd,
        recurrenceCount: maxOccurrences,
        seriesId,
      }));

      const createdMeetings = await Meeting.insertMany(meetings);

      sendInvitesIfAny(
        buildInvitePayload({
          title,
          startTime: newStart,
          endTime: newEnd,
          organizerEmail,
          attendees: safeAttendees,
          description: safeDescription,
          joinUrl: seriesJoinUrl,
          platform,
        })
      );

      return res.status(201).json({
        message: `Created ${createdMeetings.length} recurring meetings`,
        meetings: createdMeetings,
        seriesId,
      });
    }

    const joinUrl = videoResult.meetingUrl;

    const meeting = await Meeting.create({
      title,
      startTime: newStart,
      endTime: newEnd,
      organizerEmail,
      attendees: safeAttendees,
      platform,
      timezone: normalizedTimezone,
      description: safeDescription,
      joinUrl,
      isRecurring: false,
    });

    sendInvitesIfAny(
      buildInvitePayload({
        title,
        startTime: newStart,
        endTime: newEnd,
        organizerEmail,
        attendees: safeAttendees,
        description: safeDescription,
        joinUrl,
        platform,
      })
    );

    return res.status(201).json(meeting);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const { userEmail } = req.query;

    const query = userEmail
      ? {
        $or: [{ organizerEmail: userEmail }, { "attendees.email": userEmail }],
      }
      : {};

    const meetings = await Meeting.find(query).sort({ startTime: 1 });
    return res.json(meetings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Check availability of attendees for a given time slot
 * Returns list of busy attendees with their conflicting meetings
 */
exports.checkAttendeeAvailability = async (req, res) => {
  try {
    const { attendees, startTime, endTime, excludeMeetingId } = req.body;

    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({ message: "Attendees array is required" });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ message: "Start time and end time are required" });
    }

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const busyAttendees = [];

    // Check each attendee for conflicts
    for (const attendee of attendees) {
      const email = attendee.email || attendee;
      const conflict = await checkConflict(email, newStart, newEnd, excludeMeetingId);
      
      if (conflict) {
        busyAttendees.push({
          email,
          name: attendee.name || email,
          conflict: {
            title: conflict.title,
            startTime: conflict.startTime,
            endTime: conflict.endTime,
            joinUrl: conflict.joinUrl,
          },
        });
      }
    }

    return res.json({
      available: busyAttendees.length === 0,
      busyAttendees,
      checkedCount: attendees.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
