const Groq = require("groq-sdk");
const chrono = require("chrono-node");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Parse meeting prompt with AI
const parseMeetingPrompt = async (prompt, contextAware = false) => {
  try {
    const systemMessage = `You are an intelligent meeting scheduling assistant. Parse natural language requests into structured meeting data.

YOUR TASK:
Extract meeting details from user requests like "schedule a meet with testuser in zoom at 5pm today" or "call with frontend team now"

EXTRACT THESE FIELDS:
1. ATTENDEES: Names, emails, OR GROUP/TEAM names mentioned - Extract EXACTLY as stated
   - Individual: testuser, john, user5, john@email.com
   - Groups: frontend team, hr team, team a, team b, sales team, it team
2. PLATFORM: "zoom" if zoom mentioned, "google" if google/meet mentioned, null otherwise
3. TIME: ANY time reference including vague ones - Extract as timePreference:
   - Specific: "5pm today", "tomorrow at 2pm", "next monday"
   - Flexible: "now", "asap", "next available slot", "next avbl slot", "soonest", "earliest"
   - Relative: "in 1 hour", "in 30 minutes", "later today"
4. TITLE: Infer from context or use "Team Meeting" as default
5. DURATION: Default to 60 minutes unless specified

RESPONSE FORMAT (Always valid JSON):
{
  "title": "Meeting with testuser",
  "attendees": ["testuser"],
  "duration": 60,
  "description": "",
  "timePreference": "5pm today",
  "platform": "zoom",
  "confidence": "high",
  "isMeetingRequest": true
}

CRITICAL RULES:
- If you see "schedule", "meet", "meeting", "call" → isMeetingRequest: true
- If you see "zoom" → platform: "zoom"
- If you see "google" or "meet" → platform: "google"
- Extract attendees EXACTLY as written (testuser, user5, john, frontend team, hr team)
- Recognize GROUP names: "frontend team", "hr team", "team a", "team b", "sales team", "it team"
- Extract ANY time phrase (now, asap, next slot, 5pm, tomorrow) → timePreference
- If "now", "asap", "next available", "next slot" → timePreference: "next available slot"
- If NO time mentioned at all → description: "NEEDS_TIME"
- If missing attendees → description: "NEEDS_ATTENDEES"
- If missing platform → description: "NEEDS_PLATFORM_ASK"
- ALWAYS return valid JSON, no markdown, no explanations

EXAMPLES:
"schedule a meet with testuser in zoom at 5pm today" →
{"title":"Meeting with testuser","attendees":["testuser"],"duration":60,"description":"","timePreference":"5pm today","platform":"zoom","confidence":"high","isMeetingRequest":true}

"call with john in zoom on next available slot" →
{"title":"Call with john","attendees":["john"],"duration":60,"description":"","timePreference":"next available slot","platform":"zoom","confidence":"high","isMeetingRequest":true}

"meeting with user5 now on google meet" →
{"title":"Meeting with user5","attendees":["user5"],"duration":60,"description":"","timePreference":"now","platform":"google","confidence":"high","isMeetingRequest":true}
schedule meet with frontend team in zoom at 3pm" →
{"title":"Frontend Team Meeting","attendees":["frontend team"],"duration":60,"description":"","timePreference":"3pm","platform":"zoom","confidence":"high","isMeetingRequest":true}

"call with hr team now" →
{"title":"HR Team Call","attendees":["hr team"],"duration":60,"description":"","timePreference":"now","platform":null,"confidence":"high","isMeetingRequest":true}

"
"call with john" →
{"title":"Call with john","attendees":["john"],"duration":60,"description":"NEEDS_TIME NEEDS_PLATFORM_ASK","timePreference":null,"platform":null,"confidence":"low","isMeetingRequest":true}

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
