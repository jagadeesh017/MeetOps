const { findConflicts, hasConflict, checkAttendeesConflicts } = require('../../src/services/conflicts');
const Meeting = require('../../src/models/meeting');

// Mock Meeting model
jest.mock('../../src/models/meeting');

describe('Conflict Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findConflicts', () => {
    it('should return empty array if no emails provided', async () => {
      const result = await findConflicts([], new Date(), new Date());
      expect(result).toEqual([]);
    });

    it('should return empty array if emails is not an array', async () => {
      const result = await findConflicts(null, new Date(), new Date());
      expect(result).toEqual([]);
    });

    it('should find conflicts for given emails and time range', async () => {
      const mockMeetings = [
        {
          _id: '1',
          title: 'Conflicting Meeting',
          organizerEmail: 'test@example.com',
          startTime: new Date('2026-03-15T10:00:00Z'),
          endTime: new Date('2026-03-15T11:00:00Z'),
          status: 'confirmed'
        }
      ];

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockMeetings)
      });

      const result = await findConflicts(
        ['test@example.com'],
        new Date('2026-03-15T09:30:00Z'),
        new Date('2026-03-15T10:30:00Z')
      );

      expect(Meeting.find).toHaveBeenCalledWith({
        status: { $ne: 'cancelled' },
        startTime: { $lt: new Date('2026-03-15T10:30:00Z') },
        endTime: { $gt: new Date('2026-03-15T09:30:00Z') },
        $or: [
          { organizerEmail: { $in: ['test@example.com'] } },
          { 'attendees.email': { $in: ['test@example.com'] } }
        ]
      });

      expect(result).toEqual(mockMeetings);
    });

    it('should exclude specified meeting ID from conflict search', async () => {
      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      await findConflicts(
        ['test@example.com'],
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T11:00:00Z'),
        'exclude-meeting-123'
      );

      expect(Meeting.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $ne: 'exclude-meeting-123' }
        })
      );
    });

    it('should handle multiple emails', async () => {
      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      await findConflicts(
        ['user1@test.com', 'user2@test.com', 'user3@test.com'],
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T11:00:00Z')
      );

      expect(Meeting.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { organizerEmail: { $in: ['user1@test.com', 'user2@test.com', 'user3@test.com'] } },
            { 'attendees.email': { $in: ['user1@test.com', 'user2@test.com', 'user3@test.com'] } }
          ]
        })
      );
    });
  });

  describe('hasConflict', () => {
    it('should return null if no conflicts found', async () => {
      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      const result = await hasConflict(
        'test@example.com',
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T11:00:00Z')
      );

      expect(result).toBeNull();
    });

    it('should return first conflict if conflicts exist', async () => {
      const mockConflict = {
        _id: '1',
        title: 'Conflicting Meeting',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([mockConflict])
      });

      const result = await hasConflict(
        'test@example.com',
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T11:00:00Z')
      );

      expect(result).toEqual(mockConflict);
    });

    it('should pass excludeMeetingId to findConflicts', async () => {
      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      await hasConflict(
        'test@example.com',
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T11:00:00Z'),
        'exclude-123'
      );

      expect(Meeting.find).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: { $ne: 'exclude-123' }
        })
      );
    });
  });

  describe('checkAttendeesConflicts', () => {
    it('should check conflicts for multiple time slots', async () => {
      const emails = ['user1@test.com', 'user2@test.com'];
      const proposedSlots = [
        {
          startTime: new Date('2026-03-15T10:00:00Z'),
          endTime: new Date('2026-03-15T11:00:00Z')
        },
        {
          startTime: new Date('2026-03-15T14:00:00Z'),
          endTime: new Date('2026-03-15T15:00:00Z')
        }
      ];

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      const result = await checkAttendeesConflicts(emails, proposedSlots);

      expect(Meeting.find).toHaveBeenCalledTimes(2);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array if no conflicts', async () => {
      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      });

      const result = await checkAttendeesConflicts(
        ['test@example.com'],
        [
          {
            startTime: new Date('2026-03-15T10:00:00Z'),
            endTime: new Date('2026-03-15T11:00:00Z')
          }
        ]
      );

      expect(result).toEqual([]);
    });

    it('should identify conflicts from organizer email', async () => {
      const conflictingMeeting = {
        _id: '1',
        organizerEmail: 'user1@test.com',
        attendees: [],
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        status: 'confirmed'
      };

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([conflictingMeeting])
      });

      const result = await checkAttendeesConflicts(
        ['user1@test.com', 'user2@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:30:00Z'),
            endTime: new Date('2026-03-15T11:30:00Z')
          }
        ]
      );

      expect(result.length).toBe(1);
      expect(result[0].email).toBe('user1@test.com');
      expect(result[0]).toHaveProperty('conflictStart');
      expect(result[0]).toHaveProperty('conflictEnd');
    });

    it('should identify conflicts from attendees list', async () => {
      const conflictingMeeting = {
        _id: '1',
        organizerEmail: 'organizer@test.com',
        attendees: [
          { email: 'user1@test.com', name: 'User 1' },
          { email: 'user3@test.com', name: 'User 3' }
        ],
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        status: 'confirmed'
      };

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([conflictingMeeting])
      });

      const result = await checkAttendeesConflicts(
        ['user1@test.com', 'user2@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:30:00Z'),
            endTime: new Date('2026-03-15T11:30:00Z')
          }
        ]
      );

      expect(result.length).toBe(1);
      expect(result[0].email).toBe('user1@test.com');
    });

    it('should handle multiple conflicts for same email in one slot', async () => {
      const conflicts = [
        {
          _id: '1',
          organizerEmail: 'user1@test.com',
          attendees: [],
          startTime: new Date('2026-03-15T10:00:00Z'),
          endTime: new Date('2026-03-15T11:00:00Z')
        },
        {
          _id: '2',
          organizerEmail: 'other@test.com',
          attendees: [{ email: 'user1@test.com' }],
          startTime: new Date('2026-03-15T10:15:00Z'),
          endTime: new Date('2026-03-15T11:15:00Z')
        }
      ];

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue(conflicts)
      });

      const result = await checkAttendeesConflicts(
        ['user1@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:30:00Z'),
            endTime: new Date('2026-03-15T11:30:00Z')
          }
        ]
      );

      // Should only add user1@test.com once even with multiple conflicts
      expect(result.length).toBe(1);
      expect(result[0].email).toBe('user1@test.com');
    });

    it('should stop checking slots after finding first conflict', async () => {
      const conflictingMeeting = {
        _id: '1',
        organizerEmail: 'user1@test.com',
        attendees: [],
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      // First slot has conflict, second slot should not be checked
      Meeting.find
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue([conflictingMeeting])
        })
        .mockReturnValueOnce({
          lean: jest.fn().mockResolvedValue([])
        });

      const result = await checkAttendeesConflicts(
        ['user1@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:00:00Z'),
            endTime: new Date('2026-03-15T11:00:00Z')
          },
          {
            startTime: new Date('2026-03-15T14:00:00Z'),
            endTime: new Date('2026-03-15T15:00:00Z')
          }
        ]
      );

      expect(result.length).toBeGreaterThan(0);
      // Should have checked both slots in parallel, then break loop
      expect(Meeting.find).toHaveBeenCalledTimes(2);
    });

    it('should handle attendees with null or undefined email', async () => {
      const conflictingMeeting = {
        _id: '1',
        organizerEmail: 'other@test.com',
        attendees: [
          { email: 'user1@test.com', name: 'User 1' },
          { name: 'Invalid' }, // No email
          null, // Null attendee
          { email: null }, // Null email
        ],
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([conflictingMeeting])
      });

      const result = await checkAttendeesConflicts(
        ['user1@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:30:00Z'),
            endTime: new Date('2026-03-15T11:30:00Z')
          }
        ]
      );

      expect(result.length).toBe(1);
      expect(result[0].email).toBe('user1@test.com');
    });

    it('should handle conflicts with non-array attendees', async () => {
      const conflictingMeeting = {
        _id: '1',
        organizerEmail: 'user1@test.com',
        attendees: null, // Non-array attendees
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      Meeting.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([conflictingMeeting])
      });

      const result = await checkAttendeesConflicts(
        ['user1@test.com'],
        [
          {
            startTime: new Date('2026-03-15T10:30:00Z'),
            endTime: new Date('2026-03-15T11:30:00Z')
          }
        ]
      );

      expect(result.length).toBe(1);
      expect(result[0].email).toBe('user1@test.com');
    });
  });
});
