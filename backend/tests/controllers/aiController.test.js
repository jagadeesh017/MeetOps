// Set GROQ_API_KEY before requiring modules
process.env.GROQ_API_KEY = 'test-groq-api-key';

const aiController = require('../../src/controllers/aiController');
const aiService = require('../../src/services/ai-service');
const schedulingService = require('../../src/services/ai-scheduling-service');
const Employee = require('../../src/models/employee');
const Meeting = require('../../src/models/meeting');
const zoomService = require('../../src/services/zoom-service');
const googleMeetService = require('../../src/services/google-meet-service');

jest.mock('../../src/services/ai-service');
jest.mock('../../src/services/ai-scheduling-service');
jest.mock('../../src/models/employee');
jest.mock('../../src/models/meeting');
jest.mock('../../src/services/zoom-service');
jest.mock('../../src/services/google-meet-service');

describe('AI Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      user: { id: 'user123' }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('scheduleFromPrompt', () => {
    const mockUser = {
      _id: 'user123',
      email: 'test@example.com',
      zoomConnected: true,
      googleConnected: true
    };

    it('should return 404 if user not found', async () => {
      Employee.findById.mockResolvedValue(null);
      req.body = { prompt: 'schedule meeting' };

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });

    it('should return 400 if prompt is empty', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: '   ' };

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide a meeting request'
      });
    });

    it('should handle AI parse error for non-meeting requests', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'what is the weather today?' };
      
      aiService.parseMeetingPrompt.mockRejectedValue(
        new Error("I'm specifically designed to help schedule meetings")
      );

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('specifically designed')
      });
    });

    it('should return 400 if meeting request is false', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'hello' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        isMeetingRequest: false
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.stringContaining('specifically designed')
      });
    });

    it('should ask for platform if missing', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'schedule meeting with john' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        description: 'NEEDS_PLATFORM_ASK',
        timePreference: 'tomorrow'
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Which platform would you like to use? Zoom or Google Meet?',
        receivedData: expect.any(Object)
      });
    });

    it('should ask for attendees if missing', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'schedule zoom meeting tomorrow' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        description: 'NEEDS_ATTENDEES',
        platform: 'zoom',
        timePreference: 'tomorrow'
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Who should I invite to this meeting?',
        receivedData: expect.any(Object)
      });
    });

    it('should ask for time if missing', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'schedule zoom meeting with john' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        description: 'NEEDS_TIME',
        platform: 'zoom'
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'When would you like to schedule this meeting?',
        receivedData: expect.any(Object)
      });
    });

    it('should return 400 if Zoom not connected', async () => {
      Employee.findById.mockResolvedValue({
        ...mockUser,
        zoomConnected: false
      });
      req.body = { prompt: 'schedule zoom meeting with john tomorrow' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        platform: 'zoom',
        timePreference: 'tomorrow'
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Zoom is not connected. Please connect in integrations first.'
      });
    });

    it('should return 400 if Google not connected', async () => {
      Employee.findById.mockResolvedValue({
        ...mockUser,
        googleConnected: false
      });
      req.body = { prompt: 'schedule google meet with john tomorrow' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        platform: 'google',
        timePreference: 'tomorrow'
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Google Meet is not connected. Please connect in integrations first.'
      });
    });

    it('should create meeting successfully', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'schedule zoom meeting with john tomorrow at 3pm' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting with john',
        attendees: ['john'],
        platform: 'zoom',
        timePreference: 'tomorrow at 3pm',
        suggestedTime: new Date('2026-03-02T15:00:00Z'),
        duration: 60
      });

      schedulingService.createAutomatedMeeting.mockResolvedValue({
        success: true,
        meeting: {
          id: 'meeting123',
          title: 'Meeting with john'
        }
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(schedulingService.createAutomatedMeeting).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        meeting: expect.any(Object)
      });
    });

    it('should handle scheduling errors', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'schedule zoom meeting with john tomorrow' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        platform: 'zoom',
        timePreference: 'tomorrow',
        suggestedTime: new Date('2026-03-02T10:00:00Z'),
        duration: 60
      });

      schedulingService.createAutomatedMeeting.mockRejectedValue(
        new Error('Failed to create meeting: Some error')
      );

      await aiController.scheduleFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String)
      });
    });

    it('should infer platform from prompt', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'zoom meeting with john tomorrow at 3pm' };
      
      aiService.parseMeetingPrompt.mockResolvedValue({
        title: 'Meeting',
        attendees: ['john'],
        timePreference: 'tomorrow at 3pm',
        suggestedTime: new Date('2026-03-02T15:00:00Z'),
        duration: 60
        // No platform specified
      });

      schedulingService.createAutomatedMeeting.mockResolvedValue({
        success: true,
        meeting: { id: 'meeting123' }
      });

      await aiController.scheduleFromPrompt(req, res);

      expect(schedulingService.createAutomatedMeeting).toHaveBeenCalledWith(
        expect.objectContaining({ platform: 'zoom' }),
        expect.any(String),
        expect.any(String),
        'zoom'
      );
    });
  });

  describe('getSuggestedTimes', () => {
    it('should return 400 if attendees missing', async () => {
      req.body = {};

      await aiController.getSuggestedTimes(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide attendee emails'
      });
    });

    it('should return suggested time slots', async () => {
      req.body = {
        attendees: ['user1@example.com', 'user2@example.com'],
        duration: 60,
        startDate: '2026-03-15T09:00:00Z'
      };

      const mockSlots = [
        new Date('2026-03-15T09:00:00Z'),
        new Date('2026-03-15T10:00:00Z'),
        new Date('2026-03-15T14:00:00Z')
      ];

      schedulingService.getSuggestedTimeSlots.mockResolvedValue(mockSlots);

      await aiController.getSuggestedTimes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        suggestedTimes: mockSlots,
        duration: 60
      });
    });

    it('should handle errors', async () => {
      req.body = { attendees: ['user@example.com'] };
      
      schedulingService.getSuggestedTimeSlots.mockRejectedValue(
        new Error('Database error')
      );

      await aiController.getSuggestedTimes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Database error'
      });
    });
  });

  describe('analyzeRequest', () => {
    it('should return 400 if prompt is empty', async () => {
      req.body = { prompt: '' };

      await aiController.analyzeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide a request to analyze'
      });
    });

    it('should analyze and validate meeting data', async () => {
      req.body = { prompt: 'schedule meeting with john' };

      const mockData = {
        title: 'Meeting',
        attendees: ['john'],
        duration: 60
      };

      aiService.parseMeetingPrompt.mockResolvedValue(mockData);
      aiService.validateMeetingData.mockReturnValue(true);

      await aiController.analyzeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        isValid: true,
        extractedData: mockData
      });
    });

    it('should handle analysis errors', async () => {
      req.body = { prompt: 'test' };
      
      aiService.parseMeetingPrompt.mockRejectedValue(new Error('Parse error'));

      await aiController.analyzeRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Parse error'
      });
    });
  });

  describe('deleteFromPrompt', () => {
    const mockUser = {
      _id: 'user123',
      email: 'test@example.com',
      zoomAccessToken: 'zoom-token',
      zoomRefreshToken: 'zoom-refresh',
      googleAccessToken: 'google-token',
      googleRefreshToken: 'google-refresh'
    };

    it('should return 404 if user not found', async () => {
      Employee.findById.mockResolvedValue(null);
      req.body = { prompt: 'delete meeting' };

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found'
      });
    });

    it('should return 400 if prompt is empty', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: '' };

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please specify which meeting to delete'
      });
    });

    it('should return 400 if no delete keyword', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'show me meetings' };

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please tell me which meeting to delete.'
      });
    });

    it('should return 400 if no ID or title provided', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting' };

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Please provide the meeting ID or title in quotes.'
      });
    });

    it('should delete meeting by ID', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting 507f1f77bcf86cd799439011' };

      const mockMeeting = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Meeting',
        organizerEmail: 'test@example.com',
        platform: 'zoom',
        externalId: 'zoom123'
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      Meeting.deleteOne.mockResolvedValue({});
      zoomService.deleteZoomMeeting.mockResolvedValue({ success: true });

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Meeting deleted successfully',
        deletedMeeting: expect.any(Object)
      });
    });

    it('should return 404 if meeting not found by ID', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting 507f1f77bcf86cd799439011' };

      Meeting.findById.mockResolvedValue(null);

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Meeting not found'
      });
    });

    it('should return 403 if not organizer', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting 507f1f77bcf86cd799439011' };

      const mockMeeting = {
        _id: '507f1f77bcf86cd799439011',
        organizerEmail: 'other@example.com'
      };

      Meeting.findById.mockResolvedValue(mockMeeting);

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Only organizer can delete'
      });
    });

    it('should delete meeting by title', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting "Team Standup"' };

      const mockMeeting = {
        _id: 'meeting123',
        title: 'Team Standup',
        organizerEmail: 'test@example.com',
        platform: 'google',
        externalId: 'google-event-123'
      };

      Meeting.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockMeeting])
        })
      });
      Meeting.deleteOne.mockResolvedValue({});
      googleMeetService.deleteGoogleMeetEvent.mockResolvedValue({ success: true });

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Meeting deleted successfully',
        deletedMeeting: expect.any(Object)
      });
    });

    it('should return 409 if multiple meetings match title', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'cancel "Team Meeting"' };

      Meeting.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([
            { _id: 'meeting1', title: 'Team Meeting' },
            { _id: 'meeting2', title: 'Team Meeting' }
          ])
        })
      });

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Multiple meetings match. Please provide the meeting ID.'
      });
    });

    it('should handle zoom cancellation error', async () => {
      Employee.findById.mockResolvedValue(mockUser);
      req.body = { prompt: 'delete meeting 507f1f77bcf86cd799439011' };

      const mockMeeting = {
        _id: '507f1f77bcf86cd799439011',
        title: 'Test Meeting',
        organizerEmail: 'test@example.com',
        platform: 'zoom',
        externalId: 'zoom123'
      };

      Meeting.findById.mockResolvedValue(mockMeeting);
      zoomService.deleteZoomMeeting.mockResolvedValue({
        success: false,
        error: 'Zoom API error'
      });

      await aiController.deleteFromPrompt(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Zoom API error'
      });
    });
  });
});
