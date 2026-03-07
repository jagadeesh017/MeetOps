const nodemailer = require('nodemailer');
const { buildInviteHTML, buildCancellationHTML, buildUpdateHTML } = require('./email-template-service');

const createTransporter = () => {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_SERVICE } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) throw new Error('Email credentials not configured');

  if (EMAIL_SERVICE === 'gmail' || (!EMAIL_HOST && EMAIL_USER.includes('@gmail.com'))) {
    return nodemailer.createTransport({ service: 'gmail', auth: { user: EMAIL_USER, pass: EMAIL_PASS } });
  }

  return nodemailer.createTransport({
    host: EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(EMAIL_PORT || '587'),
    secure: parseInt(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
};

const buildICS = ({ title, startTime, endTime, organizerEmail, attendees, description, joinUrl }) => {
  const icalLib = require('ical-generator');
  const createCal = icalLib.default || icalLib;
  const cal = createCal({ name: 'MeetOps' });
  const event = cal.createEvent({
    start: new Date(startTime),
    end: new Date(endTime),
    summary: title,
    description: `${description || ''}\n\nJoin: ${joinUrl || ''}`.trim(),
    organizer: { name: organizerEmail.split('@')[0], email: organizerEmail },
    url: joinUrl || '',
  });
  (attendees || []).forEach(a => {
    if (a.email) event.createAttendee({ email: a.email, name: a.name || a.email });
  });
  return cal.toString();
};

async function sendEmails(meetingData, { subject, htmlBuilder, includeICS = false }) {
  const { title, attendees = [] } = meetingData;
  if (attendees.length === 0) return { sent: 0, failed: 0, errors: [] };

  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    return { sent: 0, failed: 0, errors: [err.message] };
  }

  const htmlBody = htmlBuilder(meetingData);
  const attachments = includeICS
    ? [{ filename: 'invite.ics', content: buildICS(meetingData), contentType: 'text/calendar; method=REQUEST' }]
    : [];
  const results = { sent: 0, failed: 0, errors: [] };

  for (const attendee of attendees) {
    if (!attendee.email) continue;
    try {
      await transporter.sendMail({
        from: `"MeetOps" <${process.env.EMAIL_USER}>`,
        to: attendee.email,
        subject: subject.replace('{title}', title),
        html: htmlBody,
        ...(attachments.length > 0 && { attachments }),
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${attendee.email}: ${err.message}`);
    }
  }

  return results;
}

const sendMeetingInvites = (data) => sendEmails(data, { subject: '📅 Meeting Invite: {title}', htmlBuilder: buildInviteHTML, includeICS: true });
const sendMeetingCancellations = (data) => sendEmails(data, { subject: '❌ Meeting Cancelled: {title}', htmlBuilder: buildCancellationHTML });
const sendMeetingUpdates = (data) => sendEmails(data, { subject: '📝 Meeting Updated: {title}', htmlBuilder: buildUpdateHTML, includeICS: true });
const sendMeetingReminder = (data, minutesBefore = 15) =>
  sendEmails(
    data,
    {
      subject: `⏰ Reminder (${minutesBefore} min): {title}`,
      htmlBuilder: (meetingData) => {
        const when = new Date(meetingData.startTime).toLocaleString("en-US");
        return `
          <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">
            <h2 style="margin:0 0 10px;">Meeting reminder</h2>
            <p style="margin:0 0 10px;">Your meeting <strong>${meetingData.title}</strong> starts in <strong>${minutesBefore} minutes</strong>.</p>
            <p style="margin:0 0 10px;"><strong>Time:</strong> ${when}</p>
            ${meetingData.joinUrl ? `<p style="margin:0 0 10px;"><a href="${meetingData.joinUrl}" target="_blank" rel="noopener noreferrer">Join meeting</a></p>` : ""}
          </div>
        `;
      },
      includeICS: false,
    }
  );

module.exports = { sendMeetingInvites, sendMeetingCancellations, sendMeetingUpdates, sendMeetingReminder };
