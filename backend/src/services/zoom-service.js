const axios = require('axios');

async function refreshZoomToken(refreshToken) {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  const credentials = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  try {
    const response = await axios.post('https://zoom.us/oauth/token', null, {
      params: { grant_type: 'refresh_token', refresh_token: refreshToken },
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  } catch (error) {
    const msg =
      error.response?.data?.reason ||
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Zoom token refresh failed';
    throw new Error(msg);
  }
}

function getAxiosErrorDetails(error) {
  return {
    message:
      error.response?.data?.reason ||
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      'Unknown error',
    status: error.response?.status || null,
  };
}

function buildZoomPayload({ title, startTime, endTime, timezone, description }) {
  const payload = {};
  if (title) payload.topic = title;
  if (startTime) payload.start_time = new Date(startTime).toISOString();
  if (startTime && endTime) payload.duration = Math.round((new Date(endTime) - new Date(startTime)) / 60000);
  if (timezone) payload.timezone = timezone || 'UTC';
  if (description !== undefined) payload.agenda = description || '';
  payload.settings = { host_video: true, participant_video: true, join_before_host: true, waiting_room: false };
  return payload;
}

async function zoomRequestWithRetry(method, url, accessToken, refreshToken, data = null) {
  const makeRequest = (token) => {
    const headers = { Authorization: `Bearer ${token}` };
    if (data) headers['Content-Type'] = 'application/json';
    return data ? axios[method](url, data, { headers }) : axios[method](url, { headers });
  };

  try {
    const response = await makeRequest(accessToken);
    return { success: true, data: response.data };
  } catch (error) {
    const { message: errMsg, status: errStatus } = getAxiosErrorDetails(error);
    if (errStatus === 401 && refreshToken) {
      try {
        const refreshed = await refreshZoomToken(refreshToken);
        const response = await makeRequest(refreshed.access_token);
        return { success: true, data: response.data, newTokens: refreshed };
      } catch (refreshError) {
        const { message: refreshMsg, status: refreshStatus } = getAxiosErrorDetails(refreshError);
        return {
          success: false,
          error: `Zoom token refresh failed: ${refreshMsg || errMsg || "Unknown refresh error"}. Please reconnect Zoom if this continues.`,
          status: refreshStatus || 401,
        };
      }
    }
    if (errStatus === 401 && !refreshToken) {
      return {
        success: false,
        error: "Zoom access token expired and no refresh token is available. Please reconnect Zoom.",
        status: 401,
      };
    }
    return { success: false, error: errMsg, status: errStatus };
  }
}

async function createZoomMeeting(meetingData, accessToken, refreshToken) {
  const payload = buildZoomPayload(meetingData);
  payload.type = 2;
  payload.settings.auto_recording = 'none';
  payload.settings.email_notification = true;
  payload.settings.send_email_notification = true;

  const result = await zoomRequestWithRetry('post', 'https://api.zoom.us/v2/users/me/meetings', accessToken, refreshToken, payload);
  if (!result.success) return { ...result, meetingUrl: null };

  const { join_url, id } = result.data;
  return { success: true, meetingUrl: join_url, meetingId: String(id), platform: 'zoom', newTokens: result.newTokens };
}

async function updateZoomMeeting(meetingId, updateData, accessToken, refreshToken) {
  const payload = buildZoomPayload(updateData);
  return zoomRequestWithRetry('patch', `https://api.zoom.us/v2/meetings/${meetingId}`, accessToken, refreshToken, payload);
}

async function deleteZoomMeeting(meetingId, accessToken, refreshToken) {
  return zoomRequestWithRetry('delete', `https://api.zoom.us/v2/meetings/${meetingId}`, accessToken, refreshToken);
}

module.exports = { createZoomMeeting, refreshZoomToken, updateZoomMeeting, deleteZoomMeeting };
