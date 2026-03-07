jest.mock('../../src/services/meeting-operations');

const meetingOps = require('../../src/services/meeting-operations');
const { resolveMeetingReference } = require('../../src/services/meeting-reference-resolver');

describe('meeting-reference-resolver', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    meetingOps.parseTime.mockReturnValue(new Date('2028-01-01T10:00:00.000Z'));
    meetingOps.findMeetingsBySearch.mockResolvedValue([]);
    meetingOps.listResolvableMeetings.mockResolvedValue([]);
  });

  it('resolves exact meeting id immediately', async () => {
    const target = { _id: '69a734b1a3b0cc3961f0e6ad', title: 'qwefg', startTime: new Date('2028-01-01T10:00:00.000Z'), attendees: [] };
    meetingOps.findMeetingsBySearch.mockResolvedValueOnce([target]);

    const out = await resolveMeetingReference({
      userEmail: 'owner@meetops.com',
      action: { meetingRef: '69a734b1a3b0cc3961f0e6ad' },
      timezone: 'Asia/Kolkata',
    });

    expect(out.status).toBe('resolved');
    expect(out.meeting._id).toBe('69a734b1a3b0cc3961f0e6ad');
  });

  it('resolves attendee+time request to best candidate', async () => {
    const ayush = {
      _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'Meet with Ayush',
      startTime: new Date('2028-01-01T10:00:00.000Z'),
      attendees: [{ email: 'ayush@meetops.com', name: 'Ayush' }],
    };
    const emma = {
      _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
      title: 'Meet with Emma',
      startTime: new Date('2028-01-01T11:00:00.000Z'),
      attendees: [{ email: 'emma@meetops.com', name: 'Emma' }],
    };
    meetingOps.findMeetingsBySearch
      .mockResolvedValueOnce([]) // meetingRef raw
      .mockResolvedValueOnce([]) // title
      .mockResolvedValueOnce([ayush, emma]) // with attendee tokens
      .mockResolvedValueOnce([ayush, emma]); // by time
    meetingOps.listResolvableMeetings.mockResolvedValue([ayush, emma]);

    const out = await resolveMeetingReference({
      userEmail: 'owner@meetops.com',
      action: {
        meetingRef: 'with ayush at January 1, 2028 3:30 PM',
        attendees: ['ayush'],
        time: 'January 1, 2028 3:30 PM',
      },
      timezone: 'Asia/Kolkata',
    });

    expect(out.status).toBe('resolved');
    expect(out.meeting._id).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('returns ambiguous when two meetings score similarly', async () => {
    const m1 = {
      _id: '111111111111111111111111',
      title: 'Project Sync',
      startTime: new Date('2028-01-02T09:00:00.000Z'),
      attendees: [{ email: 'john@meetops.com', name: 'John' }],
    };
    const m2 = {
      _id: '222222222222222222222222',
      title: 'Project Sync',
      startTime: new Date('2028-01-02T09:15:00.000Z'),
      attendees: [{ email: 'john@meetops.com', name: 'John' }],
    };
    meetingOps.findMeetingsBySearch.mockResolvedValue([m1, m2]);
    meetingOps.listResolvableMeetings.mockResolvedValue([m1, m2]);

    const out = await resolveMeetingReference({
      userEmail: 'owner@meetops.com',
      action: { meetingRef: 'project sync with john' },
      timezone: 'Asia/Kolkata',
    });

    expect(out.status).toBe('ambiguous');
    expect(out.meetings.length).toBeGreaterThanOrEqual(2);
  });
});
