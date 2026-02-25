const { google } = require('googleapis');

async function createGoogleMeetMeeting(meetingData, userTokens) {
    try {
        const { title, startTime, endTime, organizerEmail, attendees, timezone, description } = meetingData;
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

        if (!userTokens.refreshToken) {
            throw new Error("No Google refresh token provided");
        }

        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI || 'http://localhost'
        );

        oauth2Client.setCredentials({
            refresh_token: userTokens.refreshToken,
            access_token: userTokens.accessToken
        });

        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            oauth2Client.setCredentials(credentials);
        } catch (refreshError) {
        }

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const googleAttendees = (attendees || []).map(a => ({ 
            email: typeof a === 'string' ? a : a.email 
        }));

        if (organizerEmail) {
            googleAttendees.unshift({ email: organizerEmail, organizer: true });
        }

        const event = {
            summary: title,
            description: description || '',
            start: {
                dateTime: new Date(startTime).toISOString(),
                timeZone: timezone || 'IST',
            },
            end: {
                dateTime: new Date(endTime).toISOString(),
                timeZone: timezone || 'IST',
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
            hangoutLink: meetLink,
            eventId: createdEvent.id,
            platform: 'meet',
        };
    } catch (error) {
        const errMsg = error.response?.data?.error?.message || error.message;
        
        if (error.message.includes('invalid_grant') || error.message.includes('401') || error.message.includes('unauthorized')) {
            return {
                success: false,
                error: 'Invalid or expired Google token. Please reconnect your Google account.',
                meetingUrl: null,
            };
        }

        return {
            success: false,
            error: errMsg || 'Failed to create Google Meet',
            meetingUrl: null,
        };
    }
}

module.exports = { createGoogleMeetMeeting };
