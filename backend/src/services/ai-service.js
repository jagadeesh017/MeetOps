const Groq = require("groq-sdk");
const chrono = require("chrono-node");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const parseMeetingPrompt = async (prompt, contextAware = false) => {
  try {
    const systemMessage = `You are an intelligent meeting scheduling assistant. You MUST parse user requests into structured meeting data. You are fully responsible for handling all edge cases, context awareness, and validation.

YOUR RESPONSIBILITIES:
1. DETECT REQUEST TYPE: 
   - Meeting request = isMeetingRequest: true, extract all details
   - Non-meeting (recipe, weather, jokes, homework, coding, sports, news) = isMeetingRequest: false, leave other fields empty
   - Single-word context clues ("zoom", "tomorrow", "okay") = stay in context, treat as meeting continuation

2. EXTRACT FROM CONTEXT:
   - ALWAYS use full conversation history to infer missing details
   - If user says "okay" or "done" after describing a meeting = it's valid meeting context
   - Build on previous messages - don't lose attendees, times, or platforms from earlier

3. ATTENDEES - BE SMART:
   - Extract ALL attendees mentioned: names, emails, partial names, nicknames
   - Accept variations: "user5", "user 5", "user five", "john", "John Doe", "j.doe@mail.com"
   - Return EXACTLY as user said it (no normalization needed, backend will fuzzy-match)
   - If no attendees: set attendees: []

4. PLATFORM - ALWAYS INFER:
   - Explicit: "zoom" → "zoom", "meet"/"google" → "google"
   - From context: Previous messages mentioned zoom? Use "zoom". Google? Use "google"
   - Default if still missing: Ask user → set platform: null AND add to description: "NEEDS_PLATFORM_ASK"
   - Only valid: "zoom", "google", or null

5. TIME - BE FLEXIBLE:
   - Parse: "tomorrow", "next monday", "28th", "2pm", "3 PM tomorrow", "1 hour from now", "next free"
   - Return timePreference as exact user text
   - If vague ("next free"): still return it, backend will find slot
   - If no time: set timePreference: null

6. TITLE - INFER FROM CONTEXT:
   - From user: "meeting about X" → title: "X Discussion"
   - From attendees: "call with john" → title: "Call with John"
   - Default: "Team Meeting"

7. VALIDATION & SMART RESPONSES:
   - If meeting request BUT missing attendees: confidence: "low", add to description: "NEEDS_ATTENDEES"
   - If meeting request BUT missing platform: confidence: "low", add to description: "NEEDS_PLATFORM_ASK"
   - If meeting request BUT missing time: confidence: "low", add to description: "NEEDS_TIME", suggest "1 hour from now"
   - If all required fields (title, attendees, time, platform): confidence: "high"
   - NEVER fail - always return valid JSON, even if fields are incomplete

8. EDGE CASES:
   - "schedule meet" (no details) → attendees: [], confidence: "low", description: "NEEDS_ATTENDEES NEEDS_TIME NEEDS_PLATFORM_ASK"
   - "with user5" (after prior context) → use previous attendees + add user5
   - "in zoom" (single word) → set platform: "zoom", use previous attendees/time
   - "tomorrow 2pm zoom" (no attendees) → confidence: "low", still extract time & platform

RESPONSE FORMAT - ALWAYS RETURN VALID JSON:
{
  "title": "meeting title or null",
  "attendees": ["name1", "email@domain.com"],
  "duration": 60,
  "description": "brief description or special tags like NEEDS_ATTENDEES NEEDS_PLATFORM_ASK NEEDS_TIME",
  "timePreference": "time text or null",
  "platform": "zoom" or "google" or null,
  "confidence": "high/medium/low",
  "isMeetingRequest": true or false
}

CRITICAL EXAMPLES:
1. "schedule with user5" (no time/platform) → {title: "Team Meeting", attendees: ["user5"], timePreference: null, platform: null, confidence: "low", description: "NEEDS_TIME NEEDS_PLATFORM_ASK"}
2. "user5 tomorrow zoom" (from prior: "catch up call") → {title: "Catch Up Call", attendees: ["user5"], timePreference: "tomorrow", platform: "zoom", confidence: "high"}
3. "recipe for tea" → {isMeetingRequest: false, confidence: "high"}
4. "in google meet?" (prior: "with john 2pm") → {title: "Team Meeting", attendees: ["john"], timePreference: "2pm", platform: "google", confidence: "high"}

RULES:
- ALWAYS return valid JSON
- NEVER set isMeetingRequest: false for context clues
- NEVER leave out fields - use null if missing
- ALWAYS consider conversation history
- Duration defaults to 60 if not specified
- Return exactly what user said for attendees (fuzzy matching is backend's job)
- Provide confidence level based on completeness

Return ONLY valid JSON, no markdown, no explanations.`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: systemMessage,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    });


    const content = response.choices[0].message.content;
    
    // Remove markdown code blocks and clean up the response
    let jsonString = content.trim();
    
    // Remove markdown code blocks (```json ... ```)
    jsonString = jsonString.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "");
    jsonString = jsonString.replace(/^```\s*\n?/, "").replace(/\n?```\s*$/, "");
    
    // Extract JSON object if wrapped in text
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }
    
    const meetingDetails = JSON.parse(jsonString);

    if (meetingDetails.platform) {
      meetingDetails.platform = meetingDetails.platform.toLowerCase().trim();
      if (meetingDetails.platform.includes("google") || meetingDetails.platform.includes("meet")) {
        meetingDetails.platform = "google";
      } else if (meetingDetails.platform.includes("zoom")) {
        meetingDetails.platform = "zoom";
      } else {
        meetingDetails.platform = null;
      }
    }

    if (meetingDetails.timePreference) {
      const parsedDate = chrono.parseDate(meetingDetails.timePreference);
      
      if (parsedDate) {
        const now = new Date();
        const minTime = new Date(now.getTime() + 30 * 60000);
        
        if (parsedDate < minTime) {
          if (meetingDetails.timePreference.toLowerCase().includes('next') || 
              meetingDetails.timePreference.toLowerCase().includes('soon')) {
            const tomorrow = new Date(minTime);
            tomorrow.setDate(tomorrow.getDate() + 1);
            meetingDetails.suggestedTime = tomorrow;
          } else {
            meetingDetails.suggestedTime = minTime;
          }
        } else {
          meetingDetails.suggestedTime = parsedDate;
        }
      } else {
        meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
      }
    } else {
      meetingDetails.suggestedTime = new Date(Date.now() + 60 * 60000);
    }

    return meetingDetails;
  } catch (error) {
    throw new Error("Failed to parse meeting request: " + error.message);
  }
};

const validateMeetingData = (meetingData) => {
  return (
    meetingData.title &&
    Array.isArray(meetingData.attendees) &&
    meetingData.attendees.length > 0 &&
    meetingData.duration > 0
  );
};

module.exports = {
  parseMeetingPrompt,
  validateMeetingData,
};
