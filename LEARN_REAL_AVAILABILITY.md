# Learn: Building Real Availability Check (Google Calendar + Zoom)

## 🎯 Goal
Currently, the app only checks meetings scheduled **inside MeetOps**. 
We want to check **real availability** from user's Google Calendar and Zoom account.

---

## 🤔 The Problem

**Current Situation:**
```
User has meeting at 10 AM scheduled directly on Google Calendar
↓
MeetOps doesn't know about it (only checks MeetOps database)
↓
MeetOps says "User is available" ❌ WRONG!
```

**What We Want:**
```
User has meeting at 10 AM on Google Calendar
↓
MeetOps fetches events from Google Calendar API
↓
MeetOps says "User is busy" ✅ CORRECT!
```

---

## 📚 Key Concepts You Need to Understand

### 1. What is an API?
**Simple Explanation**: A way for two programs to talk to each other

**Example**: 
- Your app asks Google: "Hey, give me all meetings for user@gmail.com"
- Google Calendar API responds: "Here's the list of meetings..."

### 2. How Do We Access User's Calendar?
We use **OAuth tokens** that user already gave us when they clicked "Connect Google"

**Remember**: When user connected Google, we saved:
- `googleAccessToken` - Short-lived key (expires in 1 hour)
- `googleRefreshToken` - Long-lived key (to get new access tokens)

### 3. What's the Flow?

```
User schedules meeting at 2 PM with Alice
↓
Check Alice's availability:
  ├─ Check MeetOps database (meetings created in MeetOps) ✅
  ├─ Check Alice's Google Calendar (via API) ✅
  └─ Check Alice's Zoom meetings (via API) ✅
↓
Combine all results
↓
Show if Alice is busy or free
```

---

## 🏗️ Architecture - What We'll Build

### New Functions Needed:

**1. Google Calendar Service** (`backend/src/services/google-meet-service.js`)
```javascript
getGoogleCalendarEvents(userTokens, startTime, endTime)
// Returns: List of events in that time range
```

**2. Zoom Service** (`backend/src/services/zoom-service.js`)
```javascript
getZoomMeetings(accessToken, startTime, endTime)
// Returns: List of Zoom meetings in that time range
```

**3. Enhanced Availability Check** (`backend/src/controllers/meetingController.js`)
```javascript
checkAttendeeAvailability()
// Now checks: DB + Google Calendar + Zoom
```

---

## 💻 Step-by-Step Implementation

### STEP 1: Add Google Calendar Fetching Function

**File**: `backend/src/services/google-meet-service.js`

**What to add**: A new function that fetches calendar events

```javascript
const { google } = require('googleapis');

// Add this NEW function at the end of the file
async function getGoogleCalendarEvents(userTokens, startTime, endTime) {
    try {
        // STEP 1.1: Setup OAuth client (same as existing createGoogleMeetMeeting)
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
        
        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            GOOGLE_REDIRECT_URI || 'http://localhost'
        );

        // STEP 1.2: Set user's tokens
        oauth2Client.setCredentials({
            refresh_token: userTokens.refreshToken,
            access_token: userTokens.accessToken
        });

        // STEP 1.3: Get calendar API
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // STEP 1.4: Fetch events in time range
        const response = await calendar.events.list({
            calendarId: 'primary',           // User's main calendar
            timeMin: new Date(startTime).toISOString(),  // Start of range
            timeMax: new Date(endTime).toISOString(),    // End of range
            singleEvents: true,              // Expand recurring events
            orderBy: 'startTime',            // Sort by start time
        });

        // STEP 1.5: Process events
        const events = response.data.items || [];
        
        // Filter out cancelled events and all-day events
        const busyEvents = events.filter(event => 
            event.status !== 'cancelled' &&     // Not cancelled
            event.start.dateTime                // Has specific time (not all-day)
        ).map(event => ({
            title: event.summary || 'Busy',     // Meeting title
            startTime: event.start.dateTime,    // When it starts
            endTime: event.end.dateTime,        // When it ends
            source: 'google_calendar',          // Where it's from
            eventId: event.id,
        }));

        // STEP 1.6: Return results
        return {
            success: true,
            events: busyEvents,
            newTokens: oauth2Client.credentials  // In case token was refreshed
        };
    } catch (error) {
        console.error('❌ Failed to fetch Google Calendar events:', error.message);
        return {
            success: false,
            error: error.message,
            events: []
        };
    }
}

// STEP 1.7: Export the new function
module.exports = { 
    createGoogleMeetMeeting,   // Existing
    getGoogleCalendarEvents    // NEW!
};
```

**Key Points to Understand:**

1. **`calendar.events.list()`**: Google's API method to get events
2. **`timeMin` and `timeMax`**: Define the time range we're checking
3. **`singleEvents: true`**: If someone has a recurring meeting, show each occurrence separately
4. **Filtering**: We skip cancelled events and all-day events (like birthdays)
5. **Mapping**: Convert Google's format to our format

---

### STEP 2: Add Zoom Meeting Fetching Function

**File**: `backend/src/services/zoom-service.js`

**What to add**: A new function that fetches Zoom meetings

```javascript
const axios = require('axios');

// Add this NEW function at the end of the file
async function getZoomMeetings(accessToken, startTime, endTime) {
    try {
        // STEP 2.1: Call Zoom API to get user's meetings
        const response = await axios.get(
            'https://api.zoom.us/v2/users/me/meetings',  // Zoom's endpoint
            {
                params: {
                    type: 'scheduled',    // Only scheduled meetings
                    page_size: 100        // Get up to 100 meetings
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,  // User's token
                },
            }
        );

        // STEP 2.2: Get meetings from response
        const meetings = response.data.meetings || [];
        
        // STEP 2.3: Convert times to Date objects for comparison
        const start = new Date(startTime);
        const end = new Date(endTime);

        // STEP 2.4: Filter meetings that overlap with our time range
        const conflictingMeetings = meetings.filter(meeting => {
            if (!meeting.start_time) return false;  // Skip if no start time
            
            // Calculate meeting end time (Zoom gives us start + duration)
            const meetingStart = new Date(meeting.start_time);
            const meetingEnd = new Date(meetingStart.getTime() + meeting.duration * 60000);
            
            // Check for overlap:
            // Meeting overlaps if it starts before our end AND ends after our start
            return meetingStart < end && meetingEnd > start;
        }).map(meeting => ({
            title: meeting.topic || 'Zoom Meeting',
            startTime: meeting.start_time,
            endTime: new Date(
                new Date(meeting.start_time).getTime() + meeting.duration * 60000
            ).toISOString(),
            source: 'zoom',
            meetingId: meeting.id,
            joinUrl: meeting.join_url
        }));

        // STEP 2.5: Return results
        return {
            success: true,
            meetings: conflictingMeetings
        };
    } catch (error) {
        console.error('❌ Failed to fetch Zoom meetings:', error.message);
        return {
            success: false,
            error: error.message,
            meetings: [],
            status: error.response?.status
        };
    }
}

// STEP 2.6: Export the new function
module.exports = { 
    createZoomMeeting,      // Existing
    refreshZoomToken,       // Existing
    getZoomMeetings         // NEW!
};
```

**Key Points to Understand:**

1. **Zoom's API endpoint**: `/users/me/meetings` returns all user's meetings
2. **Meeting duration**: Zoom doesn't give end time directly, we calculate it: `start + duration`
3. **Overlap logic**: Two events overlap if:
   - Event A starts before Event B ends, AND
   - Event A ends after Event B starts
4. **Why check overlap?**: User might have meeting 10-11 AM, we're checking 10:30-11:30 AM - they overlap!

---

### STEP 3: Update Availability Check Controller

**File**: `backend/src/controllers/meetingController.js`

**What to change**: Import new functions and use them

**At the top of file, change imports:**
```javascript
const { createZoomMeeting, refreshZoomToken, getZoomMeetings } = require("../services/zoom-service");
const { createGoogleMeetMeeting, getGoogleCalendarEvents } = require("../services/google-meet-service");
```

**Find the `checkAttendeeAvailability` function and replace it:**

```javascript
exports.checkAttendeeAvailability = async (req, res) => {
  try {
    const { attendees, startTime, endTime, excludeMeetingId } = req.body;

    // Validation
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0) {
      return res.status(400).json({ message: "Attendees array is required" });
    }

    if (!startTime || !endTime) {
      return res.status(400).json({ message: "Start time and end time are required" });
    }

    const newStart = new Date(startTime);
    const newEnd = new Date(endTime);

    if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const busyAttendees = [];

    // STEP 3.1: Check each attendee
    for (const attendee of attendees) {
      const email = attendee.email || attendee;
      
      // Find attendee's user record (to get their tokens)
      const attendeeUser = await Employee.findOne({ email });
      
      const conflicts = [];

      // STEP 3.2: Check MeetOps database (existing functionality)
      const dbConflict = await checkConflict(email, newStart, newEnd, excludeMeetingId);
      if (dbConflict) {
        conflicts.push({
          title: dbConflict.title,
          startTime: dbConflict.startTime,
          endTime: dbConflict.endTime,
          source: 'meetops',
          joinUrl: dbConflict.joinUrl,
        });
      }

      // STEP 3.3: Check Google Calendar (if connected)
      if (attendeeUser && attendeeUser.googleConnected) {
        try {
          const googleResult = await getGoogleCalendarEvents(
            {
              refreshToken: attendeeUser.googleRefreshToken,
              accessToken: attendeeUser.googleAccessToken,
            },
            startTime,
            endTime
          );

          if (googleResult.success && googleResult.events.length > 0) {
            conflicts.push(...googleResult.events);
            
            // Save refreshed tokens if any
            if (googleResult.newTokens) {
              if (googleResult.newTokens.access_token) {
                attendeeUser.googleAccessToken = googleResult.newTokens.access_token;
              }
              if (googleResult.newTokens.refresh_token) {
                attendeeUser.googleRefreshToken = googleResult.newTokens.refresh_token;
              }
              await attendeeUser.save();
            }
          }
        } catch (err) {
          console.error(`Failed to check Google Calendar for ${email}:`, err.message);
        }
      }

      // STEP 3.4: Check Zoom (if connected)
      if (attendeeUser && attendeeUser.zoomConnected) {
        try {
          let zoomResult = await getZoomMeetings(
            attendeeUser.zoomAccessToken,
            startTime,
            endTime
          );

          // If token expired, refresh and retry
          if (!zoomResult.success && zoomResult.status === 401 && attendeeUser.zoomRefreshToken) {
            const refreshedTokens = await refreshZoomToken(attendeeUser.zoomRefreshToken);
            attendeeUser.zoomAccessToken = refreshedTokens.access_token;
            if (refreshedTokens.refresh_token) {
              attendeeUser.zoomRefreshToken = refreshedTokens.refresh_token;
            }
            await attendeeUser.save();

            // Retry with new token
            zoomResult = await getZoomMeetings(
              attendeeUser.zoomAccessToken,
              startTime,
              endTime
            );
          }

          if (zoomResult.success && zoomResult.meetings.length > 0) {
            conflicts.push(...zoomResult.meetings);
          }
        } catch (err) {
          console.error(`Failed to check Zoom for ${email}:`, err.message);
        }
      }

      // STEP 3.5: If any conflicts found, add to busy list
      if (conflicts.length > 0) {
        busyAttendees.push({
          email,
          name: attendee.name || email,
          conflicts: conflicts,  // All conflicts from all sources
          conflictCount: conflicts.length,
          // For backward compatibility, send first conflict as "conflict"
          conflict: {
            title: conflicts[0].title,
            startTime: conflicts[0].startTime,
            endTime: conflicts[0].endTime,
            source: conflicts[0].source,
          },
        });
      }
    }

    // STEP 3.6: Return results
    return res.json({
      available: busyAttendees.length === 0,
      busyAttendees,
      checkedCount: attendees.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
```

**Key Points to Understand:**

1. **Sequential checking**: For each attendee, we check 3 sources
2. **Token handling**: If Google/Zoom tokens expired, we refresh them
3. **Error handling**: If Google/Zoom check fails, we continue (don't break everything)
4. **Combining results**: We collect ALL conflicts from all sources
5. **Backward compatibility**: Still works with frontend that expects single conflict

---

### STEP 4: Update Frontend to Show Multiple Conflicts

**File**: `frontend/src/components/ScheduleMeeting.jsx`

**Find the busy warning display section and update it:**

```javascript
{showBusyWarning && busyAttendees.length > 0 && (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded p-4 text-yellow-800 dark:text-yellow-300 text-sm">
        <div className="flex items-start gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
                <p className="font-semibold mb-1">Some attendees are busy</p>
                <p className="text-xs mb-2">The following attendees have conflicting meetings:</p>
                <ul className="space-y-2 text-xs">
                    {busyAttendees.map((attendee, idx) => (
                        <li key={idx} className="ml-4">
                            <strong>{attendee.name}</strong> ({attendee.email})
                            
                            {/* Show if they have multiple conflicts */}
                            {attendee.conflictCount > 1 && (
                                <span className="ml-2 px-2 py-0.5 bg-yellow-200 dark:bg-yellow-800 rounded text-xs">
                                    {attendee.conflictCount} conflicts
                                </span>
                            )}
                            
                            {/* Show all conflicts or just the first one */}
                            {attendee.conflicts ? (
                                <ul className="ml-4 mt-1 space-y-1">
                                    {attendee.conflicts.map((conflict, cIdx) => (
                                        <li key={cIdx} className="text-yellow-600 dark:text-yellow-400">
                                            <span className="font-semibold">{conflict.source === 'meetops' ? '📅 MeetOps' : conflict.source === 'google_calendar' ? '📆 Google Calendar' : '💼 Zoom'}</span>: "{conflict.title}"
                                            <br />
                                            {new Date(conflict.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                                            {new Date(conflict.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                // Fallback for old format
                                <div className="text-yellow-600 dark:text-yellow-400 ml-4">
                                    Busy with: "{attendee.conflict.title}" 
                                    ({new Date(attendee.conflict.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                                    {new Date(attendee.conflict.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={handleProceedAnyway}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium bg-yellow-600 dark:bg-yellow-700 text-white rounded hover:bg-yellow-700 dark:hover:bg-yellow-600 transition disabled:opacity-50"
                    >
                        Proceed Anyway
                    </button>
                    <button
                        onClick={() => setShowBusyWarning(false)}
                        className="px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    </div>
)}
```

---

## 🧪 Testing Your Implementation

### Test Case 1: Google Calendar Event
1. Go to your Google Calendar
2. Create a meeting at 2:00 PM - 3:00 PM
3. In MeetOps, try to schedule meeting at 2:30 PM with yourself
4. Should show: "You are busy with: 'Your Meeting Title' (Source: Google Calendar)"

### Test Case 2: Zoom Meeting
1. Create a Zoom meeting directly on zoom.us at 4:00 PM
2. In MeetOps, try to schedule at 4:00 PM
3. Should show: "Busy with Zoom meeting"

### Test Case 3: Multiple Conflicts
1. Have 2 meetings: One on Google (10 AM), one on Zoom (10:30 AM)
2. Try to schedule 10:00 AM - 11:00 AM
3. Should show: "2 conflicts" with both listed

---

## 🐛 Common Issues & Solutions

### Issue 1: "Failed to fetch Google Calendar events"
**Cause**: Access token expired
**Solution**: The code auto-refreshes tokens, but check if refresh token is valid

### Issue 2: "Zoom returns 401 Unauthorized"
**Cause**: Zoom token expired
**Solution**: Code handles this by refreshing, but user might need to reconnect

### Issue 3: "Shows busy when user is free"
**Cause**: Timezone issues
**Solution**: Make sure all times are in ISO format with timezone

### Issue 4: Not checking external calendars
**Cause**: User hasn't connected Google/Zoom
**Solution**: Code checks `if (user.googleConnected)` - they need to connect first

---

## 📊 Understanding the Data Flow

```
Frontend: User schedules meeting with Alice & Bob
↓
Backend: checkAttendeeAvailability() is called
↓
For Alice:
  ├─ Check MeetOps DB → Found: "Team Sync" at 10 AM
  ├─ Check Google Calendar → Found: "Client Call" at 10:30 AM
  └─ Check Zoom → Found: "1-on-1" at 11 AM
  Result: Alice has 3 conflicts ❌
↓
For Bob:
  ├─ Check MeetOps DB → Nothing
  ├─ Check Google Calendar → Nothing
  └─ Check Zoom → Nothing
  Result: Bob is free ✅
↓
Response to Frontend:
{
  available: false,
  busyAttendees: [
    {
      email: "alice@example.com",
      conflicts: [
        { title: "Team Sync", source: "meetops", ... },
        { title: "Client Call", source: "google_calendar", ... },
        { title: "1-on-1", source: "zoom", ... }
      ]
    }
  ]
}
↓
Frontend: Shows warning with all 3 conflicts
```

---

## ✅ Checklist - Did You Understand?

- [ ] I understand what an API is
- [ ] I understand OAuth tokens (access + refresh)
- [ ] I know how to call external APIs (Google, Zoom)
- [ ] I understand checking for time overlaps
- [ ] I know how to combine results from multiple sources
- [ ] I can handle errors (expired tokens, API failures)
- [ ] I can test the feature end-to-end

---

## 🚀 Next Steps After Implementation

1. **Add Microsoft Teams support** (similar to Zoom)
2. **Cache calendar data** (don't fetch every time)
3. **Show free time suggestions** (when all attendees are free)
4. **Add loading indicators** (while fetching from APIs)
5. **Handle rate limits** (APIs have usage limits)

---

## 💡 Pro Tips

1. **Always use try-catch**: External APIs can fail anytime
2. **Log everything**: Use `console.log` to debug API calls
3. **Test with real data**: Create actual Google/Zoom meetings to test
4. **Handle token refresh**: Access tokens expire, always handle refresh
5. **Don't break existing functionality**: Check DB first, external calendars as bonus

---

**You now have the complete blueprint to implement real availability checking! Take it step by step, test after each step, and you'll build it successfully!** 🎉
