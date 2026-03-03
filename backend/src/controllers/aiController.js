const chrono = require("chrono-node");
const aiService = require("../services/ai-service");
const schedulingService = require("../services/ai-scheduling-service");
const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const { deleteZoomMeeting } = require("../services/zoom-service");
const { deleteGoogleMeetEvent } = require("../services/google-meet-service");
const inferPlatformFromPrompt = (text) => {
  const lower = (text || "").toLowerCase();
  if (/zoom\b/.test(lower)) return "zoom";
  if (/google\s*meet|\bgoogle\b/.test(lower)) return "google";
  return null;
};

const scheduleFromPrompt = async (req, res) => {
  try {
    const { prompt, platform: userPlatform, contextAware } = req.body;
    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Please provide a meeting request" });

    const slotsIntent = /\b(next|show|find|get|what|check).*(slot|available|free|open\s*time)/i.test(prompt) ||
                        /\b(available|free)\s*(slot|time)/i.test(prompt);
    if (slotsIntent) {
      const slots = await schedulingService.getSuggestedTimeSlots([], new Date(), 60);
      return res.status(200).json({ success: true, availableSlots: slots.slice(0, 4) });
    }

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
    if (description.includes("NEEDS_ATTENDEES") && !meetingData.attendees?.length) {
      return res.status(400).json({ success: false, message: "Who should I invite to this meeting?", receivedData: meetingData });
    }
    if (description.includes("NEEDS_TIME") && !meetingData.timePreference) {
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

const cancelMeetingRecord = async (target, user) => {
  if (target.externalId && target.platform === "zoom") {
    const result = await deleteZoomMeeting(target.externalId, user.zoomAccessToken, user.zoomRefreshToken);
    if (!result.success) throw new Error(result.error || "Failed to cancel Zoom meeting");
  }
  if (target.externalId && (target.platform === "google" || target.platform === "meet")) {
    const result = await deleteGoogleMeetEvent(target.externalId, {
      refreshToken: user.googleRefreshToken,
      accessToken: user.googleAccessToken,
    });
    if (!result.success) throw new Error(result.error || "Failed to cancel Google meeting");
  }
  await Meeting.findByIdAndUpdate(target._id, {
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: user.email,
  });
};

const deleteFromPrompt = async (req, res) => {
  try {
    const { prompt } = req.body;
    const user = await Employee.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!prompt?.trim()) return res.status(400).json({ success: false, message: "Please specify which meeting to cancel" });

    if (!/(delete|cancel|remove|drop|discard)\b/i.test(prompt)) {
      return res.status(400).json({ success: false, message: "Please tell me which meeting to cancel." });
    }

    // 1. Cancel by ID
    const idMatch = prompt.match(/[a-f0-9]{24}/i);
    if (idMatch) {
      const meeting = await Meeting.findById(idMatch[0]);
      if (!meeting) return res.status(404).json({ success: false, message: "Meeting not found" });
      if (meeting.organizerEmail !== user.email) return res.status(403).json({ success: false, message: "Only the organizer can cancel this meeting" });
      await cancelMeetingRecord(meeting, user);
      return res.status(200).json({
        success: true,
        message: "Meeting cancelled successfully",
        deletedMeeting: { id: meeting._id, title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime, platform: meeting.platform, attendees: meeting.attendees },
      });
    }

    let meetings = [];

    // 2. Cancel by quoted title
    const titleMatch = prompt.match(/"([^"]+)"|'([^']+)'/);
    if (titleMatch) {
      const title = titleMatch[1] || titleMatch[2];
      meetings = await Meeting.find({ organizerEmail: user.email, title: { $regex: title, $options: "i" } }).sort({ startTime: -1 });
    }

    // 3. Cancel by parsed time (e.g. "cancel meet at 12pm mar 4")
    if (!meetings.length) {
      const stripped = prompt.replace(/\b(cancel|delete|remove|drop|discard)\b\s*(the\s+)?(meet(ing)?|call)?\s*/gi, "").trim();
      const parsedTime = chrono.parseDate(stripped);
      if (parsedTime) {
        const windowStart = new Date(parsedTime.getTime() - 30 * 60000);
        const windowEnd = new Date(parsedTime.getTime() + 30 * 60000);
        meetings = await Meeting.find({
          organizerEmail: user.email,
          startTime: { $gte: windowStart, $lte: windowEnd },
        }).sort({ startTime: 1 });
      }
    }

    // 4. Cancel by attendee name (e.g. "cancel meet with test user")
    if (!meetings.length) {
      const attendeeMatch = prompt.match(/\bwith\s+([a-zA-Z][a-zA-Z\s]{1,30})(?:\s+at|\s+on|\s+in|$)/i);
      if (attendeeMatch) {
        const name = attendeeMatch[1].trim();
        meetings = await Meeting.find({
          organizerEmail: user.email,
          $or: [
            { "attendees.name": { $regex: name, $options: "i" } },
            { "attendees.email": { $regex: name.replace(/\s+/g, "."), $options: "i" } },
          ],
          startTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }).sort({ startTime: 1 }).limit(5);
      }
    }

    if (!meetings.length) {
      return res.status(404).json({
        success: false,
        message: "No matching meeting found. Try specifying the time (e.g. 'cancel meet at 3pm today'), attendee name ('cancel meet with john'), or put the title in quotes.",
      });
    }

    if (meetings.length > 1) {
      const list = meetings.slice(0, 4).map((m, i) =>
        `${i + 1}. "${m.title}" — ${new Date(m.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
      ).join("\n");
      return res.status(409).json({
        success: false,
        message: `Found ${meetings.length} matching meetings. Which one do you want to cancel?\n\n${list}\n\nPut the title in quotes to cancel it.`,
      });
    }

    const target = meetings[0];
    if (target.organizerEmail !== user.email) return res.status(403).json({ success: false, message: "Only the organizer can cancel this meeting" });
    await cancelMeetingRecord(target, user);
    return res.status(200).json({
      success: true,
      message: "Meeting cancelled successfully",
      deletedMeeting: { id: target._id, title: target.title, startTime: target.startTime, endTime: target.endTime, platform: target.platform, attendees: target.attendees },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { scheduleFromPrompt, getSuggestedTimes, analyzeRequest, deleteFromPrompt };
