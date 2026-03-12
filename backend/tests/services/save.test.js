const { saveAndInvite } = require('../../src/services/save');
const Meeting = require('../../src/models/meeting');
const { sendMeetingInvites } = require('../../src/services/invites');

// Mock the dependencies
jest.mock('../../src/models/meeting');
jest.mock('../../src/services/invites');

describe('Meeting Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveAndInvite', () => {
    it('should return empty array for empty meetingDocs', async () => {
      const result = await saveAndInvite([], {});
      expect(result).toEqual([]);
    });

    it('should return empty array for non-array meetingDocs', async () => {
      const result = await saveAndInvite(null, {});
      expect(result).toEqual([]);
    });

    it('should create single meeting and send invites', async () => {
      const mockMeeting = {
        _id: '123',
        title: 'Test Meeting',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      const meetingDoc = {
        title: 'Test Meeting',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        organizerEmail: 'test@example.com'
      };

      const invitePayload = {
        title: 'Test Meeting',
        attendees: [{ email: 'attendee@example.com' }],
        organizerEmail: 'test@example.com'
      };

      Meeting.create.mockResolvedValue(mockMeeting);
      sendMeetingInvites.mockResolvedValue({ sent: 1, failed: 0 });

      const result = await saveAndInvite([meetingDoc], invitePayload);

      expect(Meeting.create).toHaveBeenCalledWith(meetingDoc);
      expect(result).toEqual([mockMeeting]);
      expect(sendMeetingInvites).toHaveBeenCalledWith(invitePayload);
    });

    it('should create multiple meetings using insertMany', async () => {
      const mockMeetings = [
        { _id: '1', title: 'Meeting 1' },
        { _id: '2', title: 'Meeting 2' }
      ];

      const meetingDocs = [
        { title: 'Meeting 1', startTime: new Date() },
        { title: 'Meeting 2', startTime: new Date() }
      ];

      Meeting.insertMany.mockResolvedValue(mockMeetings);

      const result = await saveAndInvite(meetingDocs, null);

      expect(Meeting.insertMany).toHaveBeenCalledWith(meetingDocs);
      expect(result).toEqual(mockMeetings);
      expect(sendMeetingInvites).not.toHaveBeenCalled();
    });

    it('should not send invites when attendees array is empty', async () => {
      const mockMeeting = { _id: '123', title: 'Test' };
      const meetingDoc = { title: 'Test' };
      const invitePayload = { attendees: [] };

      Meeting.create.mockResolvedValue(mockMeeting);

      await saveAndInvite([meetingDoc], invitePayload);

      expect(sendMeetingInvites).not.toHaveBeenCalled();
    });
  });
});
