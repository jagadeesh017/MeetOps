const meetingController = require('../../src/controllers/meetingController');
const Meeting = require('../../src/models/meeting');
const Employee = require('../../src/models/employee');
const zoomService = require('../../src/services/zoom');
const googleMeetService = require('../../src/services/google');
const save = require('../../src/services/save');
const emailService = require('../../src/services/invites');
const conflicts = require('../../src/services/conflicts');
const recurrenceUtil = require('../../src/utilities/recurrence');
const meetingOperations = require('../../src/services/operations');

const Cluster = require('../../src/models/groups');

jest.mock('../../src/models/meeting');
jest.mock('../../src/models/employee');
jest.mock('../../src/models/groups');
jest.mock('../../src/services/zoom');
jest.mock('../../src/services/google');
jest.mock('../../src/services/save');
jest.mock('../../src/services/invites');
jest.mock('../../src/services/conflicts');
jest.mock('../../src/utilities/recurrence');
jest.mock('../../src/services/operations');

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
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error', error: 'DB error' });
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
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' }
        ])
      });

      Cluster.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });

      conflicts.hasConflict.mockResolvedValue(null);
      conflicts.checkAttendeesConflicts.mockResolvedValue([]);
      recurrenceUtil.generateSlots.mockReturnValue([
        { startTime: new Date('2026-04-01T10:00:00Z'), endTime: new Date('2026-04-01T11:00:00Z') }
      ]);
      zoomService.createZoomMeeting.mockResolvedValue({
        success: true,
        meetingUrl: 'https://zoom.us/j/123456',
        meetingId: '123456'
      });
      save.saveAndInvite.mockResolvedValue([{ _id: 'meeting123', title: 'Team Meeting' }]);
    });

    it('should create a meeting successfully', async () => {
      const mockMeeting = { _id: 'meeting123', title: 'Team Meeting' };
      meetingOperations.createMeeting.mockResolvedValue(mockMeeting);
      req.user = { id: 'user123' };

      await meetingController.createMeeting(req, res);

      expect(meetingOperations.createMeeting).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockMeeting);
    });

    it('should return 400 if required fields are missing', async () => {
      req.body = { title: 'Meeting' };
      meetingOperations.createMeeting.mockRejectedValue(new Error('Please specify at least one attendee.'));

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('should return 400 if endTime is before startTime', async () => {
      req.body.startTime = new Date('2026-04-01T11:00:00Z');
      req.body.endTime = new Date('2026-04-01T10:00:00Z');
      meetingOperations.createMeeting.mockRejectedValue(new Error('past date or time'));

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('past') })
      );
    });

    it('should return 404 if organizer not found', async () => {
      meetingOperations.createMeeting.mockRejectedValue(new Error('User not found'));

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User not found' })
      );
    });

    it('should handle recurring meetings', async () => {
      req.body.isRecurring = true;
      req.body.recurrencePattern = 'DAILY';
      req.body.recurrenceCount = 5;

      const mockResult = { message: 'Created 5 recurring meetings' };
      meetingOperations.createMeeting.mockResolvedValue(mockResult);

      await meetingController.createMeeting(req, res);

      expect(meetingOperations.createMeeting).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    it('should handle errors gracefully', async () => {
      meetingOperations.createMeeting.mockRejectedValue(new Error('DB error'));

      await meetingController.createMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error', error: 'DB error' });
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
      meetingOperations.resolveAttendees.mockResolvedValue(['attendee1@example.com', 'attendee2@example.com']);
      meetingOperations.isTimeAvailable.mockResolvedValue(true);

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: true });
    });

    it('should return conflicts when attendees are busy', async () => {
      meetingOperations.resolveAttendees.mockResolvedValue(['attendee1@example.com']);
      meetingOperations.isTimeAvailable.mockResolvedValue(false);

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.json).toHaveBeenCalledWith({ available: false });
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
      meetingOperations.resolveAttendees.mockRejectedValue(new Error('Service error'));

      await meetingController.checkAttendeeAvailability(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Service error', error: 'Service error' });
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
      const mockResult = { id: 'meeting123', title: 'Team Meeting' };
      meetingOperations.deleteMeeting.mockResolvedValue(mockResult);
      req.user = { id: 'user123', email: 'organizer@example.com' };

      await meetingController.cancelMeeting(req, res);

      expect(meetingOperations.deleteMeeting).toHaveBeenCalledWith('meeting123', 'user123', 'organizer@example.com');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Meeting cancelled',
        meeting: mockResult
      });
    });

    it('should return 404 if user not found', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('User not found'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'User not found' })
      );
    });

    it('should return 404 if meeting not found', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('Meeting not found'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Meeting not found' })
      );
    });

    it('should return 403 if user is not the organizer', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('Only the organizer can cancel this meeting.'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('organizer') })
      );
    });

    it('should return 400 if meeting is already cancelled', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('Meeting is already cancelled.'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('already cancelled') })
      );
    });

    it('should cancel Zoom meeting when platform is zoom', async () => {
      meetingOperations.deleteMeeting.mockResolvedValue({ success: true });
      req.user = { id: 'user123', email: 'organizer@example.com' };

      await meetingController.cancelMeeting(req, res);

      expect(meetingOperations.deleteMeeting).toHaveBeenCalled();
    });

    it('should cancel Google Meet meeting when platform is google', async () => {
      meetingOperations.deleteMeeting.mockResolvedValue({ success: true });
      req.user = { id: 'user123', email: 'organizer@example.com' };

      await meetingController.cancelMeeting(req, res);

      expect(meetingOperations.deleteMeeting).toHaveBeenCalled();
    });

    it('should handle external cancellation failure gracefully', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('Failed Zoom action.'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
    });

    it('should handle email sending failure gracefully', async () => {
      meetingOperations.deleteMeeting.mockResolvedValue({ success: true });

      await meetingController.cancelMeeting(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle general errors', async () => {
      meetingOperations.deleteMeeting.mockRejectedValue(new Error('DB error'));

      await meetingController.cancelMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error', error: 'DB error' });
    });
  });

  describe('updateMeeting', () => {
    it('should update meeting successfully', async () => {
      const mockMeeting = { _id: 'meeting123', title: 'Updated Title' };
      meetingOperations.updateMeeting.mockResolvedValue(mockMeeting);
      req.params = { meetingId: 'meeting123' };
      req.body = { title: 'Updated Title' };
      req.user = { id: 'user123', email: 'organizer@example.com' };

      await meetingController.updateMeeting(req, res);

      expect(meetingOperations.updateMeeting).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Meeting updated',
        meeting: mockMeeting
      });
    });

    it('should return 404 if meeting not found', async () => {
      meetingOperations.updateMeeting.mockRejectedValue(new Error('Meeting not found'));

      await meetingController.updateMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Meeting not found' })
      );
    });

    it('should return 403 if user is not the organizer', async () => {
      meetingOperations.updateMeeting.mockRejectedValue(new Error('Only the organizer can edit this meeting.'));

      await meetingController.updateMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('organizer') })
      );
    });

    it('should return 400 if meeting is already cancelled', async () => {
      meetingOperations.updateMeeting.mockRejectedValue(new Error('Cannot edit a cancelled meeting.'));

      await meetingController.updateMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('cancelled') })
      );
    });

    it('should handle general errors', async () => {
      meetingOperations.updateMeeting.mockRejectedValue(new Error('DB error'));

      await meetingController.updateMeeting(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'DB error', error: 'DB error' });
    });
  });
});
