function generateSlots(startTime, endTime, options = {}) {
  const { isRecurring, pattern, endDate, count } = options;

  const slots = [];
  const maxOccurrences = Math.min(count || 52, 52);

  let recurrenceEnd = null;
  if (endDate) {
    recurrenceEnd = new Date(endDate);
    recurrenceEnd.setHours(23, 59, 59, 999);
  }

  let currentStart = new Date(startTime);
  let currentEnd = new Date(endTime);
  const origStartDay = currentStart.getDate();
  const origEndDay = currentEnd.getDate();

  if (!isRecurring || !pattern) {
    slots.push({ startTime: new Date(currentStart), endTime: new Date(currentEnd) });
    return slots;
  }

  for (let i = 0; i < maxOccurrences; i += 1) {
    if (recurrenceEnd && currentStart > recurrenceEnd) break;

    slots.push({ startTime: new Date(currentStart), endTime: new Date(currentEnd) });

    switch (pattern) {
      case "daily":
        currentStart.setDate(currentStart.getDate() + 1);
        currentEnd.setDate(currentEnd.getDate() + 1);
        break;
      case "weekly":
        currentStart.setDate(currentStart.getDate() + 7);
        currentEnd.setDate(currentEnd.getDate() + 7);
        break;
      case "monthly": {
        const nextStartMonth = currentStart.getMonth() + 1;
        const nextEndMonth = currentEnd.getMonth() + 1;
        currentStart.setMonth(nextStartMonth, 1);
        currentStart.setDate(Math.min(origStartDay, new Date(currentStart.getFullYear(), nextStartMonth + 1, 0).getDate()));
        currentEnd.setMonth(nextEndMonth, 1);
        currentEnd.setDate(Math.min(origEndDay, new Date(currentEnd.getFullYear(), nextEndMonth + 1, 0).getDate()));
        break;
      }
      default:
        break;
    }
  }

  return slots;
}

module.exports = { generateSlots };
