jest.mock('../../src/models/meeting', () => ({
  findOne: jest.fn(),
}));

const Meeting = require('../../src/models/meeting');
const { suggestTimeSlots } = require('../../src/services/operations');

describe('operations suggestTimeSlots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Meeting.findOne.mockResolvedValue(null);
  });

  it('returns same-day future slots when startDate is today', async () => {
    const startDate = new Date('2026-03-06T03:00:00.000Z'); // Mar 6, 8:30 AM Asia/Kolkata
    const slots = await suggestTimeSlots(['owner@meetops.com'], 'Asia/Kolkata', 2, startDate);

    expect(slots).toHaveLength(2);

    const firstDate = slots[0].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const firstTime = slots[0].toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });

    expect(firstDate).toBe('3/6/2026');
    expect(firstTime).toBe('09:00');
  });

  it('uses 30-minute boundaries without timezone drift', async () => {
    const startDate = new Date('2026-03-06T06:00:00.000Z'); // Mar 6, 11:30 AM Asia/Kolkata
    const slots = await suggestTimeSlots(['owner@meetops.com'], 'Asia/Kolkata', 3, startDate);

    expect(slots).toHaveLength(3);

    for (const slot of slots) {
      const minuteText = slot.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        minute: '2-digit',
        hour12: false,
      });
      expect([0, 30]).toContain(Number(minuteText));
    }
  });

  it('honors explicit date requests even on weekends', async () => {
    const startDate = new Date('2026-03-06T18:30:00.000Z'); // Mar 7, 12:00 AM Asia/Kolkata (Saturday)
    const slots = await suggestTimeSlots(['owner@meetops.com'], 'Asia/Kolkata', 2, startDate);

    expect(slots).toHaveLength(2);
    expect(slots[0].toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' })).toBe('3/7/2026');
    const minuteText = slots[0].toLocaleTimeString('en-US', {
      timeZone: 'Asia/Kolkata',
      minute: '2-digit',
      hour12: false,
    });
    expect(Number(minuteText)).toBe(30);
  });

  it('skips slots that conflict with an existing meeting (e.g., 5 PM)', async () => {
    Meeting.findOne.mockImplementation(async (query) => {
      const candidate = new Date(query.startTime.$lt.getTime() - 60 * 60000); // reconstruct slot start
      const local = candidate.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (local === '17:00') return { _id: 'busy5pm' };
      return null;
    });

    const startDate = new Date('2026-03-06T07:30:00.000Z'); // Mar 6, 1:00 PM Asia/Kolkata
    const slots = await suggestTimeSlots(['owner@meetops.com'], 'Asia/Kolkata', 6, startDate);

    const localTimes = slots.map((s) =>
      s.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
    );
    expect(localTimes).not.toContain('17:00');
    expect(localTimes).not.toContain('16:30');
  });
});
