const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const Cluster = require("../models/groups");
const zoomService = require("./zoom-service");
const googleMeetService = require("./google-meet-service");
const emailService = require("./email-invite-service");

const findAvailableSlot = async (attendeeEmails, preferredTime, duration) => {
  try {
    const attendees = await Employee.find({ email: { $in: attendeeEmails } });
    if (attendees.length === 0) throw new Error("No attendees found");

    if (await checkTimeSlot(attendeeEmails, preferredTime, duration)) return preferredTime;

    let searchTime = new Date(preferredTime);
    const maxChecks = (7 * 24 * 60) / 30;

    for (let i = 0; i < maxChecks; i++) {
      searchTime.setMinutes(searchTime.getMinutes() + 30);
      if (await checkTimeSlot(attendeeEmails, searchTime, duration)) return searchTime;
    }
    return preferredTime;
  } catch (error) {
    return preferredTime;
  }
};

const checkTimeSlot = async (attendeeEmails, startTime, duration) => {
  try {
    const endTime = new Date(startTime.getTime() + duration * 60000);
    const conflicts = await Meeting.findOne({
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });
    return !conflicts;
  } catch {
    return true;
  }
};

const validateIntegrationConnected = async (userId, platform) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found");

  const isZoomValid = platform === "zoom" && (user.zoomConnected && user.zoomAccessToken);
  const isGoogleValid = platform === "google" && (user.googleConnected && user.googleAccessToken && user.googleRefreshToken);
  
  if (!isZoomValid && !isGoogleValid) {
    throw new Error(`Please connect your ${platform === "zoom" ? "Zoom" : "Google Calendar"} account first`);
  }
  return true;
};

const validateAttendees = async (attendees) => {
  if (!attendees?.length) throw new Error("At least one attendee is required");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const foundAttendees = [];
  const allEmployees = await Employee.find().select('email name');

  for (const attendee of attendees) {
    const normalizedSearch = attendee.trim().toLowerCase().replace(/\s+/g, '');
    
    const groupKeywords = ['team', 'group', 'cluster'];
    const isGroupReference = groupKeywords.some(kw => normalizedSearch.includes(kw));
    
    if (isGroupReference) {
     
      const cluster = await Cluster.findOne({
        name: { $regex: new RegExp(attendee, 'i') }
      }).populate('members', 'email name');
      
      if (cluster && cluster.members.length > 0) {
        cluster.members.forEach(member => {
          if (!foundAttendees.includes(member.email)) {
            foundAttendees.push(member.email);
          }
        });
        continue;
      }
    }

    let user = emailRegex.test(attendee) ? await Employee.findOne({ email: attendee }).select('email name') : null;

    if (!user) {
      user = allEmployees.find(emp => {
        const empName = emp.name.toLowerCase().replace(/\s+/g, '');
        const empEmail = emp.email.toLowerCase().replace(/\s+/g, '');
        return empName.includes(normalizedSearch) || empEmail.includes(normalizedSearch) ||
               normalizedSearch.includes(empName) || normalizedSearch.includes(empEmail);
      });
    }

    if (!user) throw new Error(`User or group "${attendee}" not found.`);
    if (!foundAttendees.includes(user.email)) {
      foundAttendees.push(user.email);
    }
  }

  return foundAttendees;
};

const validateMeetingTime = (meetingTime) => {
  const now = new Date();
  const minutesDiff = (meetingTime.getTime() - now.getTime()) / (1000 * 60);
  if (minutesDiff < 0) {
    throw new Error(`That time is in the past. Please choose a future date and time.`);
  }
  if (minutesDiff < 30) {
    const suggestedTime = new Date(Date.now() + 60 * 60000);
    throw new Error(`Meetings must be scheduled at least 30 minutes from now. How about ${suggestedTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}?`);
  }
};

const createAutomatedMeeting = async (meetingData, userId, userEmail, platform) => {
  try {
    await validateIntegrationConnected(userId, platform);
    const validatedAttendeeEmails = await validateAttendees(meetingData.attendees);
    validateMeetingTime(meetingData.suggestedTime);

    const finalTime = await findAvailableSlot(validatedAttendeeEmails, meetingData.suggestedTime, meetingData.duration);
    const user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    const endTime = new Date(finalTime.getTime() + meetingData.duration * 60000);
    let meetingLink, externalId;

    if (platform === "zoom") {
      if (!user.zoomAccessToken) throw new Error("Zoom tokens not found");

      let zoomResponse = await zoomService.createZoomMeeting(
        {
          title: meetingData.title,
          startTime: finalTime.toISOString(),
          endTime: endTime.toISOString(),
          timezone: "UTC",
          description: meetingData.description || "",
        },
        user.zoomAccessToken,
        user.zoomRefreshToken
      );
      if (!zoomResponse.success && zoomResponse.status === 401 && user.zoomRefreshToken) {
        try {
          const tokens = await zoomService.refreshZoomToken(user.zoomRefreshToken);
          user.zoomAccessToken = tokens.access_token;
          if (tokens.refresh_token) user.zoomRefreshToken = tokens.refresh_token;
          await user.save();

          zoomResponse = await zoomService.createZoomMeeting(
            {
              title: meetingData.title,
              startTime: finalTime.toISOString(),
              endTime: endTime.toISOString(),
              timezone: "UTC",
              description: meetingData.description || "",
            },
            user.zoomAccessToken,
            user.zoomRefreshToken
          );
        } catch (refreshErr) {
          throw new Error("Zoom token refresh failed. Please reconnect your Zoom integration.");
        }
      }

      if (!zoomResponse.success) throw new Error(`Zoom API Error: ${zoomResponse.error}`);
      meetingLink = zoomResponse.meetingUrl;
      externalId = zoomResponse.meetingId || null;
    } else if (platform === "google") {
      if (!user.googleRefreshToken || !user.googleAccessToken) throw new Error("Google tokens not found");
      const googleResponse = await googleMeetService.createGoogleMeetMeeting(
        { title: meetingData.title, startTime: finalTime, endTime, organizerEmail: userEmail, attendees: validatedAttendeeEmails.map(e => ({ email: e })), description: meetingData.description || "", timezone: "IST" },
        { accessToken: user.googleAccessToken, refreshToken: user.googleRefreshToken }
      );
      if (!googleResponse.success) throw new Error(`Google API Error: ${googleResponse.error}`);
      meetingLink = googleResponse.hangoutLink || googleResponse.meetingUrl;
      externalId = googleResponse.eventId || null;
    } else {
      throw new Error("Invalid platform");
    }

    const attendeeObjects = validatedAttendeeEmails.map(e => ({ email: e, name: e.split('@')[0] }));
    const meeting = new Meeting({
      title: meetingData.title,
      description: meetingData.description,
      attendees: attendeeObjects,
      startTime: finalTime,
      endTime,
      joinUrl: meetingLink,
      externalId,
      platform,
      organizerEmail: userEmail,
      createdBy: userId,
    });

    await meeting.save();

    emailService.sendMeetingInvites({
      title: meetingData.title,
      attendees: attendeeObjects,
      startTime: finalTime,
      endTime,
      organizerEmail: userEmail,
      description: meetingData.description,
      joinUrl: meetingLink,
    }).catch(() => {});

    return {
      success: true,
      meeting: {
        id: meeting._id,
        title: meeting.title,
        startTime: finalTime,
        duration: meetingData.duration,
        attendees: meetingData.attendees,
        meetingLink,
        platform,
      },
      message: `Meeting created successfully for ${finalTime.toLocaleString()}`,
    };
  } catch (error) {
    throw new Error("Failed to create meeting: " + error.message);
  }
};

// Get suggested time slots
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
  findAvailableSlot,
  checkTimeSlot,
  getSuggestedTimeSlots,
  validateIntegrationConnected,
  validateAttendees,
  validateMeetingTime,
};
