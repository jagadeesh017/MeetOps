jest.mock('../../src/models/employee');
jest.mock('../../src/services/meeting-operations');

const Employee = require('../../src/models/employee');
const meetingOps = require('../../src/services/meeting-operations');
const {
  chatHandler,
  extractMeetingEntities,
  mergeState,
  resetSessions,
} = require('../../src/controllers/aiController');

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('AI Controller Scheduler Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSessions();

    Employee.findById.mockResolvedValue({ _id: 'u1', email: 'owner@meetops.com' });
    Employee.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { name: 'John Doe', email: 'john@meetops.com' },
          { name: 'Emma Stone', email: 'emma@meetops.com' },
          { name: 'David Miller', email: 'david@meetops.com' },
        ]),
      }),
    });

    meetingOps.parseTime.mockReturnValue(new Date('2026-03-06T13:30:00.000Z'));
    meetingOps.createMeeting.mockResolvedValue({
      _id: 'm1',
      title: 'Appraisal Meet',
      startTime: new Date('2026-03-06T13:30:00.000Z'),
      attendees: [{ email: 'john@meetops.com' }],
    });

    meetingOps.findMeetingsBySearch.mockResolvedValue([
      { _id: 'm1', title: 'Project Meet', startTime: new Date('2026-03-06T12:30:00.000Z') },
    ]);
    meetingOps.updateMeeting.mockResolvedValue({
      _id: 'm1',
      title: 'Project Meet',
      startTime: new Date('2026-03-06T12:30:00.000Z'),
    });
    meetingOps.suggestTimeSlots.mockResolvedValue([
      new Date('2026-03-07T09:00:00.000Z'),
      new Date('2026-03-07T10:00:00.000Z'),
    ]);
  });

  it('extracts structured entities with defaults and chrono time parsing', () => {
    const entities = extractMeetingEntities({
      message: 'schedule a meet with john tomorrow 7:17 pm in google meet',
      timezone: 'Asia/Kolkata',
      employees: [{ name: 'John Doe', email: 'john@meetops.com' }],
    });

    expect(entities.type).toBe('schedule');
    expect(entities.title).toBe('meeting');
    expect(entities.attendees).toEqual(['john']);
    expect(entities.platform).toBe('google');
    expect(entities.duration).toBe(60);
    expect(entities.time).toMatch(/^[A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('merges entities across messages without replacing existing values', () => {
    const base = {
      intent: 'schedule',
      title: 'project meet',
      titleProvided: true,
      attendees: ['john', 'emma'],
      time: null,
      platform: 'zoom',
      duration: 60,
      meetingRef: null,
      lastMeetingRef: null,
      pendingMeetings: null,
      lastAskedField: null,
      lastAskedIntent: null,
    };

    const nextEntities = extractMeetingEntities({
      message: 'march 4 7pm',
      timezone: 'Asia/Kolkata',
      employees: [],
      currentIntent: 'schedule',
    });

    const merged = mergeState(base, nextEntities);
    expect(merged.title).toBe('project meet');
    expect(merged.attendees).toEqual(['john', 'emma']);
    expect(merged.time).toMatch(/^[A-Za-z]+ \d{1,2}, \d{4} 7:00 PM$/);
  });

  it('asks for title, then schedules after title is provided in next message', async () => {
    const req1 = {
      body: { prompt: 'schedule meet with john tomorrow 7:17pm', timezone: 'Asia/Kolkata', sessionId: 's1' },
      user: { id: 'u1' },
    };
    const res1 = makeRes();
    await chatHandler(req1, res1);

    expect(res1.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reply: 'What should the meeting title be?',
      })
    );

    const req2 = {
      body: { prompt: 'appraisal meet', timezone: 'Asia/Kolkata', sessionId: 's1' },
      user: { id: 'u1' },
    };
    const res2 = makeRes();
    await chatHandler(req2, res2);

    expect(meetingOps.createMeeting).toHaveBeenCalled();
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reply: expect.stringContaining("has been scheduled"),
      })
    );
  });

  it('reschedules with attendee reference in one shot', async () => {
    const req = {
      body: { prompt: 'move my meeting with john to 6pm', timezone: 'Asia/Kolkata', sessionId: 's2' },
      user: { id: 'u1' },
    };
    const res = makeRes();

    await chatHandler(req, res);

    expect(meetingOps.findMeetingsBySearch).toHaveBeenCalled();
    expect(meetingOps.updateMeeting).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reply: expect.stringContaining('has been updated'),
      })
    );
  });

  it('handles guided slots flow (date -> attendees -> all) and returns slots', async () => {
    const req1 = {
      body: { prompt: 'Find my next available time slots', timezone: 'Asia/Kolkata', sessionId: 'slots1' },
      user: { id: 'u1' },
    };
    const res1 = makeRes();
    await chatHandler(req1, res1);
    expect(res1.json).toHaveBeenCalledWith(
      expect.objectContaining({ reply: 'Which day should I check for available time slots?' })
    );

    const req2 = {
      body: { prompt: 'march 7', timezone: 'Asia/Kolkata', sessionId: 'slots1' },
      user: { id: 'u1' },
    };
    const res2 = makeRes();
    await chatHandler(req2, res2);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({ reply: expect.stringContaining('Any specific attendees') })
    );

    const req3 = {
      body: { prompt: 'all', timezone: 'Asia/Kolkata', sessionId: 'slots1' },
      user: { id: 'u1' },
    };
    const res3 = makeRes();
    await chatHandler(req3, res3);

    expect(meetingOps.suggestTimeSlots).toHaveBeenCalled();
    expect(res3.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reply: expect.stringContaining('available time slots'),
        slots: expect.any(Array),
      })
    );
  });

  it('continues slots flow even when attendee reply is unclear (no generic rephrase)', async () => {
    const turns = [
      'Find free slots',
      'march 7',
      'whatever',
    ];

    const responses = [];
    for (const prompt of turns) {
      const req = { body: { prompt, timezone: 'Asia/Kolkata', sessionId: 'slots2' }, user: { id: 'u1' } };
      const res = makeRes();
      await chatHandler(req, res);
      responses.push(res.json.mock.calls[0][0]);
    }

    expect(responses[2].reply).not.toMatch(/rephrase your meeting request|not sure how to help/i);
    expect(responses[2]).toEqual(expect.objectContaining({ slots: expect.any(Array) }));
  });

  it('accepts dotted time format during update flow after meeting selection', async () => {
    meetingOps.findMeetingsBySearch
      .mockResolvedValueOnce([
        { _id: 'm1', title: 'Meet with John', startTime: new Date('2028-01-02T11:00:00.000Z') },
        { _id: 'm2', title: 'Meeting with John', startTime: new Date('2028-03-06T15:30:00.000Z') },
      ])
      .mockResolvedValueOnce([
        { _id: 'm2', title: 'Meeting with John', startTime: new Date('2028-03-06T15:30:00.000Z') },
      ]);

    const u1 = makeRes();
    await chatHandler(
      { body: { prompt: 'move my meeting with john', timezone: 'Asia/Kolkata', sessionId: 'upd2' }, user: { id: 'u1' } },
      u1
    );
    expect(u1.json).toHaveBeenCalledWith(expect.objectContaining({ reply: expect.stringContaining('change') }));

    const u2 = makeRes();
    await chatHandler(
      { body: { prompt: 'march 7 7.7 pm', timezone: 'Asia/Kolkata', sessionId: 'upd2' }, user: { id: 'u1' } },
      u2
    );
    expect(u2.json).toHaveBeenCalledWith(expect.objectContaining({ meetings: expect.any(Array) }));

    const u3 = makeRes();
    await chatHandler(
      { body: { prompt: '2', timezone: 'Asia/Kolkata', sessionId: 'upd2' }, user: { id: 'u1' } },
      u3
    );
    const r3 = u3.json.mock.calls[0][0];
    expect(r3.reply).toMatch(/updated/i);
    expect(r3.reply).not.toMatch(/rephrase your meeting request|not sure how to help/i);
  });
});
