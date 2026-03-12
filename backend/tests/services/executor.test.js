jest.mock('../../src/services/operations');
jest.mock('../../src/services/resolver', () => ({
  resolveMeetingReference: jest.fn(),
}));

const meetingOps = require('../../src/services/operations');
const { runAction } = require('../../src/services/executor');

describe('executor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    meetingOps.parseTime.mockReturnValue(new Date('2028-01-01T10:00:00.000Z'));
    meetingOps.createMeeting.mockResolvedValue({
      _id: 'm1',
      title: 'meeting',
      startTime: new Date('2028-01-01T10:00:00.000Z'),
    });
  });

  it('normalizes LLM platform "google meet" to "google" when scheduling', async () => {
    await runAction('u1', 'owner@meetops.com', {
      type: 'schedule',
      title: 'Standup',
      attendees: ['john'],
      time: 'January 1, 2028 3:30 PM',
      platform: 'google meet',
      duration: 30,
      timezone: 'Asia/Kolkata',
    });

    expect(meetingOps.createMeeting).toHaveBeenCalledWith(
      'u1',
      'owner@meetops.com',
      expect.objectContaining({
        platform: 'google',
      })
    );
  });
});
