const Meeting = require("../models/meeting");
const { hasBufferConflict } = require("./user-settings-policy");

/**
 * Core scheduling logic.
 * Consolidates logic from meeting-operations.js and ai-scheduling-service.js.
 */

/**
 * Checks if a specific time slot is available for a list of attendees.
 */
const isTimeAvailable = async (attendeeEmails, startTime, duration) => {
    try {
        const endTime = new Date(startTime.getTime() + duration * 60000);
        const query = {
            status: { $ne: "cancelled" },
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
        };

        if (attendeeEmails && attendeeEmails.length > 0) {
            query.$or = [
                { organizerEmail: { $in: attendeeEmails } },
                { "attendees.email": { $in: attendeeEmails } },
            ];
        }

        const conflict = await Meeting.findOne(query);
        return !conflict;
    } catch (err) {
        console.error("Availability check error:", err);
        return false; // Assume busy on error for safety
    }
};

/**
 * Suggests available time slots for a meeting.
 */
const suggestTimeSlots = async (attendeeEmails, timezone = "UTC", numSlots = 5, startDate = null, options = {}) => {
    const slots = [];
    const slotStepMinutes = 30;
    const slotDurationMinutes = Number(options.durationMinutes) || 60;
    const maxDaysToScan = options.maxDaysToScan || 14;
    const workDays = Array.isArray(options.workDays) && options.workDays.length ? options.workDays : [1, 2, 3, 4, 5];
    const workStartMinute = Number.isFinite(Number(options.workStartMinute)) ? Number(options.workStartMinute) : 9 * 60;
    const workEndMinute = Number.isFinite(Number(options.workEndMinute)) ? Number(options.workEndMinute) : 18 * 60;
    const ownerEmail = options.ownerEmail || null;
    const bufferMinutes = Number.isFinite(Number(options.bufferMinutes)) ? Number(options.bufferMinutes) : 0;
    const applyWorkingHours = Boolean(options.applyWorkingHours);

    const getParts = (date, tz) => {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(date);
        const pick = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
        const hour = pick("hour");
        return {
            year: pick("year"),
            month: pick("month"),
            day: pick("day"),
            hour: hour === 24 ? 0 : hour,
            minute: pick("minute"),
        };
    };

    const zonedDateTimeToUtc = (year, month, day, hour, minute, tz) => {
        const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
        const seen = getParts(guessUtc, tz);
        const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
        const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, 0);
        const deltaMs = seenUtc - desiredUtc;
        return new Date(guessUtc.getTime() - deltaMs);
    };

    const base = startDate ? new Date(startDate) : new Date();
    const baseInTz = getParts(base, timezone);
    let dayCursor = new Date(Date.UTC(baseInTz.year, baseInTz.month - 1, baseInTz.day));
    let scannedDays = 0;

    while (slots.length < numSlots && scannedDays < maxDaysToScan) {
        const dayParts = getParts(dayCursor, "UTC");
        if (applyWorkingHours) {
            const weekday = new Date(Date.UTC(dayParts.year, dayParts.month - 1, dayParts.day)).getUTCDay();
            if (!workDays.includes(weekday)) {
                dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
                scannedDays += 1;
                continue;
            }
        }

        const isFirstDay =
            dayParts.year === baseInTz.year &&
            dayParts.month === baseInTz.month &&
            dayParts.day === baseInTz.day;

        const baseMinuteOnDay = isFirstDay ? (baseInTz.hour * 60 + baseInTz.minute) : 0;
        let startMinute = Math.ceil(baseMinuteOnDay / slotStepMinutes) * slotStepMinutes;
        if (isFirstDay && startMinute <= baseMinuteOnDay) startMinute += slotStepMinutes;

        const fromMinute = applyWorkingHours ? Math.max(startMinute, workStartMinute) : startMinute;
        const toMinute = applyWorkingHours ? Math.max(fromMinute, workEndMinute - slotDurationMinutes) : (24 * 60 - slotDurationMinutes);

        for (let minuteOfDay = fromMinute; minuteOfDay <= toMinute; minuteOfDay += slotStepMinutes) {
            if (slots.length >= numSlots) break;
            const hour = Math.floor(minuteOfDay / 60);
            const minute = minuteOfDay % 60;
            const slotTime = zonedDateTimeToUtc(dayParts.year, dayParts.month, dayParts.day, hour, minute, timezone);

            if (slotTime <= base) continue;

            const attendeeFree = await isTimeAvailable(attendeeEmails, slotTime, slotDurationMinutes);
            if (!attendeeFree) continue;

            if (ownerEmail && bufferMinutes > 0) {
                const slotEnd = new Date(slotTime.getTime() + slotDurationMinutes * 60000);
                const blocked = await hasBufferConflict({
                    email: ownerEmail,
                    startTime: slotTime,
                    endTime: slotEnd,
                    bufferMinutes,
                });
                if (blocked) continue;
            }

            slots.push(slotTime);
        }
        dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
        scannedDays += 1;
    }
    return slots;
};

/**
 * Finds the first available slot starting from a preferred time.
 * Consolidates findAvailableSlot from ai-scheduling-service.js.
 */
const findFirstAvailableSlot = async (attendeeEmails, preferredTime, duration) => {
    if (await isTimeAvailable(attendeeEmails, preferredTime, duration)) return preferredTime;

    let searchTime = new Date(preferredTime);
    const maxChecks = (7 * 24 * 60) / 30; // 1 week of 30min slots
    for (let i = 0; i < maxChecks; i++) {
        searchTime.setMinutes(searchTime.getMinutes() + 30);
        if (await isTimeAvailable(attendeeEmails, searchTime, duration)) return searchTime;
    }
    return preferredTime; // Fallback
};

module.exports = {
    isTimeAvailable,
    suggestTimeSlots,
    findFirstAvailableSlot,
};
