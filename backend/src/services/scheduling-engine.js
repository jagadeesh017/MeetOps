const { DateTime } = require("luxon");
const Meeting = require("../models/meeting");
const { hasBufferConflict } = require("./user-settings-policy");

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
        return false;
    }
};


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

    // Initial base time in the target timezone
    let dt = startDate ? DateTime.fromJSDate(new Date(startDate), { zone: timezone }) : DateTime.now().setZone(timezone);
    const originalBase = dt;
    let scannedDays = 0;

    while (slots.length < numSlots && scannedDays < maxDaysToScan) {
        if (applyWorkingHours && !workDays.includes(dt.weekday)) {
            dt = dt.plus({ days: 1 }).startOf('day');
            scannedDays++;
            continue;
        }

        const isFirstDay = dt.hasSame(originalBase, 'day');
        let currentDayStart;
        //day 1 should start from current time
        if (isFirstDay) {
            const currentMinuteOnDay = dt.hour * 60 + dt.minute;
            const startMinute = Math.ceil(currentMinuteOnDay / slotStepMinutes) * slotStepMinutes;
            currentDayStart = dt.startOf('day').plus({ minutes: Math.max(startMinute, applyWorkingHours ? workStartMinute : 0) });
            if (currentDayStart <= originalBase) currentDayStart = currentDayStart.plus({ minutes: slotStepMinutes });
        } else {
            currentDayStart = dt.startOf('day').plus({ minutes: applyWorkingHours ? workStartMinute : 0 });
        }

        const dayEndLimit = dt.startOf('day').plus({ minutes: applyWorkingHours ? workEndMinute - slotDurationMinutes : 1440 - slotDurationMinutes });

        let cursor = currentDayStart;
        while (cursor <= dayEndLimit && slots.length < numSlots) {
            const slotTime = cursor.toJSDate();

            const attendeeFree = await isTimeAvailable(attendeeEmails, slotTime, slotDurationMinutes);
            if (attendeeFree) {
                let bufferOk = true;
                if (ownerEmail && bufferMinutes > 0) {
                    const slotEnd = new Date(slotTime.getTime() + slotDurationMinutes * 60000);
                    const blocked = await hasBufferConflict({
                        email: ownerEmail,
                        startTime: slotTime,
                        endTime: slotEnd,
                        bufferMinutes,
                    });
                    if (blocked) bufferOk = false;
                }

                if (bufferOk) slots.push(slotTime);
            }
            cursor = cursor.plus({ minutes: slotStepMinutes });
        }

        dt = dt.plus({ days: 1 }).startOf('day');
        scannedDays++;
    }

    return slots;
};

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
