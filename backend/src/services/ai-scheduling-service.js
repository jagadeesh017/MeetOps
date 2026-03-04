const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const Cluster = require("../models/groups");
const zoomService = require("./zoom-service");
const googleMeetService = require("./google-meet-service");
const emailService = require("./email-invite-service");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const checkTimeSlot = async (attendeeEmails, startTime, duration) => {
  try {
    const endTime = new Date(startTime.getTime() + duration * 60000);
    const query = {
      status: { $ne: "cancelled" },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    };
    if (attendeeEmails.length > 0) {
      query.$or = [
        { organizerEmail: { $in: attendeeEmails } },
        { "attendees.email": { $in: attendeeEmails } },
      ];
    }
    const conflict = await Meeting.findOne(query);
    return !conflict;
  } catch {
    return true;
  }
};

const findAvailableSlot = async (attendeeEmails, preferredTime, duration) => {
  try {
    if (await checkTimeSlot(attendeeEmails, preferredTime, duration)) return preferredTime;

    let searchTime = new Date(preferredTime);
    const maxChecks = (7 * 24 * 60) / 30;
    for (let i = 0; i < maxChecks; i++) {
      searchTime.setMinutes(searchTime.getMinutes() + 30);
      if (await checkTimeSlot(attendeeEmails, searchTime, duration)) return searchTime;
    }
    return preferredTime;
  } catch {
    return preferredTime;
  }
};

const validateIntegrationConnected = async (userId, platform) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found");

  const isZoomValid = platform === "zoom" && user.zoomConnected && user.zoomAccessToken;
  const isGoogleValid = platform === "google" && user.googleConnected && user.googleAccessToken && user.googleRefreshToken;

  if (!isZoomValid && !isGoogleValid) {
    throw new Error(`Please connect your ${platform === "zoom" ? "Zoom" : "Google Calendar"} account first`);
  }
  return true;
};

const validateAttendees = async (attendees) => {
  if (!attendees?.length) throw new Error("At least one attendee is required");

  const foundAttendees = [];
  const allEmployees = await Employee.find().select("email name");

  for (const attendee of attendees) {
    const normalizedSearch = attendee.trim().toLowerCase().replace(/\s+/g, "");

    const isGroupReference = ["team", "group", "cluster"].some((kw) => normalizedSearch.includes(kw));
    if (isGroupReference) {
      const cluster = await Cluster.findOne({ name: { $regex: new RegExp(attendee, "i") } }).populate("members", "email name");
      if (cluster?.members?.length > 0) {
        cluster.members.forEach((m) => { if (!foundAttendees.includes(m.email)) foundAttendees.push(m.email); });
        continue;
      }
    }

    if (EMAIL_REGEX.test(attendee)) {
      if (!foundAttendees.includes(attendee.toLowerCase())) foundAttendees.push(attendee.toLowerCase());
      continue;
    }

    const user = allEmployees.find((emp) => {
      const empName = emp.name.toLowerCase().replace(/\s+/g, "");
      const empEmail = emp.email.toLowerCase().replace(/\s+/g, "");
      return empName.includes(normalizedSearch) || empEmail.includes(normalizedSearch) ||
        normalizedSearch.includes(empName) || normalizedSearch.includes(empEmail);
    });

    if (!user) throw new Error(`User or group "${attendee}" not found. Use a valid email for external attendees.`);
    if (!foundAttendees.includes(user.email)) foundAttendees.push(user.email);
  }

  return foundAttendees;
};

const validateMeetingTime = (meetingTime) => {
  const minutesDiff = (meetingTime.getTime() - Date.now()) / 60000;
  if (minutesDiff < 0) throw new Error("That time is in the past. Please choose a future date and time.");
  if (minutesDiff < 30) {
    const suggested = new Date(Date.now() + 60 * 60000);
    throw new Error(`Meetings must be scheduled at least 30 minutes from now. How about ${suggested.toISOString()}?`);
  }
};

async function createExternalLink(platform, meetingData, user) {
  const { title, startTime, endTime, timezone, description, organizerEmail, attendeeObjects } = meetingData;

  if (platform === "zoom") {
    if (!user.zoomAccessToken) throw new Error("Zoom tokens not found");
    const result = await zoomService.createZoomMeeting(
      { title, startTime: startTime.toISOString(), endTime: endTime.toISOString(), timezone: timezone || "UTC", description: description || "" },
      user.zoomAccessToken, user.zoomRefreshToken
    );
    if (result.newTokens) {
      user.zoomAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }
    if (!result.success) throw new Error(`Zoom API Error: ${result.error}`);
    return { meetingLink: result.meetingUrl, externalId: result.meetingId || null };
  }

  if (platform === "google") {
    if (!user.googleRefreshToken || !user.googleAccessToken) throw new Error("Google tokens not found");
    const result = await googleMeetService.createGoogleMeetMeeting(
      { title, startTime, endTime, organizerEmail, attendees: attendeeObjects, description: description || "", timezone: timezone || "IST" },
      { accessToken: user.googleAccessToken, refreshToken: user.googleRefreshToken }
    );
    if (!result.success) throw new Error(`Google API Error: ${result.error}`);
    return { meetingLink: result.hangoutLink || result.meetingUrl, externalId: result.eventId || null };
  }

  throw new Error("Invalid platform");
}

async function updateExternalLink(platform, externalId, updateData, user) {
  if (!externalId) return { success: true, skipped: true };

  if (platform === "zoom") {
    const result = await zoomService.updateZoomMeeting(externalId, updateData, user.zoomAccessToken, user.zoomRefreshToken);
    if (result.newTokens) {
      user.zoomAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }
    return result;
  }

  if (platform === "google" || platform === "meet") {
    return googleMeetService.updateGoogleMeetEvent(externalId, updateData, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });
  }

  return { success: true, skipped: true };
}

const createAutomatedMeeting = async (meetingData, userId, userEmail, platform) => {
  try {
    await validateIntegrationConnected(userId, platform);
    const validatedEmails = await validateAttendees(meetingData.attendees);
    validateMeetingTime(meetingData.suggestedTime);

    const finalTime = await findAvailableSlot(validatedEmails, meetingData.suggestedTime, meetingData.duration);
    const user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    const endTime = new Date(finalTime.getTime() + meetingData.duration * 60000);
    const attendeeObjects = validatedEmails.map((e) => ({ email: e, name: e.split("@")[0] }));

    const { meetingLink, externalId } = await createExternalLink(platform, {
      title: meetingData.title, startTime: finalTime, endTime, timezone: "UTC",
      description: meetingData.description, organizerEmail: userEmail, attendeeObjects,
    }, user);

    const meeting = new Meeting({
      title: meetingData.title, description: meetingData.description, attendees: attendeeObjects,
      startTime: finalTime, endTime, joinUrl: meetingLink, externalId, platform,
      organizerEmail: userEmail, createdBy: userId,
    });
    await meeting.save();

    emailService.sendMeetingInvites({
      title: meetingData.title, attendees: attendeeObjects, startTime: finalTime, endTime,
      organizerEmail: userEmail, description: meetingData.description, joinUrl: meetingLink, platform,
    }).catch(() => { });

    return {
      success: true,
      meeting: { id: meeting._id, title: meeting.title, startTime: finalTime, duration: meetingData.duration, attendees: meetingData.attendees, meetingLink, platform },
      message: `Meeting created successfully for ${finalTime.toISOString()}`,
    };
  } catch (error) {
    throw new Error("Failed to create meeting: " + error.message);
  }
};

const updateAutomatedMeeting = async (meetingId, updateFields, userId, userEmail) => {
  try {
    const user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw new Error("Meeting not found");
    if (meeting.status === "cancelled") throw new Error("Cannot edit a cancelled meeting");
    if (meeting.organizerEmail !== userEmail) throw new Error("Only the organizer can edit this meeting");
    if (new Date(meeting.endTime) < new Date()) throw new Error("Cannot edit a completed meeting");

    const newStart = updateFields.startTime ? new Date(updateFields.startTime) : meeting.startTime;
    const newEnd = updateFields.endTime ? new Date(updateFields.endTime) : (updateFields.startTime && updateFields.duration
      ? new Date(new Date(updateFields.startTime).getTime() + updateFields.duration * 60000) : meeting.endTime);

    if (newEnd <= newStart) throw new Error("End time must be after start time");
    if (updateFields.startTime && newStart <= new Date()) throw new Error("Cannot schedule for a past time");
    if ((newEnd - newStart) > 24 * 60 * 60 * 1000) throw new Error("Meeting duration cannot exceed 24 hours");

    const safeAttendees = updateFields.attendees
      ? (await validateAttendees(updateFields.attendees)).map((e) => ({ email: e, name: e.split("@")[0] }))
      : meeting.attendees;

    const updateData = {
      title: updateFields.title || meeting.title,
      startTime: newStart,
      endTime: newEnd,
      timezone: meeting.timezone || "UTC",
      description: updateFields.description !== undefined ? updateFields.description : meeting.description,
      attendees: safeAttendees,
      organizerEmail: meeting.organizerEmail,
    };

    const extResult = await updateExternalLink(meeting.platform, meeting.externalId, updateData, user);
    if (!extResult.success && !extResult.skipped) throw new Error(extResult.error || "Failed to update on platform");

    if (updateFields.title) meeting.title = updateFields.title;
    if (updateFields.startTime) meeting.startTime = newStart;
    if (updateFields.endTime || updateFields.startTime) meeting.endTime = newEnd;
    if (updateFields.description !== undefined) meeting.description = updateFields.description;
    if (updateFields.attendees) meeting.attendees = safeAttendees;
    meeting.updatedAt = new Date();
    await meeting.save();

    emailService.sendMeetingUpdates({
      title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime,
      organizerEmail: meeting.organizerEmail, attendees: meeting.attendees,
      description: meeting.description || "", joinUrl: meeting.joinUrl, platform: meeting.platform,
    }).catch(() => { });

    return {
      success: true,
      meeting: { id: meeting._id, title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime, platform: meeting.platform, attendees: meeting.attendees, meetingLink: meeting.joinUrl },
      message: `Meeting "${meeting.title}" updated successfully`,
    };
  } catch (error) {
    throw new Error("Failed to update meeting: " + error.message);
  }
};

const getSuggestedTimeSlots = async (attendeeEmails, startDate, duration) => {
  const slots = [];
  const current = new Date(startDate);
  const times = [9, 10, 14, 15, 16];

  for (let i = 0; i < 5 && slots.length < 5; i++) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      for (const hour of times) {
        current.setHours(hour, 0, 0, 0);
        if (await checkTimeSlot(attendeeEmails, new Date(current), duration)) {
          slots.push(new Date(current));
          if (slots.length >= 5) break;
        }
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
};

module.exports = {
  createAutomatedMeeting,
  updateAutomatedMeeting,
  findAvailableSlot,
  checkTimeSlot,
  getSuggestedTimeSlots,
  validateIntegrationConnected,
  validateAttendees,
  validateMeetingTime,
};
