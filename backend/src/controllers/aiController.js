const aiService = require("../services/ai-service");
const schedulingService = require("../services/ai-scheduling-service");
const Employee = require("../models/employee");

const inferPlatformFromPrompt = (text) => {
  const lower = (text || "").toLowerCase();
  if (/(google\s*meet|google|meet)\b/.test(lower)) return "google";
  if (/zoom\b/.test(lower)) return "zoom";
  return null;
};

const scheduleFromPrompt = async (req, res) => {
  try {
    const { prompt, platform: userPlatform, contextAware } = req.body;
    const userId = req.user.id;

    const user = await Employee.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a meeting request",
      });
    }

    let meetingData;
    try {
      meetingData = await aiService.parseMeetingPrompt(prompt, contextAware || false);
    } catch (parseError) {
      if (parseError.message && parseError.message.includes("specifically designed to help schedule meetings")) {
        return res.status(400).json({
          success: false,
          message: parseError.message,
        });
      }
      throw parseError;
    }

    if (!meetingData.platform) {
      const inferredPlatform = inferPlatformFromPrompt(prompt);
      if (inferredPlatform) {
        meetingData.platform = inferredPlatform;
      }
    }

    if (meetingData.isMeetingRequest === false) {
      return res.status(400).json({
        success: false,
        message: "I'm specifically designed to help schedule meetings. I can't assist with that. Would you like to schedule a meeting instead?",
      });
    }

    const description = meetingData.description || "";
    if (description.includes("NEEDS_PLATFORM_ASK")) {
      return res.status(400).json({
        success: false,
        message: "Which platform would you like to use? Zoom or Google Meet?",
        receivedData: meetingData,
      });
    }

    if (description.includes("NEEDS_ATTENDEES")) {
      return res.status(400).json({
        success: false,
        message: "Who should I invite to this meeting? Please provide attendee names or emails.",
        receivedData: meetingData,
      });
    }

    if (description.includes("NEEDS_TIME")) {
      return res.status(400).json({
        success: false,
        message: "When would you like to schedule this meeting? (e.g., tomorrow at 2pm, next Monday, in 1 hour)",
        receivedData: meetingData,
      });
    }

    if (!meetingData.title || !meetingData.attendees?.length || !meetingData.platform || !meetingData.timePreference) {
      return res.status(400).json({
        success: false,
        message: "Please provide: attendee name/email, date/time, and platform (Zoom/Google Meet).",
        receivedData: meetingData,
      });
    }

    let finalPlatform = meetingData.platform || userPlatform;
    
    if (!finalPlatform || !["zoom", "google"].includes(finalPlatform)) {
      return res.status(400).json({
        success: false,
        message: "Please mention Zoom or Google Meet in your request",
        receivedData: meetingData,
      });
    }

    if (finalPlatform === "zoom" && !user.zoomConnected) {
      return res.status(400).json({
        success: false,
        message: "Zoom is not connected. Please connect your Zoom account in integrations first.",
      });
    }

    if (finalPlatform === "google" && !user.googleConnected) {
      return res.status(400).json({
        success: false,
        message: "Google Meet is not connected. Please connect your Google account in integrations first.",
      });
    }

    const result = await schedulingService.createAutomatedMeeting(
      meetingData,
      userId,
      user.email,
      finalPlatform
    );

    return res.status(201).json(result);
  } catch (error) {
    let message = error.message;
    if (message && message.startsWith("Failed to create meeting:")) {
      message = message.replace(/^Failed to create meeting:\s*/i, "");
    }
    if (message && message.includes("User \"") && message.includes("not found")) {
      message = "One or more attendees were not found in the system. Please use a valid email address or add the user first.";
    }
    
    return res.status(400).json({
      success: false,
      message: message,
    });
  }
};

/**
 * Get suggested time slots for meeting
 * POST /api/ai/suggest-times
 */
const getSuggestedTimes = async (req, res) => {
  try {
    const { attendees, duration, startDate } = req.body;

    // Validate input
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide attendee emails",
      });
    }

    const meetingDuration = duration || 60;
    const startDateObj = startDate ? new Date(startDate) : new Date();

    const slots = await schedulingService.getSuggestedTimeSlots(
      attendees,
      startDateObj,
      meetingDuration
    );

    return res.status(200).json({
      success: true,
      suggestedTimes: slots,
      duration: meetingDuration,
    });
  } catch (error) {
    console.error("Error in getSuggestedTimes:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Analyze user request without creating meeting
 * POST /api/ai/analyze-request
 */
const analyzeRequest = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a request to analyze",
      });
    }

    // Parse without creating
    const meetingData = await aiService.parseMeetingPrompt(prompt);
    const isValid = aiService.validateMeetingData(meetingData);

    return res.status(200).json({
      success: true,
      isValid,
      extractedData: meetingData,
    });
  } catch (error) {
    console.error("Error in analyzeRequest:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  scheduleFromPrompt,
  getSuggestedTimes,
  analyzeRequest,
};
