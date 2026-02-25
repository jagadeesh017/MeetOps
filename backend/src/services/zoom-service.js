const axios = require('axios');

async function refreshZoomToken(refreshToken) {
    const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
    const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');

    const response = await axios.post('https://zoom.us/oauth/token', null, {
        params: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        },
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data; // { access_token, refresh_token, expires_in, ... }
}

async function createZoomMeeting(meetingData, accessToken, refreshToken) {
    try {
        const { title, startTime, endTime, timezone, description } = meetingData;

        const start = new Date(startTime);
        const end = new Date(endTime);
        const durationMinutes = Math.round((end - start) / 60000);

        const payload = {
            topic: title,
            type: 2, // Scheduled meeting
            start_time: start.toISOString(),
            duration: durationMinutes,
            timezone: timezone || 'UTC',
            agenda: description || '',
            settings: {
                host_video: true,
                participant_video: true,
                join_before_host: true,
                waiting_room: false,
                auto_recording: 'none',
                email_notification: true,
                send_email_notification: true,
            },
        };

        const response = await axios.post(
            'https://api.zoom.us/v2/users/me/meetings',
            payload,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const { join_url, id } = response.data;

        return {
            success: true,
            meetingUrl: join_url,
            meetingId: String(id),
            platform: 'zoom',
        };
    } catch (error) {
        const errMsg = error.response?.data?.message || error.message;
        return {
            success: false,
            error: errMsg,
            meetingUrl: null,
            status: error.response?.status
        };
    }
}

module.exports = { createZoomMeeting, refreshZoomToken };
