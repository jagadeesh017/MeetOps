function getPlatformColor(platform, fallback) {
  const COLORS = { zoom: '#2D8CFF', meet: '#34A853', google: '#34A853', teams: '#6264a7' };
  return COLORS[platform] || fallback;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function buildInviteHTML({ title, startTime, endTime, organizerEmail, attendees, description, joinUrl, platform }) {
  const color = getPlatformColor(platform, '#2D8CFF');
  const platformLabel = platform === 'zoom' ? 'Zoom' : platform === 'meet' || platform === 'google' ? 'Google Meet' : 'Meeting';
  const attendeeNames = (attendees || []).map((a) => a.name || a.email).join(', ') || 'None';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:${color};height:6px;"></td>
            </tr>
            <tr>
              <td style="padding:28px 36px 0;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#111;">📅 MeetOps</p>
                <p style="margin:4px 0 0;font-size:13px;color:#888;">You have been invited to a meeting</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px 0;">
                <h1 style="margin:0;font-size:20px;font-weight:700;color:#111;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;width:110px;">🕐 Start</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${formatDateTime(startTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;">⏱ End</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${formatDateTime(endTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;">👤 Organizer</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;">${organizerEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;">👥 Attendees</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;">${attendeeNames}</td>
                  </tr>
                  ${description ? `
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;vertical-align:top;">📝 Notes</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;">${description}</td>
                  </tr>` : ''}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px;">
                <hr style="border:none;border-top:1px solid #eee;margin:0;">
              </td>
            </tr>
            <tr>
              <td style="padding:24px 36px;">
                ${joinUrl ? `
                <p style="margin:0 0 12px;font-size:14px;color:#555;">Click the button below to join the meeting:</p>
                <a href="${joinUrl}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;">Join ${platformLabel} →</a>
                <p style="margin:12px 0 0;font-size:12px;color:#aaa;">Or copy this link: <a href="${joinUrl}" style="color:${color};">${joinUrl}</a></p>
                ` : '<p style="margin:0;font-size:14px;color:#888;">No join link available yet.</p>'}
              </td>
            </tr>
            <tr>
              <td style="background:#f9f9f9;padding:16px 36px;border-top:1px solid #eee;">
                <p style="margin:0;font-size:12px;color:#aaa;">This invite was sent by MeetOps. A calendar file (.ics) is attached — open it to add this event to your calendar.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildCancellationHTML({ title, startTime, endTime, organizerEmail, description, platform }) {
  const color = getPlatformColor(platform, '#dc2626');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:${color};height:6px;"></td>
            </tr>
            <tr>
              <td style="padding:28px 36px 0;">
                <p style="margin:0;font-size:22px;font-weight:700;color:#111;">📅 MeetOps</p>
                <p style="margin:4px 0 0;font-size:13px;color:#888;">A meeting has been cancelled</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 36px 0;">
                <h1 style="margin:0;font-size:20px;font-weight:700;color:#111;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 36px;">
                <table cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;width:110px;">🕐 Start</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${formatDateTime(startTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;">⏱ End</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;font-weight:500;">${formatDateTime(endTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;">👤 Organizer</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;">${organizerEmail}</td>
                  </tr>
                  ${description ? `
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#555;vertical-align:top;">📝 Notes</td>
                    <td style="padding:6px 0;font-size:14px;color:#111;">${description}</td>
                  </tr>` : ''}
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#f9f9f9;padding:16px 36px;border-top:1px solid #eee;">
                <p style="margin:0;font-size:12px;color:#aaa;">This cancellation was sent by MeetOps.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { buildInviteHTML, buildCancellationHTML };
