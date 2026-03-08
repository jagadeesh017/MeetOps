const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const zoomService = require("./zoom-service");
const googleMeetService = require("./google-meet-service");
const emailService = require("./email-invite-service");
const { hasConflict } = require("./conflictService");
const { saveAndInvite } = require("./meetingService");
const { readPolicy, assertWithinWorkingPolicy, hasBufferConflict } = require("./user-settings-policy");
const { generateSlots } = require("../utilities/recurrence");

const { resolveAttendees } = require("./attendee-resolver");
const { parseTime } = require("../utilities/date-utils");
const { findMeetingsBySearch, listResolvableMeetings } = require("./meeting-lookup");
const { isTimeAvailable, suggestTimeSlots, findFirstAvailableSlot } = require("./scheduling-engine");
const { generateSlots } = require("../utilities/recurrence");

/**
 * Validates a meeting's time against user policies (working hours, buffers).
 */
async function validateMeetingPolicy(user, userEmail, startTime, endTime, excludeMeetingId = null) {
  const policy = readPolicy(user);
  assertWithinWorkingPolicy({ startTime, endTime, user });

  if (policy.bufferMinutes > 0) {
    const blocked = await hasBufferConflict({
      email: userEmail,
      startTime,
      endTime,
      bufferMinutes: policy.bufferMinutes,
      excludeMeetingId,
    });
    if (blocked) throw new Error("buffer_conflict");
  }
}


async function withPlatformRetry(userId, platform, actionFn) {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");

  if (platform === "zoom") {
    if (!user.zoomConnected) throw new Error("Your Zoom account is not connected. Please connect it in Integrations.");
    let result = await actionFn(user.zoomAccessToken, user.zoomRefreshToken);

    if (!result.success && result.status === 400 && typeof result.error === "string" && result.error.toLowerCase().includes("refresh")) {
      const latestUser = await Employee.findById(userId);
      if (latestUser?.zoomRefreshToken && latestUser.zoomRefreshToken !== user.zoomRefreshToken) {
        result = await actionFn(latestUser.zoomAccessToken, latestUser.zoomRefreshToken);
        if (result.success && result.newTokens) {
          latestUser.zoomAccessToken = result.newTokens.access_token;
          if (result.newTokens.refresh_token) latestUser.zoomRefreshToken = result.newTokens.refresh_token;
          await latestUser.save();
        }
      }
    }

    if (result.success && result.newTokens) {
      user.zoomAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }

    if (!result.success) throw new Error(result.error || `Failed Zoom action.`);
    return result;
  } else if (platform === "google" || platform === "meet") {
    if (!user.googleConnected) throw new Error("Your Google account is not connected. Please connect it in Integrations.");
    const result = await actionFn(user.googleAccessToken, user.googleRefreshToken);

    if (result.newTokens) {
      if (result.newTokens.access_token) user.googleAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.googleRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }

    if (!result.success) throw new Error(result.error || `Failed Google Meet action.`);
    return result;
  }
}


async function createPlatformMeeting(platform, meetingPayload, user, userId) {
  const result = await withPlatformRetry(userId, platform, async (accessToken, refreshToken) => {
    if (platform === "zoom") {
      return zoomService.createZoomMeeting(meetingPayload, accessToken, refreshToken);
    } else {
      return googleMeetService.createGoogleMeetMeeting(meetingPayload, { refreshToken, accessToken });
    }
  });

  return {
    joinUrl: result.meetingUrl || result.hangoutLink,
    externalId: result.meetingId || result.eventId
  };
}

//create
const createMeeting = async (userId, userEmail, details) => {
  const {
    title,
    attendees,
    platform,
    duration = 60,
    description = "",
    parsedTime,
    autoFixConflict = false,
    isRecurring = false,
    recurrencePattern,
    recurrenceEndDate,
    recurrenceCount,
    ignoreBusy = false
  } = details;

  if (!parsedTime) throw new Error("Please provide a valid date and time.");
  if (!attendees?.length) throw new Error("Please specify at least one attendee.");

  if (new Date(parsedTime) <= new Date()) {
    throw new Error("Cannot schedule meeting for past date or time. Please select a future date and time.");
  }

  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");
  const policy = readPolicy(user);

  const resolvedEmails = await resolveAttendees(attendees);
  const safeAttendees = resolvedEmails.map((email) => ({ email, name: email.split("@")[0] }));

  let startTime = parsedTime;
  if (autoFixConflict && !isRecurring) {
    startTime = await findFirstAvailableSlot(resolvedEmails, parsedTime, duration);
  }

  const endTime = new Date(startTime.getTime() + duration * 60000);
  const preferredPlatform = platform || user.settings?.defaultPlatform || "zoom";
  const effectivePlatform = preferredPlatform === "teams" ? "zoom" : preferredPlatform;

  // Handle Recurring Slots
  const slots = generateSlots(startTime, endTime, {
    isRecurring,
    pattern: recurrencePattern,
    endDate: recurrenceEndDate,
    count: recurrenceCount
  });

  for (const slot of slots) {
    await validateMeetingPolicy(user, userEmail, slot.startTime, slot.endTime);

    if (!ignoreBusy) {
      const conflict = await hasConflict(userEmail, slot.startTime, slot.endTime);
      if (conflict) throw new Error(`You have a conflicting meeting: "${conflict.title}" at ${slot.startTime.toLocaleString()}`);
    }
  }

  const seriesId = isRecurring ? `series-${Date.now()}` : null;
  const meetingDocs = [];

  for (const slot of slots) {
    const meetingPayload = {
      title,
      startTime: slot.startTime.toISOString(),
      endTime: slot.endTime.toISOString(),
      organizerEmail: userEmail,
      attendees: safeAttendees,
      description: description || ""
    };

    const { joinUrl, externalId } = await createPlatformMeeting(effectivePlatform, meetingPayload, user, userId);

    meetingDocs.push({
      title,
      organizerEmail: userEmail,
      createdBy: userId,
      attendees: safeAttendees,
      platform: effectivePlatform,
      timezone: details.timezone || "UTC",
      description: description || "",
      joinUrl,
      externalId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      recurrenceEndDate: isRecurring && recurrenceEndDate ? new Date(recurrenceEndDate) : null,
      recurrenceCount: isRecurring ? recurrenceCount : null,
      seriesId
    });
  }

  const created = await saveAndInvite(meetingDocs, {
    title,
    startTime: slots[0].startTime,
    endTime: slots[0].endTime,
    organizerEmail: userEmail,
    attendees: safeAttendees,
    description: description || "",
    joinUrl: meetingDocs[0].joinUrl,
    platform: effectivePlatform
  });

  return isRecurring ? { message: `Created ${created.length} recurring meetings`, meetings: created, seriesId } : created[0];
};

//update
const updateMeeting = async (meetingId, userId, userEmail, updateData) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");
  const policy = readPolicy(user);

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new Error("Meeting not found.");
  if (meeting.status === "cancelled") throw new Error("Cannot edit a cancelled meeting.");
  if (meeting.organizerEmail !== userEmail) throw new Error("Only the organizer can edit this meeting.");

  const { title, parsedTime, attendees, duration, description } = updateData;
  const newStart = parsedTime || meeting.startTime;
  const existingDurationMs = new Date(meeting.endTime) - new Date(meeting.startTime);
  const newEnd = parsedTime ? new Date(parsedTime.getTime() + (duration ? duration * 60000 : existingDurationMs)) : meeting.endTime;

  await validateMeetingPolicy(user, userEmail, newStart, newEnd, meetingId);

  if (new Date(newStart) <= new Date()) {
    throw new Error("Cannot schedule meeting for past date or time. Please select a future date and time.");
  }

  // Update platform meeting if time or title changed
  if ((parsedTime || title) && meeting.externalId) {
    const platformPayload = {
      title: title || meeting.title,
      startTime: newStart.toISOString(),
      endTime: newEnd.toISOString(),
      organizerEmail: userEmail,
      attendees: meeting.attendees,
      description: description || meeting.description
    };

    await withPlatformRetry(userId, meeting.platform, async (accessToken, refreshToken) => {
      if (meeting.platform === "zoom") {
        return zoomService.updateZoomMeeting(meeting.externalId, platformPayload, accessToken, refreshToken);
      } else {
        return googleMeetService.updateGoogleMeetEvent(meeting.externalId, platformPayload, { refreshToken, accessToken });
      }
    });
  }

  if (title) meeting.title = title;
  if (description !== undefined) meeting.description = description;
  if (parsedTime) {
    meeting.startTime = newStart;
    meeting.endTime = newEnd;
    meeting.reminderSentAt = null;
  }
  if (attendees?.length) {
    const resolvedEmails = await resolveAttendees(attendees);
    meeting.attendees = resolvedEmails.map((email) => ({ email, name: email.split("@")[0] }));
  }
  meeting.updatedAt = new Date();
  await meeting.save();

  if (meeting.attendees?.length) {
    emailService.sendMeetingUpdates({
      title: meeting.title,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      organizerEmail: meeting.organizerEmail,
      attendees: meeting.attendees,
      description: meeting.description || "",
      joinUrl: meeting.joinUrl,
      platform: meeting.platform
    }).catch((err) => console.error("Email error:", err));
  }
  return meeting;
};

const deleteMeeting = async (meetingId, userId, userEmail) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new Error("Meeting not found.");
  if (meeting.status === "cancelled") throw new Error("Meeting is already cancelled.");
  if (meeting.organizerEmail !== userEmail) throw new Error("Only the organizer can cancel this meeting.");

  if (meeting.externalId) {
    await withPlatformRetry(userId, meeting.platform, async (accessToken, refreshToken) => {
      if (meeting.platform === "zoom") {
        return zoomService.deleteZoomMeeting(meeting.externalId, accessToken, refreshToken);
      } else {
        return googleMeetService.deleteGoogleMeetEvent(meeting.externalId, { refreshToken, accessToken });
      }
    });
  }

  meeting.status = "cancelled";
  meeting.cancelledAt = new Date();
  meeting.cancelledBy = userEmail;
  await meeting.save();

  if (meeting.attendees?.length) {
    emailService.sendMeetingCancellations({
      title: meeting.title,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      organizerEmail: meeting.organizerEmail,
      attendees: meeting.attendees,
      description: meeting.description || "",
      platform: meeting.platform
    }).catch((err) => console.error("Email error:", err));
  }

  return {
    id: meeting._id,
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    platform: meeting.platform,
    attendees: meeting.attendees,
    joinUrl: meeting.joinUrl,
    duration: Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 60000),
  };
};

module.exports = {
  // Re-exporting from modules for backward compatibility
  resolveAttendees,
  parseTime,
  findMeetingsBySearch,
  listResolvableMeetings,
  isTimeAvailable,
  suggestTimeSlots,
  findFirstAvailableSlot,
  // CRUD operations
  createMeeting,
  updateMeeting,
  deleteMeeting,
};
