const Groq = require("groq-sdk");
const chrono = require("chrono-node");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const parseMeetingPrompt = async (prompt, contextAware = false) => {
  try {
    const systemMessage = `You are a helpful AI meeting scheduling assistant. You can understand conversational requests and context.

WHEN USER MENTIONS SLOTS (e.g., "schedule at 1st slot", "book slot 2", "first one"):
- Extract the slot reference: slot1, slot2, etc.
- Set timePreference to the exact slot phrase ("1st slot", "slot 2", "first one")
- Mark isMeetingRequest: true

WHEN USER PROVIDES PLATFORM ("zoom", "google", "meet"):
- If they previously asked about slots, combine: timePreference = "1st slot", platform = "zoom"
- If standalone, just extract platform

WHEN USER ASKS FOR AVAILABLE SLOTS:
- Phrases: "next available slots", "show free slots", "what slots", "find time"
- Return: {"isMeetingRequest": false, "isSlotQuery": true}

WHEN USER WANTS TO UPDATE/RESCHEDULE/CHANGE/MOVE/EDIT/MODIFY A MEETING:
- Detect phrases: "reschedule", "update", "change", "move", "edit", "modify", "push", "shift"
- Set isUpdateRequest: true, isMeetingRequest: false
- Extract meetingReference (title in quotes, attendee name after "with", time reference)
- Extract updateFields: newTime, newTitle, newDescription, newAttendees (only fields being changed)
- Example: "reschedule standup to 3pm" → isUpdateRequest:true, meetingReference:"standup", updateFields:{newTime:"3pm"}

EXTRACT THESE FIELDS:
1. ATTENDEES: Names, emails, teams (testuser, john@email.com, frontend team, hr team)
2. PLATFORM: "zoom" or "google" (recognize: zoom, google, google meet, meet)
3. TIME: Any time reference OR slot reference
   - Specific: "5pm today", "tomorrow at 2pm"
   - Slots: "1st slot", "slot 2", "first one", "second slot"
   - Flexible: "now", "asap", "next available"
4. TITLE: Infer from attendees/context or "Team Meeting"
5. DURATION: Default 60 minutes

RESPONSE FORMAT (valid JSON only):
{
  "title": "Meeting title",
  "attendees": ["name1", "name2"],
  "duration": 60,
  "description": "",
  "timePreference": "5pm" or "1st slot" or "next available slot",
  "platform": "zoom" or "google" or null,
  "confidence": "high" or "low",
  "isMeetingRequest": true,
  "isSlotQuery": false,
  "isUpdateRequest": false,
  "meetingReference": null,
  "updateFields": null
}

FOR UPDATE REQUESTS:
{
  "isMeetingRequest": false,
  "isUpdateRequest": true,
  "meetingReference": "standup" or "meeting with john" or "3pm meeting",
  "updateFields": {
    "newTime": "3pm tomorrow",
    "newTitle": "New Title",
    "newDescription": "Updated desc",
    "newAttendees": ["added@email.com"]
  }
}

CRITICAL RULES:
- "schedule", "meet", "meeting", "call", "book" → isMeetingRequest: true
- "reschedule", "update", "change time", "move", "edit", "modify" → isUpdateRequest: true
- "zoom" → platform: "zoom" (also: "zom", "zooom")
- "google", "google meet" → platform: "google" (NOT bare "meet")
- Slot references: "1st", "first", "slot 1", "#1" → timePreference: "1st slot"
- Short replies like "zoom", "google", "yes", "ok" → extract platform only, keep isMeetingRequest: true
- If missing critical info → description: "NEEDS_TIME" or "NEEDS_ATTENDEES" or "NEEDS_PLATFORM_ASK"
- ALWAYS return valid JSON, no markdown

Return ONLY valid JSON.`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: systemMessage }, { role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 1024,
    });

    let jsonString = response.choices[0].message.content.trim();
    jsonString = jsonString.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "")
      .replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonString = jsonMatch[0];

    const meetingDetails = JSON.parse(jsonString);

    if (meetingDetails.platform) {
      const p = meetingDetails.platform.toLowerCase().trim();
      meetingDetails.platform = (p.includes("google") || p.includes("meet")) ? "google" : p.includes("zoom") ? "zoom" : null;
    }

    if (meetingDetails.timePreference) {
      const timeLower = meetingDetails.timePreference.toLowerCase();

      if (timeLower.includes('now') || timeLower.includes('asap') ||
        timeLower.includes('next available') || timeLower.includes('next slot') ||
        timeLower.includes('soonest') || timeLower.includes('earliest') ||
        timeLower.includes('avbl')) {
        meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
      } else {
        let parsedDate = chrono.parseDate(meetingDetails.timePreference);
        if (parsedDate) {
          const minTime = new Date(Date.now() + 30 * 60000);
          meetingDetails.suggestedTime = parsedDate < minTime ? (meetingDetails.timePreference.toLowerCase().includes('next') || meetingDetails.timePreference.toLowerCase().includes('soon') ? new Date(minTime.getTime() + 24 * 60 * 60000) : minTime) : parsedDate;
        } else {
          meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
        }
      }
    }

    return meetingDetails;
  } catch (error) {
    throw new Error("Failed to parse meeting request: " + error.message);
  }
};

const validateMeetingData = (meetingData) => {
  return meetingData.title && Array.isArray(meetingData.attendees) && meetingData.attendees.length > 0 && meetingData.duration > 0;
};

module.exports = { parseMeetingPrompt, validateMeetingData };
