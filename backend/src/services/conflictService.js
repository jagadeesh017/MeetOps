const Meeting = require("../models/meeting");


async function findConflicts(emails, startTime, endTime, excludeMeetingId = null) {
  if (!Array.isArray(emails) || emails.length === 0) return [];

  const query = {
    status: { $ne: "cancelled" },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    $or: [
      { organizerEmail: { $in: emails } },
      { "attendees.email": { $in: emails } },
    ],
  };

  if (excludeMeetingId) {
    query._id = { $ne: excludeMeetingId };
  }

  return Meeting.find(query).lean();
}

async function hasConflict(email, startTime, endTime, excludeMeetingId = null) {
  const conflicts = await findConflicts([email], startTime, endTime, excludeMeetingId);
  return conflicts.length > 0 ? conflicts[0] : null;
}

async function checkAttendeesConflicts(emails, proposedSlots) {
  const busyAttendees = [];

  const slotPromises = proposedSlots.map((slot) =>
    findConflicts(emails, slot.startTime, slot.endTime).then((conflicts) => ({ slot, conflicts }))
  );

  const results = await Promise.all(slotPromises);

  for (const { slot, conflicts } of results) {
    for (const conflict of conflicts) {
      const found = new Set();

      if (emails.includes(conflict.organizerEmail)) {
        found.add(conflict.organizerEmail);
      }
      if (Array.isArray(conflict.attendees)) {
        for (const a of conflict.attendees) {
          if (a && a.email && emails.includes(a.email)) {
            found.add(a.email);
          }
        }
      }

      for (const email of found) {
        if (!busyAttendees.find((b) => b.email === email)) {
          busyAttendees.push({
            email,
            conflictStart: conflict.startTime,
            conflictEnd: conflict.endTime,
          });
        }
      }
    }
    if (busyAttendees.length > 0) break;
  }

  return busyAttendees;
}

module.exports = { findConflicts, hasConflict, checkAttendeesConflicts };
