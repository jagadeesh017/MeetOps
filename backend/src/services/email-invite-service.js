const nodemailer = require('nodemailer');
const { buildInviteHTML, buildCancellationHTML } = require('./email-template-service');


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

async function sendMeetingInvites(meetingData) {
  const { title, organizerEmail, attendees = [] } = meetingData;
  if (attendees.length === 0) return { sent: 0, failed: 0, errors: [] };

  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    return { sent: 0, failed: 0, errors: [err.message] };
  }

  const icsContent = buildICS(meetingData);
  const htmlBody = buildInviteHTML(meetingData);
  const results = { sent: 0, failed: 0, errors: [] };

  for (const attendee of attendees) {
    if (!attendee.email) continue;
    try {
      await transporter.sendMail({
        from: `"MeetOps" <${process.env.EMAIL_USER}>`,
        to: attendee.email,
        subject: `📅 Meeting Invite: ${title}`,
        html: htmlBody,
        attachments: [{ filename: 'invite.ics', content: icsContent, contentType: 'text/calendar; method=REQUEST' }],
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${attendee.email}: ${err.message}`);
    }
  }

  return results;
}

async function sendMeetingCancellations(meetingData) {
  const { title, attendees = [] } = meetingData;
  if (attendees.length === 0) return { sent: 0, failed: 0, errors: [] };

  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    return { sent: 0, failed: 0, errors: [err.message] };
  }

  const htmlBody = buildCancellationHTML(meetingData);
  const results = { sent: 0, failed: 0, errors: [] };

  for (const attendee of attendees) {
    if (!attendee.email) continue;
    try {
      await transporter.sendMail({
        from: `"MeetOps" <${process.env.EMAIL_USER}>`,
        to: attendee.email,
        subject: `❌ Meeting Cancelled: ${title}`,
        html: htmlBody,
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${attendee.email}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { sendMeetingInvites, sendMeetingCancellations };
