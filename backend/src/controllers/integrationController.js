const Employee = require('../models/employee');
const { google } = require('googleapis');
const axios = require('axios');

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'];
const ZOOM_SCOPES = 'meeting:write:meeting meeting:write:meeting:admin meeting:delete:meeting meeting:delete:meeting:admin meeting:write meeting:write:admin user:read:user user:read';
//google
const getGoogleClient = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID?.trim(),
  process.env.GOOGLE_CLIENT_SECRET?.trim(),
  process.env.GOOGLE_REDIRECT_URI?.trim()
);


exports.getGoogleAuthUrl = (req, res) => {
  const oauth2Client = getGoogleClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent',
    state: req.user.id 
  });
  res.json({ url });
};


exports.googleCallback = async (req, res) => {
  const { code, state } = req.query;
  try {
    const oauth2Client = getGoogleClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    await Employee.findByIdAndUpdate(state, {
      googleRefreshToken: tokens.refresh_token,
      googleAccessToken: tokens.access_token,
      googleConnected: true,
      googleEmail: userInfo.data.email
    });
    res.redirect('http://localhost:5173/dashboard?googleConnected=true');
  } catch (err) {
    res.redirect('http://localhost:5173/dashboard?error=google_failed');
  }
};

//Zoom
const getZoomRedirectUri = () => (process.env.ZOOM_REDIRECT_URI || 'http://localhost:5000/api/integrations/zoom/callback').trim();


exports.getZoomAuthUrl = (req, res) => {
   const redirectUri = getZoomRedirectUri();
  const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.ZOOM_CLIENT_ID?.trim()}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${req.user.id}&scope=${encodeURIComponent(ZOOM_SCOPES)}`;
  res.json({ url });
};


exports.zoomCallback = async (req, res) => {
  const { code, state } = req.query;
  const redirectUri = getZoomRedirectUri();

  try {
    const authHeader = Buffer.from(`${process.env.ZOOM_CLIENT_ID?.trim()}:${process.env.ZOOM_CLIENT_SECRET?.trim()}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);

    const response = await axios.post('https://zoom.us/oauth/token', params.toString(), {
      headers: { Authorization: `Basic ${authHeader}`, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
 
    const { access_token, refresh_token } = response.data;
    let zoomEmail = null;
    try {
      const userRes = await axios.get('https://api.zoom.us/v2/users/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      zoomEmail = userRes.data.email;
    } catch { }

    await Employee.findByIdAndUpdate(state, {
      zoomRefreshToken: refresh_token,
      zoomAccessToken: access_token,
      zoomConnected: true,
      zoomEmail
    });

    res.redirect('http://localhost:5173/dashboard?zoomConnected=true');
  } catch (err) {
    res.redirect('http://localhost:5173/dashboard?error=zoom_failed');
  }
};

//status
exports.getIntegrationStatus = async (req, res) => {
  try {
    const user = await Employee.findById(req.user.id);
    res.json({
      google: { connected: user.googleConnected, email: user.googleEmail },
      zoom: { connected: user.zoomConnected, email: user.zoomEmail }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Disconnect 
exports.disconnectIntegration = async (req, res) => {
  const { platform } = req.body;
  try {
    const updateData = platform === 'google' 
      ? { googleRefreshToken: null, googleAccessToken: null, googleConnected: false, googleEmail: null }
      : platform === 'zoom'
      ? { zoomRefreshToken: null, zoomAccessToken: null, zoomConnected: false, zoomEmail: null }
      : null;

    if (!updateData) return res.status(400).json({ message: 'Invalid platform' });

    await Employee.findByIdAndUpdate(req.user.id, updateData);
    res.json({ message: `${platform} disconnected successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
