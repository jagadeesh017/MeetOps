const chrono = require("chrono-node");

/**
 * Intelligent time parsing using chrono-node with timezone support.
 * Consolidates logic from meeting-operations.js.
 */
const parseTime = (timeStr, timezone = "UTC") => {
    if (!timeStr) return null;

    const now = new Date();
    const parsed = chrono.parseDate(timeStr, now);
    if (!parsed) return null;

    try {
        const y = parsed.getFullYear();
        const m = parsed.getMonth();
        const d = parsed.getDate();
        const h = parsed.getHours();
        const min = parsed.getMinutes();
        const utcTimestamp = Date.UTC(y, m, d, h, min);

        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(new Date(utcTimestamp));

        const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
        const seenHour = pick("hour");
        const tzTimestamp = Date.UTC(
            pick("year"),
            pick("month") - 1,
            pick("day"),
            seenHour === 24 ? 0 : seenHour,
            pick("minute"),
            0
        );
        const offset = tzTimestamp - utcTimestamp;
        return new Date(utcTimestamp - offset);
    } catch (_) {
        return parsed;
    }
};

module.exports = {
    parseTime,
};
