const { google } = require('googleapis');

// Create Google Meet meeting
async function createGoogleMeetMeeting(meetingData, userTokens) {
  try {
    const { title, startTime, endTime, organizerEmail, attendees, timezone, description } = meetingData;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!userTokens.refreshToken) throw new Error("No Google refresh token provided");

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI || 'http://localhost');
    oauth2Client.setCredentials({ refresh_token: userTokens.refreshToken, access_token: userTokens.accessToken });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch { }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const googleAttendees = (attendees || []).map(a => ({ email: typeof a === 'string' ? a : a.email }));
    if (organizerEmail) googleAttendees.unshift({ email: organizerEmail, organizer: true });

    const event = {
      summary: title,
      description: description || '',
      start: { dateTime: new Date(startTime).toISOString(), timeZone: timezone || 'IST' },
      end: { dateTime: new Date(endTime).toISOString(), timeZone: timezone || 'IST' },
      attendees: googleAttendees,
      conferenceData: { createRequest: { requestId: `meetops-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    const meetLink = response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || response.data.hangoutLink;
    if (!meetLink) throw new Error('Google Meet link not generated');

    return { success: true, meetingUrl: meetLink, hangoutLink: meetLink, eventId: response.data.id, platform: 'meet' };
  } catch (error) {
    if (error.message.includes('invalid_grant') || error.message.includes('401')) {
      return { success: false, error: 'Invalid or expired Google token. Please reconnect.', meetingUrl: null };
    }
    return { success: false, error: error.response?.data?.error?.message || error.message, meetingUrl: null };
  }
}

// Delete Google Meet event
async function deleteGoogleMeetEvent(eventId, userTokens) {
  try {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
    if (!userTokens.refreshToken) throw new Error("No Google refresh token provided");

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI || 'http://localhost');
    oauth2Client.setCredentials({ refresh_token: userTokens.refreshToken, access_token: userTokens.accessToken });

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch { }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.response?.data?.error?.message || error.message };
  }
}

module.exports = { createGoogleMeetMeeting, deleteGoogleMeetEvent };
