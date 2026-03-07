const Meeting = require("../models/meeting");
const { parseTime } = require("./time-parser");

/**
 * Meeting lookup utilities.
 * Consolidates logic from meeting-operations.js.
 */

const findMeetingsBySearch = async (searchTerm, userEmail, upcomingOnly = true, timezone = "UTC") => {
    if (!searchTerm?.trim()) return [];
    const search = searchTerm.trim();
    const now = new Date();
    const base = {
        organizerEmail: userEmail,
        status: { $ne: "cancelled" },
        ...(upcomingOnly && { startTime: { $gte: now } }),
    };

    // 1. Direct ID lookup
    if (search.length === 24 && /^[0-9a-fA-F]{24}$/.test(search)) {
        const byId = await Meeting.findOne({ ...base, _id: search });
        if (byId) return [byId];
    }

    const timeIntent = parseTime(search, timezone);
    const nameMatch = search.match(/\b(?:with|for|at|on|in|to)\s+([a-zA-Z\s]+?)(?:\s+(?:at|on|in|to|with)|$)/i);
    const attendeeName = nameMatch ? nameMatch[1].trim() : null;

    // 2. Time-based search
    if (timeIntent) {
        const windowStart = new Date(timeIntent.getTime() - 30 * 60000);
        const windowEnd = new Date(timeIntent.getTime() + 30 * 60000);

        let query = { ...base, startTime: { $gte: windowStart, $lte: windowEnd } };

        if (attendeeName) {
            query.$or = [
                { title: { $regex: attendeeName, $options: "i" } },
                { "attendees.name": { $regex: attendeeName, $options: "i" } },
                { "attendees.email": { $regex: attendeeName, $options: "i" } }
            ];
        }

        const matches = await Meeting.find(query).sort({ startTime: 1 });
        if (matches.length) return matches;
    }

    // 3. Exact Title match
    const exact = await Meeting.find({
        ...base,
        title: { $regex: `^${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
    }).sort({ startTime: 1 });
    if (exact.length) return exact;

    // 4. Attendee name search
    if (attendeeName) {
        const r = await Meeting.find({
            ...base,
            $or: [
                { "attendees.name": { $regex: attendeeName, $options: "i" } },
                { "attendees.email": { $regex: attendeeName, $options: "i" } },
                { title: { $regex: attendeeName, $options: "i" } }
            ],
        }).sort({ startTime: 1 }).limit(10);
        if (r.length) return r;
    }

    // 5. Keyword search
    const kw = search.match(/\b([a-zA-Z]{3,})\b/);
    if (kw) {
        const r = await Meeting.find({ ...base, title: { $regex: kw[1], $options: "i" } }).sort({ startTime: 1 }).limit(10);
        if (r.length) return r;
    }

    return [];
};

const listResolvableMeetings = async (userEmail, upcomingOnly = true, limit = 30) => {
    const now = new Date();
    return Meeting.find({
        organizerEmail: userEmail,
        status: "scheduled",
        ...(upcomingOnly && { startTime: { $gte: now } }),
    }).sort({ startTime: 1 }).limit(limit).lean();
};

module.exports = {
    findMeetingsBySearch,
    listResolvableMeetings,
};
