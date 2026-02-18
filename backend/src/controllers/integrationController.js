const Employee = require('../models/employee');
const { google } = require('googleapis');
const axios = require('axios');

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'];

function getGoogleClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID?.trim(),
        process.env.GOOGLE_CLIENT_SECRET?.trim(),
        process.env.GOOGLE_REDIRECT_URI?.trim()
    );
}

const ZOOM_SCOPES = 'meeting:write user:read';

function getZoomRedirectUri() {
    return (process.env.ZOOM_REDIRECT_URI || 'http://localhost:5000/api/integrations/zoom/callback').trim();
}

exports.getGoogleAuthUrl = (req, res) => {
    const oauth2Client = getGoogleClient();
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: GOOGLE_SCOPES,
        prompt: 'consent',
        state: req.user.id // Pass user ID through state to identify them in callback
    });
    res.json({ url });
};

exports.googleCallback = async (req, res) => {
    const { code, state } = req.query;
    const userId = state;
    const oauth2Client = getGoogleClient();

    try {
        const { tokens } = await oauth2Client.getToken(code);

        // Get user info to store the connected email
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        await Employee.findByIdAndUpdate(userId, {
            googleRefreshToken: tokens.refresh_token,
            googleAccessToken: tokens.access_token,
            googleConnected: true,
            googleEmail: userInfo.data.email
        });

        // Redirect back to frontend
        res.redirect('http://localhost:5173/dashboard?googleConnected=true');
    } catch (err) {
        console.error('Google OAuth Error:', err.message);
        res.redirect('http://localhost:5173/dashboard?error=google_failed');
    }
};

exports.getZoomAuthUrl = (req, res) => {
    const redirectUri = getZoomRedirectUri();
    const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.ZOOM_CLIENT_ID?.trim()}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${req.user.id}&scope=meeting:write%20user:read:user`;
    res.json({ url });
};

exports.zoomCallback = async (req, res) => {
    const { code, state } = req.query;
    const userId = state;
    const redirectUri = getZoomRedirectUri();

    try {
        console.log('DEBUG: Zoom Callback received, userId:', userId);
        const authHeader = Buffer.from(`${process.env.ZOOM_CLIENT_ID?.trim()}:${process.env.ZOOM_CLIENT_SECRET?.trim()}`).toString('base64');

        // Use form data for better compatibility
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', redirectUri);

        const response = await axios.post('https://zoom.us/oauth/token', params.toString(), {
            headers: {
                Authorization: `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token } = response.data;
        console.log('DEBUG: Tokens received from Zoom');

        let zoomEmail = null;
        try {
            // Get user info (optional, don't fail if scope is missing)
            const userRes = await axios.get('https://api.zoom.us/v2/users/me', {
                headers: { Authorization: `Bearer ${access_token}` }
            });
            zoomEmail = userRes.data.email;
        } catch (userInfoError) {
            console.warn('DEBUG: Failed to fetch Zoom user info (likely missing user:read scope):', userInfoError.response?.data || userInfoError.message);
        }

        await Employee.findByIdAndUpdate(userId, {
            zoomRefreshToken: refresh_token,
            zoomAccessToken: access_token,
            zoomConnected: true,
            zoomEmail: zoomEmail
        });

        res.redirect('http://localhost:5173/dashboard?zoomConnected=true');
    } catch (err) {
        console.error('Zoom OAuth Error Details:');
        if (err.response) {
            console.error('Data:', err.response.data);
            console.error('Status:', err.response.status);
        } else {
            console.error('Message:', err.message);
        }
        res.redirect('http://localhost:5173/dashboard?error=zoom_failed');
    }
};

exports.getIntegrationStatus = async (req, res) => {
    try {
        const user = await Employee.findById(req.user.id);
        res.json({
            google: {
                connected: user.googleConnected,
                email: user.googleEmail
            },
            zoom: {
                connected: user.zoomConnected,
                email: user.zoomEmail
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
