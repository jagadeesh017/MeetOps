const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const zoomService = require("./zoom-service");
const googleMeetService = require("./google-meet-service");
const emailService = require("./email-invite-service");

/**
 * Find available time slots for meeting
 * @param {Array<string>} attendeeEmails - Email addresses of attendees
 * @param {Date} preferredTime - User's preferred time
 * @param {number} duration - Meeting duration in minutes
 * @returns {Promise<Date>} Best available time
 */
const findAvailableSlot = async (attendeeEmails, preferredTime, duration) => {
  try {
    // Get all attendees' meetings
    const attendees = await Employee.find({
      email: { $in: attendeeEmails },
    });

    if (attendees.length === 0) {
      throw new Error("No attendees found");
    }

    // Check if preferred time works
    const isAvailable = await checkTimeSlot(
      attendeeEmails,
      preferredTime,
      duration
    );

    if (isAvailable) {
      return preferredTime;
    }

    // If not available, find next available slot
    
    let searchTime = new Date(preferredTime);
    const maxSearchDays = 7; // Search up to 7 days ahead
    const incrementMinutes = 30; // Check in 30-minute intervals
    let slotsChecked = 0;
    const maxChecks = (maxSearchDays * 24 * 60) / incrementMinutes;

    while (slotsChecked < maxChecks) {
      // Move to next time slot
      searchTime.setMinutes(searchTime.getMinutes() + incrementMinutes);
      slotsChecked++;

      // Check if this slot is available
      const slotAvailable = await checkTimeSlot(
        attendeeEmails,
        searchTime,
        duration
      );

      if (slotAvailable) {
        return searchTime;
      }
    }

    // Fallback: if no slot found in 7 days, return preferred time anyway
    return preferredTime;
  } catch (error) {
    console.error("Error finding available slot:", error);
    // Return preferred time on error to avoid blocking meeting creation
    return preferredTime;
  }
};

/**
 * Check if time slot is available for all attendees
 * @param {Array<string>} attendeeEmails
 * @param {Date} startTime
 * @param {number} duration
 * @returns {Promise<boolean>}
 */
const checkTimeSlot = async (attendeeEmails, startTime, duration) => {
  try {
    const endTime = new Date(startTime.getTime() + duration * 60000);

    // Check for conflicts across all meetings in the system
    // Look for any meeting that overlaps with the proposed time
    const conflicts = await Meeting.find({
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    }).select('title startTime endTime attendees');

    // If there are conflicts, the slot is NOT available
    if (conflicts.length > 0) {
      return false;
    }

    // No conflicts found, slot is available
    return true;
  } catch (error) {
    // Assume available on error to prevent blocking
    return true;
  }
};

/**
 * Validate user has required integrations connected
 */
const validateIntegrationConnected = async (userId, platform) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found");

  if (platform === "zoom") {
    if (!user.zoomConnected || !user.zoomAccessToken) {
      throw new Error("Please connect your Zoom account in integrations first");
    }
  } else if (platform === "google") {
    if (!user.googleConnected || !user.googleAccessToken || !user.googleRefreshToken) {
      throw new Error("Please connect your Google Calendar in integrations first");
    }
  }
  return true;
};

/**
 * Validate attendees exist in system (fuzzy partial matching on name or email, ignore spaces)
 */
const validateAttendees = async (attendees) => {
  if (!attendees || attendees.length === 0) {
    throw new Error("At least one attendee is required");
  }

  const foundAttendees = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const attendee of attendees) {
    const normalizedSearch = attendee.trim().toLowerCase().replace(/\s+/g, '');
    let user;

    // Check if it's an email format
    if (emailRegex.test(attendee)) {
      // Exact email match
      user = await Employee.findOne({ email: attendee }).select('email name');
    }
    
    // If not found, try partial fuzzy matching on name or email
    if (!user) {
      // Get all employees and do fuzzy/partial matching
      const allEmployees = await Employee.find().select('email name');
      
      for (const emp of allEmployees) {
        const empName = emp.name.toLowerCase().replace(/\s+/g, '');
        const empEmail = emp.email.toLowerCase().replace(/\s+/g, '');
        
        // Check if attendee is contained in name or email (partial match, ignore spaces)
        if (empName.includes(normalizedSearch) || empEmail.includes(normalizedSearch) ||
            normalizedSearch.includes(empName) || normalizedSearch.includes(empEmail)) {
          user = emp;
          break;
        }
      }
    }

    if (!user) {
      throw new Error(`User "${attendee}" not found. Please check the name or email.`);
    }

    foundAttendees.push(user.email);
  }

  if (foundAttendees.length === 0) {
    throw new Error(`No valid attendees found`);
  }

  return foundAttendees;
};

/**
 * Validate meeting time is in future
 */
const validateMeetingTime = (meetingTime) => {
  const now = new Date();
  const timeDiff = meetingTime.getTime() - now.getTime();
  const minutesDiff = timeDiff / (1000 * 60);

  if (minutesDiff < 30) {
    // Suggest a time 1 hour from now
    const suggestedTime = new Date(now.getTime() + 60 * 60000);
    const timeStr = suggestedTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    throw new Error(`Meeting must be scheduled at least 30 minutes from now. Try scheduling for ${timeStr} or later.`);
  }
};

/**
 * Create meeting with all details
 * @param {Object} meetingData - Parsed meeting data
 * @param {string} userId - Creating user's ID
 * @param {string} userEmail - Creating user's email
 * @param {string} platform - "zoom" or "google"
 * @returns {Promise<Object>} Created meeting details
 */
const createAutomatedMeeting = async (meetingData, userId, userEmail, platform) => {
  try {
    // Validate integration is connected
    await validateIntegrationConnected(userId, platform);

    // Validate attendees and get actual email addresses
    const validatedAttendeeEmails = await validateAttendees(meetingData.attendees);
    
    // Validate meeting time
    validateMeetingTime(meetingData.suggestedTime);

    // Find best available time
    const finalTime = await findAvailableSlot(
      validatedAttendeeEmails,
      meetingData.suggestedTime,
      meetingData.duration
    );

    let meetingLink;

    // Get user's integration tokens
    const user = await Employee.findById(userId);
    if (!user) throw new Error("User not found");

    // Create meeting on selected platform
    if (platform === "zoom") {
      // Validate Zoom tokens exist
      if (!user.zoomAccessToken) {
        throw new Error("Zoom tokens not found. Please reconnect Zoom.");
      }
      
      const zoomResponse = await zoomService.createZoomMeeting(
        {
          title: meetingData.title,
          startTime: finalTime.toISOString(),
          endTime: new Date(finalTime.getTime() + meetingData.duration * 60000).toISOString(),
          timezone: "UTC",
          description: meetingData.description || ""
        },
        user.zoomAccessToken,
        user.zoomRefreshToken
      );

      if (!zoomResponse.success) {
        throw new Error(`Zoom API Error: ${zoomResponse.error || "Failed to create meeting"}`);
      }

      meetingLink = zoomResponse.meetingUrl;
      if (!meetingLink) throw new Error("Failed to get Zoom meeting link");
    } else if (platform === "google") {
      // Validate Google tokens exist
      if (!user.googleRefreshToken || !user.googleAccessToken) {
        throw new Error("Google Calendar tokens not found. Please reconnect Google.");
      }
      

      const googleResponse = await googleMeetService.createGoogleMeetMeeting(
        {
          title: meetingData.title,
          startTime: finalTime,
          endTime: new Date(finalTime.getTime() + meetingData.duration * 60000),
          organizerEmail: userEmail,
          attendees: validatedAttendeeEmails.map(email => ({ email })),
          description: meetingData.description || "",
          timezone: "IST"
        },
        {
          accessToken: user.googleAccessToken,
          refreshToken: user.googleRefreshToken
        }
      );

      if (!googleResponse.success) {
        throw new Error(`Google API Error: ${googleResponse.error || "Failed to create meeting"}`);
      }

      meetingLink = googleResponse.hangoutLink || googleResponse.meetingUrl;
      if (!meetingLink) throw new Error("Failed to get Google Meet link");
    } else {
      throw new Error("Invalid platform specified");
    }

    // Format attendees for database using validated emails
    const attendeeObjects = validatedAttendeeEmails.map(email => ({
      email: email,
      name: email.split('@')[0] // Extract name from email
    }));

    // Save meeting to database
    const meeting = new Meeting({
      title: meetingData.title,
      description: meetingData.description,
      attendees: attendeeObjects,
      startTime: finalTime,
      endTime: new Date(finalTime.getTime() + meetingData.duration * 60000),
      joinUrl: meetingLink,
      platform,
      organizerEmail: userEmail,
      createdBy: userId,
    });

    await meeting.save();

    // Send email invites
    try {
      await emailService.sendMeetingInvites({
        title: meetingData.title,
        attendees: attendeeObjects,
        startTime: finalTime,
        endTime: new Date(finalTime.getTime() + meetingData.duration * 60000),
        organizerEmail: userEmail,
        description: meetingData.description,
        joinUrl: meetingLink,
      });
    } catch (emailError) {
    }

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

/**
 * Get suggested time slots
 * @param {Array<string>} attendeeEmails
 * @param {Date} startDate
 * @param {number} duration
 * @returns {Promise<Array>} Available time slots
 */
const getSuggestedTimeSlots = async (
  attendeeEmails,
  startDate,
  duration
) => {
  try {
    const slots = [];
    const current = new Date(startDate);

    // Suggest 5 time slots
    for (let i = 0; i < 5; i++) {
      // Skip weekends
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        // Set to 9 AM, 10 AM, 2 PM, 3 PM, 4 PM
        const times = [9, 10, 14, 15, 16];
        for (const hour of times) {
          current.setHours(hour, 0, 0, 0);
          const isAvailable = await checkTimeSlot(
            attendeeEmails,
            new Date(current),
            duration
          );

          if (isAvailable) {
            slots.push(new Date(current));
            if (slots.length >= 5) break;
          }
        }
      }

      if (slots.length >= 5) break;
      current.setDate(current.getDate() + 1);
    }

    return slots;
  } catch (error) {
    throw error;
  }
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
