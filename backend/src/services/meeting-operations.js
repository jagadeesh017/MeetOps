const Employee = require("../models/employee");
const Meeting = require("../models/meeting");
const Cluster = require("../models/groups");
const zoomService = require("./zoom-service");
const googleMeetService = require("./google-meet-service");
const emailService = require("./email-invite-service");
const { hasConflict } = require("./conflictService");
const { saveAndInvite } = require("./meetingService");
const chrono = require("chrono-node");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const resolveAttendees = async (attendeeRefs) => {
  if (!attendeeRefs?.length) throw new Error("No attendees specified");

  const [allEmployees, allGroups] = await Promise.all([
    Employee.find().select("email name department").lean(),
    Cluster.find().select("name").lean(),
  ]);

  const addEmails = (emails, resolved) =>
    emails.forEach((e) => { if (!resolved.includes(e)) resolved.push(e); });

  const findGroupMembers = (search) => {
    const s = search.toLowerCase();
    const group = allGroups.find((g) => {
      const gn = g.name.toLowerCase();
      return gn === s || s.includes(gn) || gn.includes(s) ||
        s.split(/\s+/).some((w) => w.length > 1 && gn.includes(w));
    });
    if (!group) return null;

    const firstWord = group.name.split(" ")[0].toLowerCase();
    return allEmployees
      .filter((e) => e.department && e.department.toLowerCase().includes(firstWord))
      .map((e) => e.email);
  };

  const resolved = [];
  for (const ref of attendeeRefs) {
    const trimmed = ref.trim();

    if (EMAIL_REGEX.test(trimmed)) {
      addEmails([trimmed.toLowerCase()], resolved);
      continue;
    }

    const groupEmails = findGroupMembers(trimmed);
    if (groupEmails?.length) {
      addEmails(groupEmails, resolved);
      continue;
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, "");
    const employee = allEmployees.find((emp) => {
      const n = emp.name.toLowerCase().replace(/\s+/g, "");
      const e = emp.email.toLowerCase().replace(/\s+/g, "");
      return n.includes(normalized) || normalized.includes(n) || e.includes(normalized);
    });

    if (employee) {
      addEmails([employee.email], resolved);
    } else {
      throw new Error(`"${trimmed}" not found. Use a person name, email, or group name.`);
    }
  }
  return resolved;
};


const parseTime = (timeStr, timezone = "UTC") => {
  if (!timeStr) return null;

  const now = new Date();
  const parsed = chrono.parseDate(timeStr, now);
  if (!parsed) return null;

  try {
    const year = parsed.getFullYear();
    const month = parsed.getMonth();
    const date = parsed.getDate();
    const hours = parsed.getHours();
    const minutes = parsed.getMinutes();

    const utcTimestamp = Date.UTC(year, month, date, hours, minutes);

    const testDate = new Date(utcTimestamp);
    const tzStr = testDate.toLocaleString("en-US", { timeZone: timezone, hour12: false });

    const [dPart, tPart] = tzStr.split(", ");
    const [th, tm] = tPart.split(":").map(Number);

    const tzTimestamp = Date.UTC(
      parseInt(dPart.split("/")[2]),
      parseInt(dPart.split("/")[0]) - 1,
      parseInt(dPart.split("/")[1]),
      th === 24 ? 0 : th, tm, 0
    );

    const offset = tzTimestamp - utcTimestamp;
    return new Date(utcTimestamp - offset);
  } catch (e) {
    return parsed;
  }
};

const findMeetingsBySearch = async (searchTerm, userEmail, upcomingOnly = true, timezone = "UTC") => {
  if (!searchTerm?.trim()) return [];
  const search = searchTerm.trim();
  const now = new Date();
  const base = {
    organizerEmail: userEmail,
    status: { $ne: "cancelled" },
    ...(upcomingOnly && { startTime: { $gte: now } }),
  };

  if (search.length === 24 && /^[0-9a-fA-F]{24}$/.test(search)) {
    const byId = await Meeting.findOne({ ...base, _id: search });
    if (byId) return [byId];
  }

  const timeIntent = parseTime(search, timezone);
  const nameMatch = search.match(/\b(?:with|for|at|on|in|to)\s+([a-zA-Z\s]+?)(?:\s+(?:at|on|in|to|with)|$)/i);
  const attendeeName = nameMatch ? nameMatch[1].trim() : null;

  if (timeIntent) {
    const windowStart = new Date(timeIntent.getTime() - 30 * 60000);
    const windowEnd = new Date(timeIntent.getTime() + 30 * 60000);

    let query = { ...base, startTime: { $gte: windowStart, $lte: windowEnd } };

    if (attendeeName) {
      query.$or = [
        { title: { $regex: attendeeName, $options: "i" } },
        { "attendees.name": { $regex: attendeeName, $options: "i" } },
        { "attendees.email": { $regex: attendeeName, $options: "i" } }
      ];
    }

    const matches = await Meeting.find(query).sort({ startTime: 1 });
    if (matches.length) return matches;
  }

  const exact = await Meeting.find({ ...base, title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }).sort({ startTime: 1 });
  if (exact.length) return exact;

  if (attendeeName) {
    const r = await Meeting.find({
      ...base,
      $or: [{ "attendees.name": { $regex: attendeeName, $options: "i" } }, { "attendees.email": { $regex: attendeeName, $options: "i" } }, { title: { $regex: attendeeName, $options: "i" } }],
    }).sort({ startTime: 1 }).limit(10);
    if (r.length) return r;
  }

  const kw = search.match(/\b([a-zA-Z]{3,})\b/);
  if (kw) {
    const r = await Meeting.find({ ...base, title: { $regex: kw[1], $options: "i" } }).sort({ startTime: 1 }).limit(10);
    if (r.length) return r;
  }

  return [];
};

const isTimeAvailable = async (attendeeEmails, startTime, duration) => {
  const endTime = new Date(startTime.getTime() + duration * 60000);
  const conflict = await Meeting.findOne({
    status: { $ne: "cancelled" },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    $or: [{ organizerEmail: { $in: attendeeEmails } }, { "attendees.email": { $in: attendeeEmails } }],
  });
  return !conflict;
};

const suggestTimeSlots = async (attendeeEmails, timezone = "UTC", numSlots = 5, startDate = null) => {
  const slots = [];
  const workHours = [9, 10, 11, 14, 15, 16, 17];

  const setTZHour = (date, hour, tz) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const tzStr = d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const tzHour = parseInt(tzStr);
    const serverHour = d.getUTCHours();
    const diff = tzHour - serverHour;
    d.setUTCHours(hour - diff, 0, 0, 0);
    return d;
  };

  let current = startDate ? new Date(startDate) : new Date();

  while (slots.length < numSlots) {
    current.setDate(current.getDate() + 1);
    const day = current.getDay();
    if (day === 0 || day === 6) continue;

    for (const hour of workHours) {
      if (slots.length >= numSlots) break;
      const slotTime = setTZHour(current, hour, timezone);
      if (await isTimeAvailable(attendeeEmails, slotTime, 60)) {
        slots.push(slotTime);
      }
    }
  }
  return slots;
};

const createMeeting = async (userId, userEmail, details) => {
  const { title, attendees, platform = "zoom", duration = 60, description = "", parsedTime } = details;
  if (!parsedTime) throw new Error("Please provide a valid date and time.");
  if (!attendees?.length) throw new Error("Please specify at least one attendee.");
  if (new Date(parsedTime) <= new Date()) {
    throw new Error("Cannot schedule meeting for past date or time. Please select a future date and time.");
  }

  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");

  const resolvedEmails = await resolveAttendees(attendees);
  const safeAttendees = resolvedEmails.map((email) => ({ email }));
  const startTime = parsedTime;
  const endTime = new Date(parsedTime.getTime() + duration * 60000);

  const conflict = await hasConflict(userEmail, startTime, endTime);
  if (conflict) throw new Error(`You have a conflicting meeting: "${conflict.title}" at that time.`);

  const meetingPayload = { title, startTime, endTime, organizerEmail: userEmail, attendees: safeAttendees, description: description || "" };
  let joinUrl = null;
  let externalId = null;

  if (platform === "zoom") {
    if (!user.zoomConnected) throw new Error("Your Zoom account is not connected. Please connect it in Integrations.");
    let result = await zoomService.createZoomMeeting(meetingPayload, user.zoomAccessToken, user.zoomRefreshToken);
    if (!result.success && result.status === 400 && typeof result.error === "string" && result.error.toLowerCase().includes("refresh")) {
      const latestUser = await Employee.findById(userId);
      if (latestUser?.zoomRefreshToken && latestUser.zoomRefreshToken !== user.zoomRefreshToken) {
        result = await zoomService.createZoomMeeting(meetingPayload, latestUser.zoomAccessToken, latestUser.zoomRefreshToken);
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
    if (!result.success) throw new Error(result.error || "Failed to create Zoom meeting.");
    joinUrl = result.meetingUrl;
    externalId = result.meetingId;
  } else if (platform === "google" || platform === "meet") {
    if (!user.googleConnected) throw new Error("Your Google account is not connected. Please connect it in Integrations.");
    const result = await googleMeetService.createGoogleMeetMeeting(meetingPayload, { refreshToken: user.googleRefreshToken, accessToken: user.googleAccessToken });
    if (result.newTokens) {
      if (result.newTokens.access_token) user.googleAccessToken = result.newTokens.access_token;
      if (result.newTokens.refresh_token) user.googleRefreshToken = result.newTokens.refresh_token;
      await user.save();
    }
    if (!result.success) throw new Error(result.error || "Failed to create Google Meet.");
    joinUrl = result.meetingUrl;
    externalId = result.eventId;
  }

  const [meeting] = await saveAndInvite(
    [{ title, organizerEmail: userEmail, attendees: safeAttendees, platform, timezone: "UTC", description: description || "", joinUrl, externalId, startTime, endTime }],
    { title, startTime, endTime, organizerEmail: userEmail, attendees: safeAttendees, description: description || "", joinUrl, platform }
  );
  return meeting;
};

const updateMeeting = async (meetingId, userId, userEmail, updateData) => {
  const user = await Employee.findById(userId);
  if (!user) throw new Error("User not found.");

  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new Error("Meeting not found.");
  if (meeting.status === "cancelled") throw new Error("Cannot edit a cancelled meeting.");
  if (meeting.organizerEmail !== userEmail) throw new Error("Only the organizer can edit this meeting.");

  const { title, parsedTime, attendees, duration } = updateData;
  const newStart = parsedTime || meeting.startTime;
  const existingDurationMs = new Date(meeting.endTime) - new Date(meeting.startTime);
  const newEnd = parsedTime ? new Date(parsedTime.getTime() + (duration ? duration * 60000 : existingDurationMs)) : meeting.endTime;
  if (new Date(newStart) <= new Date()) {
    throw new Error("Cannot schedule meeting for past date or time. Please select a future date and time.");
  }

  if (parsedTime && meeting.externalId) {
    const platformPayload = { title: title || meeting.title, startTime: newStart, endTime: newEnd, organizerEmail: userEmail, attendees: meeting.attendees, description: meeting.description };
    if (meeting.platform === "zoom") {
      let result = await zoomService.updateZoomMeeting(meeting.externalId, platformPayload, user.zoomAccessToken, user.zoomRefreshToken);
      if (!result?.success && result?.status === 400 && typeof result.error === "string" && result.error.toLowerCase().includes("refresh")) {
        const latestUser = await Employee.findById(userId);
        if (latestUser?.zoomRefreshToken && latestUser.zoomRefreshToken !== user.zoomRefreshToken) {
          result = await zoomService.updateZoomMeeting(meeting.externalId, platformPayload, latestUser.zoomAccessToken, latestUser.zoomRefreshToken);
          if (result?.success && result.newTokens) {
            latestUser.zoomAccessToken = result.newTokens.access_token;
            if (result.newTokens.refresh_token) latestUser.zoomRefreshToken = result.newTokens.refresh_token;
            await latestUser.save();
          }
        }
      }
      if (result?.success && result.newTokens) {
        user.zoomAccessToken = result.newTokens.access_token;
        if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
        await user.save();
      }
    } else if (meeting.platform === "google" || meeting.platform === "meet") {
      await googleMeetService.updateGoogleMeetEvent(meeting.externalId, platformPayload, { refreshToken: user.googleRefreshToken, accessToken: user.googleAccessToken });
    }
  }

  if (title) meeting.title = title;
  if (parsedTime) { meeting.startTime = newStart; meeting.endTime = newEnd; }
  if (attendees?.length) {
    const resolvedEmails = await resolveAttendees(attendees);
    meeting.attendees = resolvedEmails.map((email) => ({ email }));
  }
  meeting.updatedAt = new Date();
  await meeting.save();

  if (meeting.attendees?.length) {
    emailService.sendMeetingUpdates({ title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime, organizerEmail: meeting.organizerEmail, attendees: meeting.attendees, description: meeting.description || "", joinUrl: meeting.joinUrl, platform: meeting.platform })
      .catch((err) => console.error("Email error:", err));
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
    if (meeting.platform === "zoom") {
      let result = await zoomService.deleteZoomMeeting(meeting.externalId, user.zoomAccessToken, user.zoomRefreshToken);
      if (!result?.success && result?.status === 400 && typeof result.error === "string" && result.error.toLowerCase().includes("refresh")) {
        const latestUser = await Employee.findById(userId);
        if (latestUser?.zoomRefreshToken && latestUser.zoomRefreshToken !== user.zoomRefreshToken) {
          result = await zoomService.deleteZoomMeeting(meeting.externalId, latestUser.zoomAccessToken, latestUser.zoomRefreshToken);
          if (result?.success && result.newTokens) {
            latestUser.zoomAccessToken = result.newTokens.access_token;
            if (result.newTokens.refresh_token) latestUser.zoomRefreshToken = result.newTokens.refresh_token;
            await latestUser.save();
          }
        }
      }
      if (result?.success && result.newTokens) {
        user.zoomAccessToken = result.newTokens.access_token;
        if (result.newTokens.refresh_token) user.zoomRefreshToken = result.newTokens.refresh_token;
        await user.save();
      }
    } else if (meeting.platform === "google" || meeting.platform === "meet") {
      await googleMeetService.deleteGoogleMeetEvent(meeting.externalId, { refreshToken: user.googleRefreshToken, accessToken: user.googleAccessToken });
    }
  }

  meeting.status = "cancelled";
  meeting.cancelledAt = new Date();
  meeting.cancelledBy = userEmail;
  await meeting.save();

  if (meeting.attendees?.length) {
    emailService.sendMeetingCancellations({ title: meeting.title, startTime: meeting.startTime, endTime: meeting.endTime, organizerEmail: meeting.organizerEmail, attendees: meeting.attendees, description: meeting.description || "", platform: meeting.platform })
      .catch((err) => console.error("Email error:", err));
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
  resolveAttendees,
  parseTime,
  findMeetingsBySearch,
  isTimeAvailable,
  suggestTimeSlots,
  createMeeting,
  updateMeeting,
  deleteMeeting,
};
