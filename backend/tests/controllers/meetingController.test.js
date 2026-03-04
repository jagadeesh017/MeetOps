const meetingController = require('../../src/controllers/meetingController');
const Meeting = require('../../src/models/meeting');
const Employee = require('../../src/models/employee');
const zoomService = require('../../src/services/zoom-service');
const googleMeetService = require('../../src/services/google-meet-service');
const meetingService = require('../../src/services/meetingService');
const emailService = require('../../src/services/email-invite-service');
const conflictService = require('../../src/services/conflictService');
const recurrenceUtil = require('../../src/utilities/recurrence');

jest.mock('../../src/models/meeting');
jest.mock('../../src/models/employee');
jest.mock('../../src/services/zoom-service');
jest.mock('../../src/services/google-meet-service');
jest.mock('../../src/services/meetingService');
jest.mock('../../src/services/email-invite-service');
jest.mock('../../src/services/conflictService');
jest.mock('../../src/utilities/recurrence');

describe('Meeting Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      query: {},
      params: {},
      user: { id: 'user123' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getMeetings', () => {
    it('should return all meetings without filter', async () => {
      const mockMeetings = [
        {
          _id: '1',
          title: 'Team Standup',
          startTime: new Date('2026-03-15T10:00:00Z')
        }
      ];

      Meeting.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockMeetings)
      });

      req.query = {};
      req.user = { id: 'user123', email: 'user@example.com' };

      await meetingController.getMeetings(req, res);

      expect(Meeting.find).toHaveBeenCalledWith({
        $or: [
          { organizerEmail: 'user@example.com' },
          { 'attendees.email': 'user@example.com' }
        ]
      });
      expect(res.json).toHaveBeenCalledWith(mockMeetings);
    });

    it('should filter meetings by userEmail', async () => {
      const mockMeetings = [{ title: 'Meeting 1' }];

      Meeting.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockMeetings)
      });

      req.query = { userEmail: 'user@example.com' };

      await meetingController.getMeetings(req, res);

      expect(Meeting.find).toHaveBeenCalledWith({
        $or: [
          { organizerEmail: 'user@example.com' },
          { 'attendees.email': 'user@example.com' }
        ]
      });
      expect(res.json).toHaveBeenCalledWith(mockMeetings);
    });

    it('should handle errors', async () => {
      req.user = { id: 'user123', email: 'user@example.com' };
      Meeting.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('DB error'))
      });

      await meetingController.getMeetings(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });

  describe('createMeeting', () => {
    beforeEach(() => {
      req.body = {
        title: 'Team Meeting',
        startTime: new Date('2026-04-01T10:00:00Z'),
        endTime: new Date('2026-04-01T11:00:00Z'),
        organizerEmail: 'organizer@example.com',
        attendees: ['attendee1@example.com', 'attendee2@example.com'],
        platform: 'zoom'
      };
      req.user = { id: 'user123' };

      Employee.findById.mockResolvedValue({
        _id: 'user123',
        email: 'organizer@example.com',
        zoomConnected: true,
        zoomAccessToken: 'zoom_token',
        zoomRefreshToken: 'refresh_token',
        googleConnected: true,
        googleAccessToken: null
      });

      Employee.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' }
        ])
      });

      conflictService.hasConflict.mockResolvedValue(null);
      conflictService.checkAttendeesConflicts.mockResolvedValue([]);
      recurrenceUtil.generateSlots.mockReturnValue([
        { startTime: new Date('2026-04-01T10:00:00Z'), endTime: new Date('2026-04-01T11:00:00Z') }
      ]);
      zoomService.createZoomMeeting.mockResolvedValue({
        success: true,
        meetingUrl: 'https://zoom.us/j/123456',
        meetingId: '123456'
      });
      meetingService.saveAndInvite.mockResolvedValue([{ _id: 'meeting123', title: 'Team Meeting' }]);
    });

    it('should create a meeting successfully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        title: 'Team Meeting'
      };

      meetingService.saveAndInvite.mockResolvedValue([mockMeeting]);

      await meetingController.createMeeting(req, res);

      expect(Employee.findById).toHaveBeenCalledWith('user123');
      expect(meetingService.saveAndInvite).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockMeeting);
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = { title: 'Meeting' };

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should return 400 if endTime is before startTime', async () => {
      req.body.startTime = new Date('2026-04-01T11:00:00Z');
      req.body.endTime = new Date('2026-04-01T10:00:00Z');

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('after') })
      );
    });

    it('should return 404 if organizer not found', async () => {
      Employee.findById.mockResolvedValue(null);

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should handle recurring meetings', async () => {
      req.body.isRecurring = true;
      req.body.recurrencePattern = 'DAILY';
      req.body.recurrenceCount = 5;

      const mockMeetings = [
        { _id: 'meeting1', title: 'Team Meeting' },
        { _id: 'meeting2', title: 'Team Meeting' }
      ];

      recurrenceUtil.generateSlots.mockReturnValue([
        { startTime: new Date('2026-04-01T10:00:00Z'), endTime: new Date('2026-04-01T11:00:00Z') },
        { startTime: new Date('2026-04-02T10:00:00Z'), endTime: new Date('2026-04-02T11:00:00Z') }
      ]);

      meetingService.saveAndInvite.mockResolvedValue(mockMeetings);

      await meetingController.createMeeting(req, res);

      expect(recurrenceUtil.generateSlots).toHaveBeenCalled();
      expect(meetingService.saveAndInvite).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should handle errors gracefully', async () => {
      Employee.findById.mockRejectedValue(new Error('DB error'));

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });

  describe('checkAttendeeAvailability', () => {
    beforeEach(() => {
      req.body = {
        userEmail: 'organizer@example.com',
        startTime: new Date('2026-04-01T10:00:00Z'),
        endTime: new Date('2026-04-01T11:00:00Z'),
        attendees: ['attendee1@example.com', 'attendee2@example.com']
      };
    });

    it('should return available status when no conflicts', async () => {
      conflictService.hasConflict.mockResolvedValue(null);

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          busyAttendees: []
        })
      );
    });

    it('should return conflicts when attendees are busy', async () => {
      conflictService.hasConflict.mockResolvedValue({
        title: 'Another Meeting',
        startTime: new Date(),
        endTime: new Date()
      });

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          available: false,
          busyAttendees: expect.arrayContaining([
            expect.objectContaining({ email: 'attendee1@example.com' })
          ])
        })
      );
    });

    it('should return 400 for missing fields', async () => {
      req.body = { userEmail: 'test@example.com' };

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should handle errors', async () => {
      conflictService.hasConflict.mockRejectedValue(new Error('Service error'));

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service error' });
    });
  });

  describe('cancelMeeting', () => {
    beforeEach(() => {
      req.params = { meetingId: 'meeting123' };
      req.user = { id: 'user123' };

      Employee.findById.mockResolvedValue({
        _id: 'user123',
        email: 'organizer@example.com'
      });
    });

    it('should cancel meeting successfully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        title: 'Team Meeting',
        organizerEmail: 'organizer@example.com',
        attendees: [{ email: 'att@example.com' }],
        platform: null,
        status: 'scheduled',
        save: jest.fn().mockResolvedValue()
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      emailService.sendMeetingCancellations.mockResolvedValue({ sent: 1, failed: 0 });

      await meetingController.cancelMeeting(req, res);

      expect(mockMeeting.status).toBe('cancelled');
      expect(mockMeeting.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, message: expect.any(String) })
      );
    });

    it('should return 404 if user not found', async () => {
      Employee.findById.mockResolvedValue(null);

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should return 404 if meeting not found', async () => {
      Meeting.findById.mockResolvedValue(null);

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should return 403 if user is not the organizer', async () => {
      const mockMeeting = {
        organizerEmail: 'other@example.com',
        status: 'scheduled'
      };

      Meeting.findById.mockResolvedValue(mockMeeting);

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should return 400 if meeting is already cancelled', async () => {
      const mockMeeting = {
        organizerEmail: 'organizer@example.com',
        status: 'cancelled'
      };

      Meeting.findById.mockResolvedValue(mockMeeting);

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should cancel Zoom meeting when platform is zoom', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        organizerEmail: 'organizer@example.com',
        platform: 'zoom',
        externalId: '123456',
        status: 'scheduled',
        attendees: [],
        save: jest.fn().mockResolvedValue()
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      Employee.findById.mockResolvedValue({
        _id: 'user123',
        email: 'organizer@example.com',
        zoomAccessToken: 'zoom_token',
        zoomRefreshToken: 'refresh_token',
        save: jest.fn().mockResolvedValue()
      });
      zoomService.deleteZoomMeeting.mockResolvedValue({ success: true });

      await meetingController.cancelMeeting(req, res);

      expect(zoomService.deleteZoomMeeting).toHaveBeenCalledWith('123456', 'zoom_token', 'refresh_token');
      expect(mockMeeting.save).toHaveBeenCalled();
    });

    it('should cancel Google Meet meeting when platform is google', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        organizerEmail: 'organizer@example.com',
        platform: 'google',
        externalId: 'event123',
        status: 'scheduled',
        attendees: [],
        save: jest.fn().mockResolvedValue()
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      Employee.findById.mockResolvedValue({
        _id: 'user123',
        email: 'organizer@example.com',
        googleConnected: true,
        googleAccessToken: 'google_token',
        googleRefreshToken: 'refresh_token'
      });
      googleMeetService.deleteGoogleMeetEvent.mockResolvedValue({ success: true });

      await meetingController.cancelMeeting(req, res);

      expect(googleMeetService.deleteGoogleMeetEvent).toHaveBeenCalledWith(
        'event123',
        {
          refreshToken: 'refresh_token',
          accessToken: 'google_token'
        }
      );
      expect(mockMeeting.save).toHaveBeenCalled();
    });

    it('should handle external cancellation failure gracefully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        organizerEmail: 'organizer@example.com',
        platform: 'zoom',
        externalId: '123456',
        status: 'scheduled',
        attendees: [],
        save: jest.fn().mockResolvedValue()
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      Employee.findById.mockResolvedValue({
        _id: 'user123',
        email: 'organizer@example.com',
        zoomAccessToken: 'zoom_token',
        zoomRefreshToken: 'refresh_token'
      });
      zoomService.deleteZoomMeeting.mockResolvedValue({ success: false, error: 'Zoom API error' });

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(mockMeeting.save).not.toHaveBeenCalled();
    });

    it('should handle email sending failure gracefully', async () => {
      const mockMeeting = {
        _id: 'meeting123',
        organizerEmail: 'organizer@example.com',
        attendees: [{ email: 'att@example.com' }],
        status: 'scheduled',
        platform: null,
        save: jest.fn().mockResolvedValue()
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      emailService.sendMeetingCancellations.mockRejectedValue(new Error('Email error'));

      await meetingController.cancelMeeting(req, res);

      expect(mockMeeting.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle general errors', async () => {
      Meeting.findById.mockRejectedValue(new Error('DB error'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'DB error' });
    });
  });
});
