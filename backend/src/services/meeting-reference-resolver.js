const meetingOps = require("./meeting-operations");
const { parseTime } = require("../utilities/date-utils");

const STOP_WORDS = new Set(["meeting", "meet", "with", "on", "at", "for", "the", "a", "an", "my", "that", "this", "it"]);

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
  const parsedTime = action.time ? parseTime(action.time, timezone) : null;

  return {
    explicitId,
    attendeeTokens,
    title,
    titleTokens,
    refTokens,
    parsedTime,
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

  if (signals.explicitId) {
    const byId = await meetingOps.findMeetingsBySearch(signals.explicitId, userEmail, true, timezone);
    addAll(byId);
    if (buckets.length) return buckets;
  }

  if (signals.meetingRef) addAll(await meetingOps.findMeetingsBySearch(signals.meetingRef, userEmail, true, timezone));
  if (signals.title) addAll(await meetingOps.findMeetingsBySearch(signals.title, userEmail, true, timezone));
  if (signals.attendeeTokens.length) addAll(await meetingOps.findMeetingsBySearch(`with ${signals.attendeeTokens.join(" ")}`, userEmail, true, timezone));
  if (signals.parsedTime) addAll(await meetingOps.findMeetingsBySearch(signals.parsedTime.toISOString(), userEmail, true, timezone));

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
  }

  return score;
};

const resolveMeetingReference = async ({ userEmail, action, timezone = "UTC" }) => {
  const signals = extractSignals(action, timezone);
  const candidates = await collectSearchMatches({ userEmail, timezone, signals });
  const now = new Date();
  const future = candidates.filter((m) => new Date(m.startTime) > now);

  if (!future.length) return { status: "not_found", meetings: [] };

  const ranked = future
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
