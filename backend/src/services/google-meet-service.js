const { google } = require('googleapis');

async function createGoogleMeetMeeting(meetingData, userTokens) {
    try {
        const { title, startTime, endTime, organizerEmail, attendees, timezone, description } = meetingData;
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI || 'http://localhost'
        );

        oauth2Client.setCredentials({
            refresh_token: userTokens.refreshToken,
            access_token: userTokens.accessToken
        });

        // Add listener to save refreshed tokens
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                // If we get a new refresh token, we should update it in DB
                // This will be handled in the meeting controller or via a callback
                console.log('🔄 New Google refresh token received');
            }
            if (tokens.access_token) {
                console.log('🔄 New Google access token received');
            }
        });

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const googleAttendees = (attendees || []).map(a => ({ email: a.email }));

        if (organizerEmail) {
            googleAttendees.unshift({ email: organizerEmail, organizer: true });
        }

        const event = {
            summary: title,
            description: description || '',
            start: {
                dateTime: new Date(startTime).toISOString(),
                timeZone: timezone || 'UTC',
            },
            end: {
                dateTime: new Date(endTime).toISOString(),
                timeZone: timezone || 'UTC',
            },
            attendees: googleAttendees,
            conferenceData: {
                createRequest: {
                    requestId: `meetops-${Date.now()}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
            sendUpdates: 'all',
        });

        const createdEvent = response.data;
        const meetLink =
            createdEvent.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
            createdEvent.hangoutLink;

        if (!meetLink) {
            throw new Error('Google Meet link was not generated.');
        }

        return {
            success: true,
            meetingUrl: meetLink,
            eventId: createdEvent.id,
            platform: 'meet',
            // Return potential new tokens if they were refreshed
            newTokens: oauth2Client.credentials
        };
    } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        console.error('❌ Google Meet creation failed:', errMsg);
        return {
            success: false,
            error: errMsg,
            meetingUrl: null,
        };
    }
}

module.exports = { createGoogleMeetMeeting };
