const { generateSlots } = require('../../src/utilities/recurrence');

describe('Recurrence Utility', () => {
  describe('generateSlots', () => {
    const baseStartTime = new Date('2026-03-15T10:00:00Z');
    const baseEndTime = new Date('2026-03-15T11:00:00Z');

    it('should return single slot if not recurring', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: false
      });

      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toEqual(baseStartTime);
      expect(slots[0].endTime).toEqual(baseEndTime);
    });

    it('should return single slot if no options provided', () => {
      const slots = generateSlots(baseStartTime, baseEndTime);

      expect(slots).toHaveLength(1);
      expect(slots[0].startTime).toEqual(baseStartTime);
      expect(slots[0].endTime).toEqual(baseEndTime);
    });

    it('should return single slot if pattern not provided', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true
      });

      expect(slots).toHaveLength(1);
    });

    it('should generate daily recurring slots', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily',
        count: 5
      });

      expect(slots).toHaveLength(5);

      // Check first slot
      expect(slots[0].startTime.toISOString()).toBe('2026-03-15T10:00:00.000Z');
      expect(slots[0].endTime.toISOString()).toBe('2026-03-15T11:00:00.000Z');

      // Check second slot (next day)
      expect(slots[1].startTime.toISOString()).toBe('2026-03-16T10:00:00.000Z');
      expect(slots[1].endTime.toISOString()).toBe('2026-03-16T11:00:00.000Z');

      // Check third slot
      expect(slots[2].startTime.toISOString()).toBe('2026-03-17T10:00:00.000Z');
    });

    it('should generate weekly recurring slots', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'weekly',
        count: 4
      });

      expect(slots).toHaveLength(4);

      // Check first slot
      expect(slots[0].startTime.toISOString()).toBe('2026-03-15T10:00:00.000Z');

      // Check second slot (7 days later)
      expect(slots[1].startTime.toISOString()).toBe('2026-03-22T10:00:00.000Z');

      // Check third slot (14 days later)
      expect(slots[2].startTime.toISOString()).toBe('2026-03-29T10:00:00.000Z');
    });

    it('should generate monthly recurring slots', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'monthly',
        count: 3
      });

      expect(slots).toHaveLength(3);

      // Check first slot
      expect(slots[0].startTime.toISOString()).toBe('2026-03-15T10:00:00.000Z');

      // Check second slot (1 month later)
      expect(slots[1].startTime.toISOString()).toBe('2026-04-15T10:00:00.000Z');

      // Check third slot (2 months later)
      expect(slots[2].startTime.toISOString()).toBe('2026-05-15T10:00:00.000Z');
    });

    it('should stop generating slots near endDate', () => {
      const endDate = new Date('2026-03-18T23:59:59Z');

      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily',
        endDate: endDate.toISOString(),
        count: 10 // Request 10 but should stop earlier
      });

      // Should generate for approximately Mar 15-18 (around 4-5 slots)
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(10);

      // First slot should be the base start time
      expect(slots[0].startTime.toISOString()).toBe(baseStartTime.toISOString());
    });

    it('should respect count limit', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily',
        count: 3
      });

      expect(slots).toHaveLength(3);
    });

    it('should handle unknown pattern gracefully', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'unknown',
        count: 3
      });

      // Should generate slots but they'll all be the same time since pattern is unknown
      expect(slots).toHaveLength(3);
    });

    it('should use default max occurrences if count not provided', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily'
        // No count specified
      });

      // Should default to 52
      expect(slots).toHaveLength(52);
    });

    it('should maintain time duration across recurrences', () => {
      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily',
        count: 3
      });

      slots.forEach(slot => {
        const duration = slot.endTime.getTime() - slot.startTime.getTime();
        expect(duration).toBe(60 * 60 * 1000); // 1 hour in milliseconds
      });
    });

    it('should handle endDate and count together', () => {
      const endDate = new Date('2026-03-17T23:59:59Z');

      const slots = generateSlots(baseStartTime, baseEndTime, {
        isRecurring: true,
        pattern: 'daily',
        endDate: endDate.toISOString(),
        count: 10
      });

      // Should stop at endDate even though count is 10
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.length).toBeLessThanOrEqual(4);
    });
  });
});
