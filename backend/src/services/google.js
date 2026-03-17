const { google } = require('googleapis');

async function getGoogleCalendar(userTokens) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!userTokens.refreshToken) throw new Error("No Google refresh token provided");

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI || 'http://localhost');
  oauth2Client.setCredentials({ refresh_token: userTokens.refreshToken, access_token: userTokens.accessToken });

  let newTokens = null;
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    newTokens = credentials;
  } catch (refreshErr) {
    //refresh err
    const msg = refreshErr?.message || '';
    const data = refreshErr?.response?.data?.error || '';
    if (msg.includes('invalid_grant') || data === 'invalid_grant' || msg.includes('Token has been expired')) {
      throw new Error('invalid_grant');
    }
   
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    newTokens
  };
}

function handleGoogleError(error) {
  const msg = error?.message || '';
  if (msg === 'invalid_grant' || msg.includes('invalid_grant') || msg.includes('401') || msg.includes('Token has been expired')) {
    return { success: false, error: 'Invalid or expired Google token. Please reconnect.', tokenExpired: true };
  }
  return { success: false, error: error.response?.data?.error?.message || msg };
}

async function createGoogleMeetMeeting(meetingData, userTokens) {
  try {
    const { title, startTime, endTime, organizerEmail, attendees, timezone, description } = meetingData;
    const { calendar, newTokens } = await getGoogleCalendar(userTokens);

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

    const response = await calendar.events.insert({ calendarId: 'primary', resource: event, conferenceDataVersion: 1, sendUpdates: 'all' });
    const meetLink = response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || response.data.hangoutLink;
    if (!meetLink) throw new Error('Google Meet link not generated');

    return { success: true, meetingUrl: meetLink, hangoutLink: meetLink, eventId: response.data.id, platform: 'meet', newTokens };
  } catch (error) {
    return { ...handleGoogleError(error), meetingUrl: null };
  }
}

async function updateGoogleMeetEvent(eventId, updateData, userTokens) {
  try {
    const { title, startTime, endTime, timezone, description, attendees, organizerEmail } = updateData;
    const { calendar, newTokens } = await getGoogleCalendar(userTokens);

    const resource = {};
    if (title) resource.summary = title;
    if (description !== undefined) resource.description = description || '';
    if (startTime) resource.start = { dateTime: new Date(startTime).toISOString(), timeZone: timezone || 'IST' };
    if (endTime) resource.end = { dateTime: new Date(endTime).toISOString(), timeZone: timezone || 'IST' };
    if (attendees) {
      const googleAttendees = attendees.map(a => ({ email: typeof a === 'string' ? a : a.email }));
      if (organizerEmail) googleAttendees.unshift({ email: organizerEmail, organizer: true });
      resource.attendees = googleAttendees;
    }

    const response = await calendar.events.patch({ calendarId: 'primary', eventId, resource, sendUpdates: 'all' });
    return { success: true, eventId: response.data.id, newTokens };
  } catch (error) {
    return handleGoogleError(error);
  }
}

async function deleteGoogleMeetEvent(eventId, userTokens) {
  try {
    const { calendar, newTokens } = await getGoogleCalendar(userTokens);
    await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
    return { success: true, newTokens };
  } catch (error) {
    return handleGoogleError(error);
  }
}

module.exports = { createGoogleMeetMeeting, updateGoogleMeetEvent, deleteGoogleMeetEvent };
