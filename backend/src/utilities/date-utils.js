const chrono = require("chrono-node");
const { DateTime } = require("luxon");

const parseTime = (timeStr, timezone = "UTC") => {
    if (!timeStr) return null;

    const now = new Date();
    const parsed = chrono.parseDate(timeStr, now);
    if (!parsed) return null;

    try {
        // Use Luxon to interpret the parsed local date in the target timezone
        return DateTime.fromJSDate(parsed)
            .setZone(timezone, { keepLocalTime: true })
            .toJSDate();
    } catch (_) {
        return parsed;
    }
};

module.exports = {
    parseTime,
};
