/**
 * One-time script to get a Google OAuth2 refresh token.
 *
 * Usage:
 *   1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env
 *   2. Run: node backend/scripts/get-google-token.js
 *   3. Open the printed URL in your browser, authorize, copy the code
 *   4. Paste the code when prompted
 *   5. Copy the printed refresh_token into backend/.env as GOOGLE_REFRESH_TOKEN
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { google } = require('googleapis');
const readline = require('readline');

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in backend/.env first.');
    process.exit(1);
}

// For Desktop apps, the redirect URI is usually 'urn:ietf:wg:oauth:2.0:oob' (deprecated by Google)
// or 'http://localhost' if you have a local server.
// If the user pasted a Web Client ID, they might need 'http://localhost:5000/auth/google/callback'
const redirectUri = GOOGLE_REDIRECT_URI || 'http://localhost';

const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    redirectUri
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh_token to be returned every time
});

console.log('\n📋 Step 1: Open this URL in your browser to authorize MeetOps:\n');
console.log('\x1b[36m%s\x1b[0m', authUrl); // Blue color for URL
console.log('\n📋 Step 2: After authorizing, you will be redirected.');
console.log('   - If you see a blank page or error, look at the browser URL bar.');
console.log('   - Copy the value of the "code" parameter (everything after code= and before any &).');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('\n👉 Paste the authorization code here: ', async (code) => {
    rl.close();
    try {
        console.log('⏳ Exchanging code for tokens...');
        const { tokens } = await oauth2Client.getToken(code.trim());

        if (tokens.refresh_token) {
            console.log('\n✅ Success! Add this line to your backend/.env:\n');
            console.log('\x1b[32m%s\x1b[0m', `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
            console.log('\n⚠️  Keep this token secret — it grants access to your Google Calendar.\n');
        } else {
            console.log('\n⚠️  Warning: Refresh token was not returned.');
            console.log('   Go to https://myaccount.google.com/permissions, remove MeetOps, and try again.');
        }
    } catch (err) {
        console.error('\n❌ Failed to exchange code for token:', err.message);
        console.log('\n💡 Tip: Make sure the Redirect URI in Google Cloud Console matches:', redirectUri);
    }
});

