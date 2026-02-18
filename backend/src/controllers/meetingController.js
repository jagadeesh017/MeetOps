const Meeting = require("../models/meeting");
const { createZoomMeeting, refreshZoomToken } = require("../services/zoom-service");
const { createGoogleMeetMeeting } = require("../services/google-meet-service");
const { sendMeetingInvites } = require("../services/email-invite-service");
const Employee = require("../models/employee");

async function createMeetingLink(platform, meetingData, user) {
  if (platform === 'zoom') {
    if (!user.zoomConnected) {
      return { success: false, error: 'Zoom not connected' };
    }
    // Zoom tokens need explicit refresh logic if we don't have a middleware
    try {
      // For Zoom, we often just use the access_token if it's fresh, 
      // but here we might need to refresh it. For simplicity, let's try with access_token first.
      return createZoomMeeting(meetingData, user.zoomAccessToken);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  if (platform === 'meet' || platform === 'google') {
    if (!user.googleConnected) {
      return { success: false, error: 'Google Meet not connected' };
    }
    return createGoogleMeetMeeting(meetingData, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken
    });
  }
  return { success: false, error: `Platform "${platform}" is not yet supported.` };
}


exports.createMeeting = async (req, res) => {
  try {
    const {
      title, startTime, endTime, organizerEmail, attendees, platform,
      timezone, description, isRecurring, recurrencePattern,
      recurrenceEndDate, recurrenceCount
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

    if (isNaN(newStart.getTime())) {
      return res.status(400).json({
        error: "Invalid startTime format. Expected ISO 8601 date string.",
        received: startTime
      });
    }
    if (isNaN(newEnd.getTime())) {
      return res.status(400).json({
        error: "Invalid endTime format. Expected ISO 8601 date string.",
        received: endTime
      });
    }

    if (newEnd <= newStart) {
      return res.status(400).json({ error: "endTime must be after startTime" });
    }

    const emails = [
      organizerEmail,
      ...(attendees || []).map(a => a.email)
    ];

    await Meeting.findOne({
      startTime: { $lt: newEnd },
      endTime: { $gt: newStart },
      $or: [
        { organizerEmail: { $in: emails } },
        { "attendees.email": { $in: emails } }
      ]
    });

    if (isRecurring && recurrencePattern) {
      const seriesId = `series-${Date.now()}`;
      const meetings = [];

      const videoResult = await createMeetingLink(platform, {
        title,
        startTime: newStart,
        endTime: newEnd,
        organizerEmail,
        attendees,
        timezone: timezone || "UTC",
        description: description || ""
      }, user);

      if (!videoResult.success) {
        return res.status(502).json({ error: videoResult.error });
      }

      const seriesJoinUrl = videoResult.meetingUrl;
      console.log(`✅ ${platform} recurring meeting link created:`, seriesJoinUrl);

      let currentStart = new Date(newStart);
      let currentEnd = new Date(newEnd);

      const maxOccurrences = recurrenceCount || 10;
      const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : null;

      for (let i = 0; i < maxOccurrences; i++) {
        if (endDate && currentStart > endDate) break;

        meetings.push({
          title,
          startTime: new Date(currentStart),
          endTime: new Date(currentEnd),
          organizerEmail,
          attendees,
          platform,
          timezone: timezone || "UTC",
          description: description || "",
          joinUrl: seriesJoinUrl,
          isRecurring: true,
          recurrencePattern,
          recurrenceEndDate: endDate,
          recurrenceCount: maxOccurrences,
          seriesId
        });

        switch (recurrencePattern) {
          case 'daily':
            currentStart.setDate(currentStart.getDate() + 1);
            currentEnd.setDate(currentEnd.getDate() + 1);
            break;
          case 'weekly':
            currentStart.setDate(currentStart.getDate() + 7);
            currentEnd.setDate(currentEnd.getDate() + 7);
            break;
          case 'monthly':
            currentStart.setMonth(currentStart.getMonth() + 1);
            currentEnd.setMonth(currentEnd.getMonth() + 1);
            break;
        }
      }

      const createdMeetings = await Meeting.insertMany(meetings);

      if (attendees && attendees.length > 0) {
        sendMeetingInvites({
          title, startTime: newStart, endTime: newEnd,
          organizerEmail, attendees,
          description: description || '',
          joinUrl: seriesJoinUrl,
          platform,
        }).then(r => console.log(`📧 Recurring invites: sent=${r.sent}, failed=${r.failed}`));
      }

      res.status(201).json({
        message: `Created ${createdMeetings.length} recurring meetings`,
        meetings: createdMeetings,
        seriesId
      });
    } else {
      const videoResult = await createMeetingLink(platform, {
        title,
        startTime: newStart,
        endTime: newEnd,
        organizerEmail,
        attendees,
        timezone: timezone || "UTC",
        description: description || ""
      }, user);

      if (!videoResult.success) {
        return res.status(502).json({ error: videoResult.error });
      }

      const joinUrl = videoResult.meetingUrl;
      const externalMeetingId = videoResult.meetingId || videoResult.eventId || null;
      console.log(`✅ ${platform} meeting created:`, joinUrl);

      const meeting = await Meeting.create({
        title,
        startTime: newStart,
        endTime: newEnd,
        organizerEmail,
        attendees,
        platform,
        timezone: timezone || "UTC",
        description: description || "",
        joinUrl,
        calcomBookingId: externalMeetingId,
        calcomBookingUid: externalMeetingId,
        isRecurring: false
      });

      if (attendees && attendees.length > 0) {
        sendMeetingInvites({
          title, startTime: newStart, endTime: newEnd,
          organizerEmail, attendees,
          description: description || '',
          joinUrl,
          platform,
        }).then(r => console.log(`📧 Invites: sent=${r.sent}, failed=${r.failed}`));
      }

      res.status(201).json(meeting);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const { userEmail } = req.query;
    let query = {};
    if (userEmail) {
      query = {
        $or: [
          { organizerEmail: userEmail },
          { "attendees.email": userEmail }
        ]
      };
    }
    const meetings = await Meeting.find(query).sort({ startTime: 1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
