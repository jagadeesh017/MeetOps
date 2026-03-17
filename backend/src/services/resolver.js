const meetingOps = require("./operations");
const { parseTime } = require("../utilities/date-utils");

const STOP_WORDS = new Set(["meeting", "meet", "with", "on", "at", "for", "the", "a", "an", "my", "that", "this", "it"]);

const DATE_HINT_REGEX = /\b(today|tomorrow|tonight|yesterday|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\d{1,4}[\/-]\d{1,2}(?:[\/-]\d{1,4})?/i;

const normalize = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9@\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value = "") =>
  normalize(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && !STOP_WORDS.has(t));

const extractSignals = (action = {}, timezone = "UTC") => {
  const meetingRef = String(action.meetingRef || "").trim();
  const explicitId = /^[0-9a-fA-F]{24}$/.test(meetingRef) ? meetingRef : null;
  const attendeeTokens = tokenize([...(action.attendees || []), meetingRef].join(" "));
  const title = String(action.title || "").trim();
  const titleTokens = tokenize(title);
  const refTokens = tokenize(meetingRef);
  const rawTime = String(action.time || "").trim();
  const parsedTime = rawTime ? parseTime(rawTime, timezone) : null;
  const timeHasExplicitDate = rawTime ? DATE_HINT_REGEX.test(rawTime) : false;

  return {
    explicitId,
    attendeeTokens,
    title,
    titleTokens,
    refTokens,
    rawTime,
    parsedTime,
    timeHasExplicitDate,
    meetingRef,
  };
};

const collectSearchMatches = async ({ userEmail, timezone, signals }) => {
  const buckets = [];
  const seen = new Set();
  const addAll = (rows = []) => {
    for (const row of rows || []) {
      if (!row?._id) continue;
      const id = String(row._id);
      if (!seen.has(id)) {
        seen.add(id);
        buckets.push(row);
      }
    }
  };

  const specificSearch = Boolean(signals.meetingRef || signals.title || signals.attendeeTokens.length || signals.parsedTime);
  const findUpcomingOnly = !specificSearch;

  if (signals.explicitId) {
    const byId = await meetingOps.findMeetingsBySearch(signals.explicitId, userEmail, findUpcomingOnly, timezone);
    addAll(byId);
    if (buckets.length) return buckets;
  }

  if (signals.meetingRef) addAll(await meetingOps.findMeetingsBySearch(signals.meetingRef, userEmail, findUpcomingOnly, timezone));
  if (signals.title) addAll(await meetingOps.findMeetingsBySearch(signals.title, userEmail, findUpcomingOnly, timezone));
  if (signals.attendeeTokens.length) addAll(await meetingOps.findMeetingsBySearch(`with ${signals.attendeeTokens.join(" ")}`, userEmail, findUpcomingOnly, timezone));
  if (signals.parsedTime) addAll(await meetingOps.findMeetingsBySearch(signals.parsedTime.toISOString(), userEmail, findUpcomingOnly, timezone));

  const fallback = await meetingOps.listResolvableMeetings(userEmail, true, 30);
  addAll(fallback);
  return buckets;
};

const scoreMeeting = (meeting, signals) => {
  const title = normalize(meeting?.title || "");
  const attendees = normalize((meeting?.attendees || []).map((a) => `${a.name || ""} ${a.email || ""}`).join(" "));
  const searchable = `${title} ${attendees}`.trim();

  let score = 0;

  if (signals.explicitId && String(meeting?._id) === signals.explicitId) score += 100;

  for (const token of signals.attendeeTokens) {
    if (attendees.includes(token)) score += 12;
    else if (title.includes(token)) score += 8;
  }

  for (const token of signals.titleTokens) {
    if (title.includes(token)) score += 10;
  }

  for (const token of signals.refTokens) {
    if (searchable.includes(token)) score += 4;
  }

  if (signals.parsedTime) {
    const diffMin = Math.abs(new Date(meeting.startTime).getTime() - signals.parsedTime.getTime()) / 60000;
    if (diffMin <= 5) score += 45;
    else if (diffMin <= 30) score += 35;
    else if (diffMin <= 120) score += 25;
    else if (diffMin <= 720) score += 12;

    if (!signals.timeHasExplicitDate) {
      const meetingDate = new Date(meeting.startTime);
      const targetDate = new Date(signals.parsedTime);
      const meetingMinuteOfDay = meetingDate.getUTCHours() * 60 + meetingDate.getUTCMinutes();
      const targetMinuteOfDay = targetDate.getUTCHours() * 60 + targetDate.getUTCMinutes();
      const clockDiff = Math.abs(meetingMinuteOfDay - targetMinuteOfDay);
      const wrappedClockDiff = Math.min(clockDiff, 1440 - clockDiff);

      if (wrappedClockDiff <= 5) score += 24;
      else if (wrappedClockDiff <= 30) score += 18;
      else if (wrappedClockDiff <= 60) score += 12;
    }
  }

  return score;
};

const resolveMeetingReference = async ({ userEmail, action, timezone = "UTC" }) => {
  const signals = extractSignals(action, timezone);
  const candidates = await collectSearchMatches({ userEmail, timezone, signals });
  const ranked = candidates
    .map((meeting) => ({ meeting, score: scoreMeeting(meeting, signals) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.meeting.startTime) - new Date(b.meeting.startTime);
    });

  const top = ranked[0];
  const second = ranked[1];
  const scoreGap = second ? top.score - second.score : top.score;

  if (top.score < 8) return { status: "not_found", meetings: [] };
  if (second && scoreGap < 8) {
    return { status: "ambiguous", meetings: ranked.slice(0, 5).map((r) => r.meeting) };
  }

  return { status: "resolved", meetings: [top.meeting], meeting: top.meeting };
};

module.exports = {
  resolveMeetingReference,
};
