const Meeting = require("../models/meeting");
const Employee = require("../models/employee");
const { sendMeetingReminder } = require("./email-invite-service");

let timer = null;
let isRunning = false;

const shouldSendReminder = ({ meeting, settings, now }) => {
  if (meeting.status !== "scheduled") return false;
  if (meeting.reminderSentAt) return false;
  if (!settings?.notifications?.emailRemindersEnabled) return false;
  const beforeMin = Number(settings.notifications.reminderMinutesBefore || 15);
  const reminderAt = new Date(new Date(meeting.startTime).getTime() - beforeMin * 60000);
  return reminderAt <= now && new Date(meeting.startTime) > now;
};

const processReminders = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const meetings = await Meeting.find({
      status: "scheduled",
      reminderSentAt: null,
      startTime: { $gt: now, $lte: horizon },
    }).select("title startTime endTime organizerEmail attendees joinUrl platform");

    if (!meetings.length) return;

    const emails = [...new Set(meetings.map((m) => m.organizerEmail).filter(Boolean))];
    const users = await Employee.find({ email: { $in: emails } }).select("email settings").lean();
    const userMap = new Map(users.map((u) => [u.email, u]));

    for (const meeting of meetings) {
      const owner = userMap.get(meeting.organizerEmail);
      if (!shouldSendReminder({ meeting, settings: owner?.settings, now })) continue;

      const minutesBefore = Number(owner?.settings?.notifications?.reminderMinutesBefore || 15);
      const recipients = [...(meeting.attendees || [])];
      if (meeting.organizerEmail && !recipients.find((a) => a.email === meeting.organizerEmail)) {
        recipients.push({ email: meeting.organizerEmail, name: meeting.organizerEmail.split("@")[0] });
      }
      if (!recipients.length) continue;

      try {
        await sendMeetingReminder({
          title: meeting.title,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          organizerEmail: meeting.organizerEmail,
          attendees: recipients,
          joinUrl: meeting.joinUrl || "",
          platform: meeting.platform,
        }, minutesBefore);

        await Meeting.updateOne({ _id: meeting._id, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } });
      } catch (_) {
        // keep reminderSentAt null for retry on next cycle
      }
    }
  } finally {
    isRunning = false;
  }
};

const startReminderScheduler = () => {
  if (timer) return;
  timer = setInterval(() => {
    processReminders().catch(() => null);
  }, 60 * 1000);
  processReminders().catch(() => null);
};

module.exports = {
  startReminderScheduler,
};

