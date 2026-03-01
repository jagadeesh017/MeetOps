const googleMeetService = require('../../src/services/google-meet-service');
const { google } = require('googleapis');

jest.mock('googleapis');

describe('Google Meet Service', () => {
  let mockOAuth2Client;
  let mockCalendar;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOAuth2Client = {
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn()
    };

    mockCalendar = {
      events: {
        insert: jest.fn(),
        delete: jest.fn()
      }
    };

    google.auth = {
      OAuth2: jest.fn(() => mockOAuth2Client)
    };

    google.calendar = jest.fn(() => mockCalendar);

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback';
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  describe('createGoogleMeetMeeting', () => {
    it('should create Google Meet meeting successfully', async () => {
      const mockEventResponse = {
        data: {
          id: 'event-123',
          conferenceData: {
            entryPoints: [
              { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }
            ]
          },
          hangoutLink: 'https://meet.google.com/abc-defg-hij'
        }
      };

      mockCalendar.events.insert.mockResolvedValue(mockEventResponse);
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        }
      });

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'attendee1@example.com' },
          { email: 'attendee2@example.com' }
        ],
        timezone: 'IST',
        description: 'Test description'
      };

      const userTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(true);
      expect(result.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
      expect(result.eventId).toBe('event-123');
      expect(result.platform).toBe('meet');
      expect(mockCalendar.events.insert).toHaveBeenCalled();
    });

    it('should handle missing refresh token', async () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const userTokens = {
        accessToken: 'test-access-token'
        // Missing refreshToken
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Google refresh token');
    });

    it('should handle invalid_grant error', async () => {
      const error = new Error('Token has been expired or revoked. invalid_grant');
      mockCalendar.events.insert.mockRejectedValue(error);
      mockOAuth2Client.refreshAccessToken.mockRejectedValue(error);

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const userTokens = {
        accessToken: 'invalid-token',
        refreshToken: 'test-refresh-token'
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid or expired Google token');
    });

    it('should handle missing Meet link', async () => {
      const mockEventResponse = {
        data: {
          id: 'event-123',
          conferenceData: {},
          // Missing hangoutLink
        }
      };

      mockCalendar.events.insert.mockResolvedValue(mockEventResponse);
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'new-access-token'
        }
      });

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const userTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Meet link not generated');
    });

    it('should use hangoutLink as fallback', async () => {
      const mockEventResponse = {
        data: {
          id: 'event-123',
          conferenceData: {
            entryPoints: [] // Empty entry points
          },
          hangoutLink: 'https://meet.google.com/fallback-link'
        }
      };

      mockCalendar.events.insert.mockResolvedValue(mockEventResponse);
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-access-token' }
      });

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const userTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(true);
      expect(result.meetingUrl).toBe('https://meet.google.com/fallback-link');
    });

    it('should handle API errors', async () => {
      const error = new Error('Calendar API error');
      error.response = {
        data: {
          error: { message: 'Calendar API error' }
        }
      };
      mockCalendar.events.insert.mockRejectedValue(error);

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-access-token' }
      });

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const userTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      };

      const result = await googleMeetService.createGoogleMeetMeeting(meetingData, userTokens);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Calendar API error');
    });
  });

  describe('deleteGoogleMeetEvent', () => {
    it('should delete Google Meet event successfully', async () => {
      mockCalendar.events.delete.mockResolvedValue({ data: {} });
      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-access-token' }
      });

      const result = await googleMeetService.deleteGoogleMeetEvent('event-123', {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      });

      expect(result.success).toBe(true);
      expect(mockCalendar.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        sendUpdates: 'all'
      });
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Event not found');
      error.response = {
        data: {
          error: { message: 'Event not found' }
        }
      };
      mockCalendar.events.delete.mockRejectedValue(error);

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'new-access-token' }
      });

      const result = await googleMeetService.deleteGoogleMeetEvent('invalid-event', {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Event not found');
    });

    it('should handle missing refresh token during deletion', async () => {
      const result = await googleMeetService.deleteGoogleMeetEvent('event-123', {
        accessToken: 'test-access-token'
        // Missing refreshToken
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Google refresh token');
    });
  });
});
