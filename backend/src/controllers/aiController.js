const aiService = require("../services/ai-service");
const schedulingService = require("../services/ai-scheduling-service");
const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const { deleteZoomMeeting } = require("../services/zoom-service");
const { deleteGoogleMeetEvent } = require("../services/google-meet-service");
const inferPlatformFromPrompt = (text) => {
  const lower = (text || "").toLowerCase();
  if (/(google\s*meet|google|meet)\b/.test(lower)) return "google";
  if (/zoom\b/.test(lower)) return "zoom";
  return null;
};

const scheduleFromPrompt = async (req, res) => {
  try {
    const { prompt, platform: userPlatform, contextAware } = req.body;
    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Please provide a meeting request" });

    let meetingData;
    try {
      meetingData = await aiService.parseMeetingPrompt(prompt, contextAware || false);
    } catch (parseError) {
      if (parseError.message?.includes("specifically designed to help schedule meetings")) {
        return res.status(400).json({ success: false, message: parseError.message });
      }
      throw parseError;
    }

    if (!meetingData.platform) meetingData.platform = inferPlatformFromPrompt(prompt);
    if (meetingData.isMeetingRequest === false) {
      return res.status(400).json({ success: false, message: "I'm specifically designed to help schedule meetings. Would you like to schedule a meeting instead?" });
    }

    const description = meetingData.description || "";
    // Only ask for platform if it is really missing
    if (!meetingData.platform && description.includes("NEEDS_PLATFORM_ASK")) {
      return res.status(400).json({ success: false, message: "Which platform would you like to use? Zoom or Google Meet?", receivedData: meetingData });
    }
    if (description.includes("NEEDS_ATTENDEES")) {
      return res.status(400).json({ success: false, message: "Who should I invite to this meeting?", receivedData: meetingData });
    }
    if (description.includes("NEEDS_TIME")) {
      return res.status(400).json({ success: false, message: "When would you like to schedule this meeting?", receivedData: meetingData });
    }

    if (!meetingData.title || !meetingData.attendees?.length || !meetingData.platform || !meetingData.timePreference) {
      return res.status(400).json({ success: false, message: "Please provide: attendee name/email, date/time, and platform (Zoom/Google Meet).", receivedData: meetingData });
    }

    const finalPlatform = meetingData.platform || userPlatform;
    if (!finalPlatform || !["zoom", "google"].includes(finalPlatform)) {
      return res.status(400).json({ success: false, message: "Please mention Zoom or Google Meet", receivedData: meetingData });
    }

    if (finalPlatform === "zoom" && !user.zoomConnected) {
      return res.status(400).json({ success: false, message: "Zoom is not connected. Please connect in integrations first." });
    }
    if (finalPlatform === "google" && !user.googleConnected) {
      return res.status(400).json({ success: false, message: "Google Meet is not connected. Please connect in integrations first." });
    }

    const cleanedDescription = (meetingData.description || "")
      .replace(/NEEDS_TIME/g, "")
      .replace(/NEEDS_ATTENDEES/g, "")
      .replace(/NEEDS_PLATFORM_ASK/g, "")
      .trim();

    const safeMeetingData = { ...meetingData, description: cleanedDescription || "" };

    const result = await schedulingService.createAutomatedMeeting(safeMeetingData, req.user.id, user.email, finalPlatform);
    return res.status(201).json(result);
  } catch (error) {
    let message = error.message.replace(/^Failed to create meeting:\s*/i, "");
    if (message.includes('User "') && message.includes("not found")) {
      message = "One or more attendees were not found. Please use a valid email.";
    }
    return res.status(400).json({ success: false, message });
  }
};

// Get suggested time slots
const getSuggestedTimes = async (req, res) => {
  try {
    const { attendees, duration, startDate } = req.body;
    if (!attendees?.length) return res.status(400).json({ success: false, message: "Please provide attendee emails" });

    const slots = await schedulingService.getSuggestedTimeSlots(attendees, startDate ? new Date(startDate) : new Date(), duration || 60);
    return res.status(200).json({ success: true, suggestedTimes: slots, duration: duration || 60 });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Analyze request without creating
const analyzeRequest = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Please provide a request to analyze" });

    const meetingData = await aiService.parseMeetingPrompt(prompt);
    const isValid = aiService.validateMeetingData(meetingData);
    return res.status(200).json({ success: true, isValid, extractedData: meetingData });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete meeting from natural language
const deleteFromPrompt = async (req, res) => {
  try {
    const { prompt } = req.body;
    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Please specify which meeting to delete" });

    if (!/(delete|cancel|remove|drop|discard)\b/i.test(prompt)) {
      return res.status(400).json({ success: false, message: "Please tell me which meeting to delete." });
    }

    const idMatch = prompt.match(/[a-f0-9]{24}/i);
    const titleMatch = prompt.match(/"([^"]+)"|'([^']+)'/);

    if (!idMatch && !titleMatch) {
      return res.status(400).json({ success: false, message: "Please provide the meeting ID or title in quotes." });
    }

    // Delete by ID
    if (idMatch) {
      const meeting = await Meeting.findById(idMatch[0]);
      if (!meeting) return res.status(404).json({ success: false, message: "Meeting not found" });
      if (meeting.organizerEmail !== user.email) return res.status(403).json({ success: false, message: "Only organizer can delete" });

      if (meeting.externalId && meeting.platform === "zoom") {
        const cancelResult = await deleteZoomMeeting(meeting.externalId, user.zoomAccessToken, user.zoomRefreshToken);
        if (!cancelResult.success) return res.status(502).json({ success: false, message: cancelResult.error || "Failed to cancel Zoom meeting" });
      }
      if (meeting.externalId && (meeting.platform === "google" || meeting.platform === "meet")) {
        const cancelResult = await deleteGoogleMeetEvent(meeting.externalId, {
          refreshToken: user.googleRefreshToken,
          accessToken: user.googleAccessToken,
        });
        if (!cancelResult.success) return res.status(502).json({ success: false, message: cancelResult.error || "Failed to cancel Google meeting" });
      }
      await Meeting.deleteOne({ _id: meeting._id });
      return res.status(200).json({
        success: true,
        message: "Meeting deleted successfully",
        deletedMeeting: { id: meeting._id, title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime, platform: meeting.platform, attendees: meeting.attendees },
      });
    }

    // Delete by title
    const title = titleMatch?.[1] || titleMatch?.[2];
    const meetings = await Meeting.find({ organizerEmail: user.email, title: { $regex: title, $options: "i" } }).sort({ startTime: -1 }).limit(2);
    if (meetings.length === 0) return res.status(404).json({ success: false, message: "Meeting not found" });
    if (meetings.length > 1) return res.status(409).json({ success: false, message: "Multiple meetings match. Please provide the meeting ID." });

    const target = meetings[0];
    if (target.externalId && target.platform === "zoom") {
      const cancelResult = await deleteZoomMeeting(target.externalId, user.zoomAccessToken, user.zoomRefreshToken);
      if (!cancelResult.success) return res.status(502).json({ success: false, message: cancelResult.error || "Failed to cancel" });
    }
    if (target.externalId && (target.platform === "google" || target.platform === "meet")) {
      const cancelResult = await deleteGoogleMeetEvent(target.externalId, {
        refreshToken: user.googleRefreshToken,
        accessToken: user.googleAccessToken,
      });
      if (!cancelResult.success) return res.status(502).json({ success: false, message: cancelResult.error || "Failed to cancel" });
    }
    await Meeting.deleteOne({ _id: target._id });

    return res.status(200).json({
      success: true,
      message: "Meeting deleted successfully",
      deletedMeeting: { id: target._id, title: target.title, startTime: target.startTime, endTime: target.endTime, platform: target.platform, attendees: target.attendees },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { scheduleFromPrompt, getSuggestedTimes, analyzeRequest, deleteFromPrompt };
