const nodemailer = require('nodemailer');
function createTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_SERVICE } = process.env;

  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('Email credentials not configured. Set EMAIL_USER and EMAIL_PASS in .env');
  }

  // Gmail shortcut
  if (EMAIL_SERVICE === 'gmail' || (!EMAIL_HOST && EMAIL_USER.includes('@gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });
  }

  // Generic SMTP
  return nodemailer.createTransport({
    host: EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(EMAIL_PORT || '587'),
    secure: parseInt(EMAIL_PORT) === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
}


function buildICS({ title, startTime, endTime, organizerEmail, attendees, description, joinUrl }) {
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
    if (a.email) {
      event.createAttendee({ email: a.email, name: a.name || a.email });
    }
  });

  return cal.toString();
}


function buildHTML({ title, startTime, endTime, organizerEmail, attendees, description, joinUrl, platform }) {
  const PLATFORM_COLORS = {
    zoom: '#2D8CFF',
    meet: '#34A853',
    google: '#34A853',
    teams: '#6264a7',
  };
  const accentColor = PLATFORM_COLORS[platform] || '#2D8CFF';
  const platformLabel = platform === 'zoom' ? 'Zoom' : platform === 'meet' || platform === 'google' ? 'Google Meet' : platform === 'teams' ? 'Teams' : 'Meeting';

  const fmt = (d) => new Date(d).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });

  const attendeeNames = (attendees || []).map(a => a.name || a.email).join(', ') || 'None';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <!-- Header strip -->
        <tr><td style="background:${accentColor};height:6px;"></td></tr>
        <!-- Logo / App name -->
        <tr><td style="padding:28px 36px 0;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#111;">📅 MeetOps</p>
          <p style="margin:4px 0 0;font-size:13px;color:#888;">You have been invited to a meeting</p>
        </td></tr>
        <!-- Meeting title -->
        <tr><td style="padding:20px 36px 0;">
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#111;">${title}</h1>
        </td></tr>
        <!-- Details -->
        <tr><td style="padding:16px 36px;">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#555;width:110px;">🕐 Start</td>
              <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${fmt(startTime)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#555;">⏱ End</td>
              <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${fmt(endTime)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#555;">👤 Organizer</td>
              <td style="padding:6px 0;font-size:14px;color:#111;">${organizerEmail}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#555;">👥 Attendees</td>
              <td style="padding:6px 0;font-size:14px;color:#111;">${attendeeNames}</td>
            </tr>
            ${description ? `<tr>
              <td style="padding:6px 0;font-size:14px;color:#555;vertical-align:top;">📝 Notes</td>
              <td style="padding:6px 0;font-size:14px;color:#111;">${description}</td>
            </tr>` : ''}
          </table>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid #eee;margin:0;"></td></tr>
        <!-- Join button -->
        <tr><td style="padding:24px 36px;">
          ${joinUrl ? `
          <p style="margin:0 0 12px;font-size:14px;color:#555;">Click the button below to join the meeting:</p>
          <a href="${joinUrl}" style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">
            Join ${platformLabel} →
          </a>
          <p style="margin:12px 0 0;font-size:12px;color:#aaa;">Or copy this link: <a href="${joinUrl}" style="color:${accentColor};">${joinUrl}</a></p>
          ` : '<p style="margin:0;font-size:14px;color:#888;">No join link available yet.</p>'}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9f9f9;padding:16px 36px;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#aaa;">This invite was sent by MeetOps. A calendar file (.ics) is attached — open it to add this event to your calendar.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send meeting invites to all attendees.
 * @param {Object} meetingData - { title, startTime, endTime, organizerEmail, attendees, description, joinUrl, platform }
 * @returns {{ sent: number, failed: number, errors: string[] }}
 */
async function sendMeetingInvites(meetingData) {
  const { title, organizerEmail, attendees = [] } = meetingData;

  if (attendees.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  let transporter;
  try {
    transporter = createTransporter();
  } catch (err) {
    return { sent: 0, failed: 0, errors: [err.message] };
  }

  const icsContent = buildICS(meetingData);
  const htmlBody = buildHTML(meetingData);

  const results = { sent: 0, failed: 0, errors: [] };

  for (const attendee of attendees) {
    if (!attendee.email) continue;
    try {
      await transporter.sendMail({
        from: `"MeetOps" <${process.env.EMAIL_USER}>`,
        to: attendee.email,
        subject: `📅 Meeting Invite: ${title}`,
        html: htmlBody,
        attachments: [{
          filename: 'invite.ics',
          content: icsContent,
          contentType: 'text/calendar; method=REQUEST',
        }],
      });
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${attendee.email}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { sendMeetingInvites };
