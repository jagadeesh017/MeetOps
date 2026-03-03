const Groq = require("groq-sdk");
const chrono = require("chrono-node");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Parse meeting prompt with AI
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
  "isSlotQuery": false
}

CRITICAL RULES:
- "schedule", "meet", "meeting", "call", "book" → isMeetingRequest: true
- "zoom" → platform: "zoom" (also: "zom", "zooom")
- "google", "google meet" → platform: "google" (NOT bare "meet")
- Slot references: "1st", "first", "slot 1", "#1" → timePreference: "1st slot"
- Short replies like "zoom", "google", "yes", "ok" → extract platform only, keep isMeetingRequest: true
- If missing critical info → description: "NEEDS_TIME" or "NEEDS_ATTENDEES" or "NEEDS_PLATFORM_ASK"
- ALWAYS return valid JSON, no markdown

EXAMPLES:
"schedule at 1st slot" → {"isMeetingRequest":true,"timePreference":"1st slot","platform":null,"description":"NEEDS_ATTENDEES NEEDS_PLATFORM_ASK"}
"zoom" (after slots shown) → {"isMeetingRequest":true,"platform":"zoom","description":""}
"next available slots" → {"isMeetingRequest":false,"isSlotQuery":true}
"meeting with john tomorrow at 3pm on zoom" → {"title":"Meeting with john","attendees":["john"],"timePreference":"tomorrow at 3pm","platform":"zoom","isMeetingRequest":true}

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
      
      // Handle flexible time phrases
      if (timeLower.includes('now') || timeLower.includes('asap') || 
          timeLower.includes('next available') || timeLower.includes('next slot') ||
          timeLower.includes('soonest') || timeLower.includes('earliest') ||
          timeLower.includes('avbl')) {
        // Schedule 1 hour from now for flexible requests
        meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
      } else {
        // Parse specific date/time
        let parsedDate = chrono.parseDate(meetingDetails.timePreference);
        if (parsedDate) {
          const minTime = new Date(Date.now() + 30 * 60000);
          meetingDetails.suggestedTime = parsedDate < minTime ? (meetingDetails.timePreference.toLowerCase().includes('next') || meetingDetails.timePreference.toLowerCase().includes('soon') ? new Date(minTime.getTime() + 24 * 60 * 60000) : minTime) : parsedDate;
        } else {
          meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
        }
      }
    }
    // Don't auto-set suggestedTime if no timePreference - let controller ask user for time

    return meetingDetails;
  } catch (error) {
    throw new Error("Failed to parse meeting request: " + error.message);
  }
};

// Validate meeting data structure
const validateMeetingData = (meetingData) => {
  return meetingData.title && Array.isArray(meetingData.attendees) && meetingData.attendees.length > 0 && meetingData.duration > 0;
};

module.exports = { parseMeetingPrompt, validateMeetingData };
