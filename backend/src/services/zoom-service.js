const axios = require('axios');

async function refreshZoomToken(refreshToken) {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const response = await axios.post('https://zoom.us/oauth/token', null, {
    params: { grant_type: 'refresh_token', refresh_token: refreshToken },
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return response.data;
}

async function createZoomMeeting(meetingData, accessToken, refreshToken) {
  try {
    const { title, startTime, endTime, timezone, description } = meetingData;
    const durationMinutes = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
    const payload = {
      topic: title,
      type: 2,
      start_time: new Date(startTime).toISOString(),
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

    const response = await axios.post('https://api.zoom.us/v2/users/me/meetings', payload, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });

    const { join_url, id } = response.data;
    return { success: true, meetingUrl: join_url, meetingId: String(id), platform: 'zoom' };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || error.message, meetingUrl: null, status: error.response?.status };
  }
}

async function deleteZoomMeeting(meetingId, accessToken, refreshToken) {
  try {
    await axios.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { success: true };
  } catch (error) {
    if (error.response?.status === 401 && refreshToken) {
      try {
        const refreshed = await refreshZoomToken(refreshToken);
        await axios.delete(`https://api.zoom.us/v2/meetings/${meetingId}`, {
          headers: { Authorization: `Bearer ${refreshed.access_token}` },
        });
        return { success: true, newTokens: refreshed };
      } catch {
        return { success: false, error: "Token refresh failed", status: 401 };
      }
    }
    return { success: false, error: error.response?.data?.message || error.message, status: error.response?.status };
  }
}

module.exports = { createZoomMeeting, refreshZoomToken, deleteZoomMeeting };
