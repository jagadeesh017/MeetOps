const schedulingService = require('../../src/services/ai-scheduling-service');
const Employee = require('../../src/models/employee');
const Meeting = require('../../src/models/meeting');
const Cluster = require('../../src/models/groups');
const zoomService = require('../../src/services/zoom-service');
const googleMeetService = require('../../src/services/google-meet-service');
const emailService = require('../../src/services/email-invite-service');

jest.mock('../../src/models/employee');
jest.mock('../../src/models/meeting');
jest.mock('../../src/models/groups');
jest.mock('../../src/services/zoom-service');
jest.mock('../../src/services/google-meet-service');
jest.mock('../../src/services/email-invite-service');

describe('AI Scheduling Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailService.sendMeetingInvites = jest.fn().mockResolvedValue({ sent: 1, failed: 0 });
  });

  describe('validateIntegrationConnected', () => {
    it('should validate Zoom integration is connected', async () => {
      const mockUser = {
        _id: 'user123',
        zoomConnected: true,
        zoomAccessToken: 'zoom-token'
      };

      Employee.findById = jest.fn().mockResolvedValue(mockUser);

      await expect(schedulingService.validateIntegrationConnected('user123', 'zoom'))
        .resolves.not.toThrow();
    });

    it('should throw error when Zoom is not connected', async () => {
      const mockUser = {
        _id: 'user123',
        zoomConnected: false
      };

      Employee.findById = jest.fn().mockResolvedValue(mockUser);

      await expect(schedulingService.validateIntegrationConnected('user123', 'zoom'))
        .rejects.toThrow('Please connect your Zoom account first');
    });

    it('should validate Google integration is connected', async () => {
      const mockUser = {
        _id: 'user123',
        googleConnected: true,
        googleAccessToken: 'google-access-token',
        googleRefreshToken: 'google-refresh-token'
      };

      Employee.findById = jest.fn().mockResolvedValue(mockUser);

      await expect(schedulingService.validateIntegrationConnected('user123', 'google'))
        .resolves.not.toThrow();
    });

    it('should throw error when Google is not connected', async () => {
      const mockUser = {
        _id: 'user123',
        googleConnected: false
      };

      Employee.findById = jest.fn().mockResolvedValue(mockUser);

      await expect(schedulingService.validateIntegrationConnected('user123', 'google'))
        .rejects.toThrow('Please connect your Google Calendar account first');
    });

    it('should throw error when user not found', async () => {
      Employee.findById = jest.fn().mockResolvedValue(null);

      await expect(schedulingService.validateIntegrationConnected('invalid-user', 'zoom'))
        .rejects.toThrow('User not found');
    });
  });

  describe('checkTimeSlot', () => {
    it('should return true when no conflicts exist', async () => {
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      const startTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.checkTimeSlot(['user@example.com'], startTime, 60);

      expect(result).toBe(true);
    });

    it('should return false when conflicts exist', async () => {
      const mockConflict = {
        _id: 'meeting123',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z')
      };

      Meeting.findOne = jest.fn().mockResolvedValue(mockConflict);

      const startTime = new Date('2026-03-15T10:30:00Z');
      const result = await schedulingService.checkTimeSlot(['user@example.com'], startTime, 60);

      expect(result).toBe(false);
    });

    it('should return true on error', async () => {
      Meeting.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const startTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.checkTimeSlot(['user@example.com'], startTime, 60);

      expect(result).toBe(true);
    });
  });

  describe('findAvailableSlot', () => {
    it('should return preferred time if available', async () => {
      Employee.find = jest.fn().mockResolvedValue([{ email: 'user@example.com' }]);
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      const preferredTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.findAvailableSlot(['user@example.com'], preferredTime, 60);

      expect(result).toEqual(preferredTime);
    });

    it('should find next available slot when preferred is taken', async () => {
      Employee.find = jest.fn().mockResolvedValue([{ email: 'user@example.com' }]);
      
      // First call returns conflict, second returns no conflict
      Meeting.findOne = jest.fn()
        .mockResolvedValueOnce({ _id: 'conflict' })
        .mockResolvedValueOnce(null);

      const preferredTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.findAvailableSlot(['user@example.com'], preferredTime, 60);

      expect(result).not.toEqual(preferredTime);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(preferredTime.getTime());
    });

    it('should return preferred time when no attendees found', async () => {
      Employee.find = jest.fn().mockResolvedValue([]);

      const preferredTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.findAvailableSlot(['invalid@example.com'], preferredTime, 60);

      expect(result).toEqual(preferredTime);
    });

    it('should return preferred time on error', async () => {
      Employee.find = jest.fn().mockRejectedValue(new Error('Database error'));

      const preferredTime = new Date('2026-03-15T10:00:00Z');
      const result = await schedulingService.findAvailableSlot(['user@example.com'], preferredTime, 60);

      expect(result).toEqual(preferredTime);
    });
  });

  describe('validateAttendees', () => {
    it('should validate attendees by email', async () => {
      const mockUser = {
        email: 'user@example.com',
        name: 'Test User'
      };

      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mockUser])
      });

      const result = await schedulingService.validateAttendees(['user@example.com']);

      expect(result).toEqual(['user@example.com']);
    });

    it('should validate attendees by name', async () => {
      const mockUser = {
        email: 'testuser@example.com',
        name: 'Test User'
      };

      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });
      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mockUser])
      });

      const result = await schedulingService.validateAttendees(['testuser']);

      expect(result).toEqual(['testuser@example.com']);
    });

    it('should resolve group/team names', async () => {
      const mockCluster = {
        name: 'frontend team',
        members: [
          { email: 'dev1@example.com', name: 'Dev 1' },
          { email: 'dev2@example.com', name: 'Dev 2' }
        ]
      };

      Cluster.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCluster)
      });

      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await schedulingService.validateAttendees(['frontend team']);

      expect(result).toEqual(['dev1@example.com', 'dev2@example.com']);
    });

    it('should throw error for empty attendees', async () => {
      await expect(schedulingService.validateAttendees([]))
        .rejects.toThrow('At least one attendee is required');
    });

    it('should throw error for attendee not found', async () => {
      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });
      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });
      Cluster.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await expect(schedulingService.validateAttendees(['nonexistent']))
        .rejects.toThrow('User or group "nonexistent" not found');
    });

    it('should remove duplicates from attendees', async () => {
      const mockCluster = {
        name: 'team a',
        members: [
          { email: 'user@example.com', name: 'User' }
        ]
      };

      Cluster.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockCluster)
      });

      const mockUser = {
        email: 'user@example.com',
        name: 'User'
      };

      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });
      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mockUser])
      });

      const result = await schedulingService.validateAttendees(['team a', 'user@example.com']);

      expect(result).toEqual(['user@example.com']);
      expect(result.length).toBe(1);
    });
  });

  describe('validateMeetingTime', () => {
    it('should not throw error for valid future time', () => {
      const futureTime = new Date(Date.now() + 60 * 60000); // 1 hour from now

      expect(() => schedulingService.validateMeetingTime(futureTime))
        .not.toThrow();
    });

    it('should throw error for time less than 30 minutes away', () => {
      const nearTime = new Date(Date.now() + 15 * 60000); // 15 minutes from now

      expect(() => schedulingService.validateMeetingTime(nearTime))
        .toThrow('Meeting must be scheduled at least 30 minutes from now');
    });

    it('should throw error for past time', () => {
      const pastTime = new Date(Date.now() - 60 * 60000); // 1 hour ago

      expect(() => schedulingService.validateMeetingTime(pastTime))
        .toThrow('Meeting must be scheduled at least 30 minutes from now');
    });
  });

  describe('createAutomatedMeeting', () => {
    const mockUser = {
      _id: 'user123',
      email: 'organizer@example.com',
      zoomConnected: true,
      zoomAccessToken: 'zoom-token',
      zoomRefreshToken: 'zoom-refresh',
      googleConnected: true,
      googleAccessToken: 'google-token',
      googleRefreshToken: 'google-refresh',
      save: jest.fn().mockResolvedValue(true)
    };

    const mockMeetingData = {
      title: 'Test Meeting',
      attendees: ['attendee@example.com'],
      duration: 60,
      description: 'Test description',
      suggestedTime: new Date(Date.now() + 60 * 60000) // 1 hour from now
    };

    beforeEach(() => {
      Employee.findById = jest.fn().mockResolvedValue(mockUser);
      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { email: 'attendee@example.com', name: 'Attendee' }
        ])
      });
      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          email: 'attendee@example.com',
          name: 'Attendee'
        })
      });
      Meeting.findOne = jest.fn().mockResolvedValue(null);
    });

    it('should create Zoom meeting successfully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        title: 'Test Meeting',
        save: jest.fn().mockResolvedValue(true)
      };

      Meeting.mockImplementation(() => mockMeeting);

      zoomService.createZoomMeeting = jest.fn().mockResolvedValue({
        success: true,
        meetingUrl: 'https://zoom.us/j/123456789',
        meetingId: '123456789'
      });

      const result = await schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'zoom'
      );

      expect(result.success).toBe(true);
      expect(result.meeting.meetingLink).toBe('https://zoom.us/j/123456789');
      expect(result.meeting.platform).toBe('zoom');
      expect(zoomService.createZoomMeeting).toHaveBeenCalled();
    });

    it('should create Google Meet meeting successfully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        title: 'Test Meeting',
        save: jest.fn().mockResolvedValue(true)
      };

      Meeting.mockImplementation(() => mockMeeting);

      googleMeetService.createGoogleMeetMeeting = jest.fn().mockResolvedValue({
        success: true,
        hangoutLink: 'https://meet.google.com/abc-defg-hij',
        eventId: 'event123'
      });

      const result = await schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'google'
      );

      expect(result.success).toBe(true);
      expect(result.meeting.meetingLink).toBe('https://meet.google.com/abc-defg-hij');
      expect(result.meeting.platform).toBe('google');
      expect(googleMeetService.createGoogleMeetMeeting).toHaveBeenCalled();
    });

    it('should refresh Zoom token when 401 error occurs', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        save: jest.fn().mockResolvedValue(true)
      };

      Meeting.mockImplementation(() => mockMeeting);

      zoomService.createZoomMeeting = jest.fn()
        .mockResolvedValueOnce({ success: false, status: 401, error: 'Invalid token' })
        .mockResolvedValueOnce({
          success: true,
          meetingUrl: 'https://zoom.us/j/123456789',
          meetingId: '123456789'
        });

      zoomService.refreshZoomToken = jest.fn().mockResolvedValue({
        access_token: 'new-zoom-token',
        refresh_token: 'new-zoom-refresh'
      });

      const result = await schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'zoom'
      );

      expect(result.success).toBe(true);
      expect(zoomService.refreshZoomToken).toHaveBeenCalled();
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('should throw error when Zoom API fails', async () => {
      zoomService.createZoomMeeting = jest.fn().mockResolvedValue({
        success: false,
        error: 'Zoom API Error'
      });

      await expect(schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'zoom'
      )).rejects.toThrow('Zoom API Error');
    });

    it('should throw error when Google API fails', async () => {
      googleMeetService.createGoogleMeetMeeting = jest.fn().mockResolvedValue({
        success: false,
        error: 'Google API Error'
      });

      await expect(schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'google'
      )).rejects.toThrow('Google API Error');
    });

    it('should throw error for invalid platform', async () => {
      const mockUser = {
        _id: 'user123',
        email: 'organizer@example.com',
        zoomConnected: false,
        googleConnected: false
      };
      
      Employee.findById = jest.fn().mockResolvedValue(mockUser);
      Employee.find = jest.fn().mockResolvedValue([
        { email: 'attendee@example.com', name: 'Attendee' }
      ]);
      Employee.findOne = jest.fn().mockResolvedValue({
        email: 'attendee@example.com',
        name: 'Attendee'
      });
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      await expect(schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'user123',
        'organizer@example.com',
        'invalid'
      )).rejects.toThrow('account first');
    });

    it('should throw error when user not found', async () => {
      const validUser = {
        _id: 'user123',
        email: 'organizer@example.com',
        zoomConnected: true,
        zoomAccessToken: 'zoom-token',
        zoomRefreshToken: 'zoom-refresh'
      };

      // User exists for validation but not for meeting creation
      Employee.findById = jest.fn()
        .mockResolvedValueOnce(validUser) // validateIntegrationConnected call
        .mockResolvedValueOnce(null); // findById in createAutomatedMeeting after validation

      Employee.find = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { email: 'attendee@example.com', name: 'Attendee' }
        ])
      });
      Employee.findOne = jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          email: 'attendee@example.com',
          name: 'Attendee'
        })
      });
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      await expect(schedulingService.createAutomatedMeeting(
        mockMeetingData,
        'invalid-user',
        'organizer@example.com',
        'zoom'
      )).rejects.toThrow();
    });
  });

  describe('getSuggestedTimeSlots', () => {
    it('should return suggested time slots', async () => {
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      const startDate = new Date('2026-03-17T09:00:00Z'); // Monday
      const result = await schedulingService.getSuggestedTimeSlots(
        ['user@example.com'],
        startDate,
        60
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);
      result.forEach(slot => {
        expect(slot).toBeInstanceOf(Date);
      });
    });

    it('should skip weekends', async () => {
      Meeting.findOne = jest.fn().mockResolvedValue(null);

      const startDate = new Date('2026-03-21T09:00:00Z'); // Saturday
      const result = await schedulingService.getSuggestedTimeSlots(
        ['user@example.com'],
        startDate,
        60
      );

      result.forEach(slot => {
        const day = slot.getDay();
        expect(day).not.toBe(0); // Not Sunday
        expect(day).not.toBe(6); // Not Saturday
      });
    });

    it('should return empty array if no slots available', async () => {
      Meeting.findOne = jest.fn().mockResolvedValue({ _id: 'conflict' });

      const startDate = new Date('2026-03-17T09:00:00Z');
      const result = await schedulingService.getSuggestedTimeSlots(
        ['user@example.com'],
        startDate,
        60
      );

      expect(result).toEqual([]);
    });
  });
});
