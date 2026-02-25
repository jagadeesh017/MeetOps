# AI Scheduling Automation - Setup & Usage Guide

## Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Environment Variables
Add to your `.env` file:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

Get your OpenAI API key from: https://platform.openai.com/api-keys

### 3. Start Server
```bash
npm run dev
```

---

## API Endpoints

### 1. Schedule Meeting from Prompt
**Endpoint:** `POST /api/ai/schedule-meeting`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "prompt": "Schedule a meeting with john@company.com and sarah@company.com tomorrow at 2 PM for 1 hour",
  "platform": "zoom"
}
```

**Response (Success):**
```json
{
  "success": true,
  "meeting": {
    "id": "meeting_id_123",
    "title": "Team Sync",
    "startTime": "2024-02-25T14:00:00.000Z",
    "duration": 60,
    "attendees": ["john@company.com", "sarah@company.com"],
    "meetingLink": "https://zoom.us/j/123456789",
    "platform": "zoom"
  },
  "message": "Meeting created successfully for 2/25/2024, 2:00:00 PM"
}
```

**Example Prompts:**
- "Schedule a meeting with the marketing team next Tuesday at 3 PM"
- "Create a 1-hour sync with John and Sarah tomorrow morning"
- "Schedule a standup meeting with team on Friday at 10 AM"
- "Meeting with client about project review next week Thursday 2 PM"

---

### 2. Get Suggested Time Slots
**Endpoint:** `POST /api/ai/suggest-times`

**Authentication:** Required

**Request Body:**
```json
{
  "attendees": ["john@company.com", "sarah@company.com"],
  "duration": 60,
  "startDate": "2024-02-25"
}
```

**Response:**
```json
{
  "success": true,
  "suggestedTimes": [
    "2024-02-26T09:00:00.000Z",
    "2024-02-26T14:00:00.000Z",
    "2024-02-27T10:00:00.000Z",
    "2024-02-27T15:00:00.000Z",
    "2024-02-28T09:00:00.000Z"
  ],
  "duration": 60
}
```

---

### 3. Analyze Request (Test AI Parsing)
**Endpoint:** `POST /api/ai/analyze-request`

**Authentication:** Required

**Request Body:**
```json
{
  "prompt": "Meeting with Sarah and John on Friday 2 PM"
}
```

**Response:**
```json
{
  "success": true,
  "isValid": true,
  "extractedData": {
    "title": "Team Meeting",
    "attendees": ["sarah@company.com", "john@company.com"],
    "duration": 60,
    "description": "Team meeting",
    "timePreference": "Friday 2 PM",
    "suggestedTime": "2024-02-25T14:00:00.000Z"
  }
}
```

---

## How It Works

### Step-by-Step Process:

1. **User Sends Prompt** → "Schedule a meeting with team tomorrow 3 PM"
2. **AI Parsing** → OpenAI extracts: attendees, time, duration
3. **Availability Check** → System checks if everyone is free
4. **Time Optimization** → If conflict, suggests alternative time
5. **Meeting Creation** → Creates Zoom/Google Meet link
6. **Email Invites** → Sends calendar invites to all attendees
7. **Database Save** → Stores meeting in database
8. **Confirmation** → Returns success with meeting details

### Architecture Flow:

```
Frontend Request
    ↓
aiController.scheduleFromPrompt()
    ↓
aiService.parseMeetingPrompt() [Uses OpenAI]
    ↓
aiService.validateMeetingData()
    ↓
schedulingService.createAutomatedMeeting()
    ├→ findAvailableSlot()
    ├→ zoomService.createZoomMeeting() or googleMeetService.createGoogleMeeting()
    ├→ emailService.sendMeetingInvite()
    └→ Save to Meeting Database
    ↓
Return Success Response
```

---

## Features

✅ **Natural Language Processing** - Understands meeting requests in plain English
✅ **Automatic Time Detection** - Parses dates and times from text
✅ **Availability Checking** - Ensures all attendees are free
✅ **Multi-Platform Support** - Works with Zoom and Google Meet
✅ **Email Notifications** - Sends invites to all attendees
✅ **Database Integration** - Tracks AI-generated meetings

---

## Testing

### Using cURL:

```bash
curl -X POST http://localhost:5000/api/ai/schedule-meeting \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "prompt": "Schedule a meeting with john@company.com tomorrow at 2 PM",
    "platform": "zoom"
  }'
```

### Using Postman:

1. Create new POST request
2. URL: `http://localhost:5000/api/ai/schedule-meeting`
3. Headers: 
   - `Authorization: Bearer YOUR_JWT_TOKEN`
   - `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "prompt": "Schedule a meeting with team tomorrow 3 PM",
  "platform": "zoom"
}
```

---

## Error Handling

| Error | Status | Fix |
|-------|--------|-----|
| No OPENAI_API_KEY | 500 | Add API key to .env |
| Invalid prompt | 400 | Provide clear meeting request |
| Invalid platform | 400 | Use "zoom" or "google" |
| Attendee not found | 400 | Verify email addresses |
| No availability | 200 | System suggests alternatives |

---

## Security Notes

- All endpoints require JWT authentication
- OpenAI API key stored in .env (never commit)
- User ID extracted from JWT token
- Email addresses validated before meeting creation

---

## Future Enhancements

- [ ] Multi-language support
- [ ] Calendar integration (Outlook, iCloud)
- [ ] Recurring meeting support
- [ ] Meeting reminders
- [ ] Attendee preferences & timezone handling
- [ ] Meeting notes and recording links
