const zoomService = require('../../src/services/zoom-service');
const axios = require('axios');

jest.mock('axios');

describe('Zoom Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ZOOM_CLIENT_ID = 'test-client-id';
    process.env.ZOOM_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
  });

  describe('refreshZoomToken', () => {
    it('should refresh zoom token successfully', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600
        }
      };

      axios.post.mockResolvedValue(mockTokenResponse);

      const result = await zoomService.refreshZoomToken('old-refresh-token');

      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
      expect(axios.post).toHaveBeenCalledWith(
        'https://zoom.us/oauth/token',
        null,
        expect.objectContaining({
          params: {
            grant_type: 'refresh_token',
            refresh_token: 'old-refresh-token'
          }
        })
      );
    });

    it('should throw error when refresh fails', async () => {
      axios.post.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(zoomService.refreshZoomToken('invalid-token'))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('createZoomMeeting', () => {
    it('should create zoom meeting successfully', async () => {
      const mockMeetingResponse = {
        data: {
          id: 123456789,
          join_url: 'https://zoom.us/j/123456789',
          start_url: 'https://zoom.us/s/123456789'
        }
      };

      axios.post.mockResolvedValue(mockMeetingResponse);

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        timezone: 'UTC',
        description: 'Test description'
      };

      const result = await zoomService.createZoomMeeting(
        meetingData,
        'test-access-token',
        'test-refresh-token'
      );

      expect(result.success).toBe(true);
      expect(result.meetingUrl).toBe('https://zoom.us/j/123456789');
      expect(result.meetingId).toBe('123456789');
      expect(result.platform).toBe('zoom');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/users/me/meetings',
        expect.objectContaining({
          topic: 'Test Meeting',
          type: 2,
          duration: 60
        }),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json'
          }
        })
      );
    });

    it('should handle zoom API errors', async () => {
      axios.post.mockRejectedValue({
        response: {
          data: { message: 'Invalid access token' },
          status: 401
        }
      });

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z'
      };

      const result = await zoomService.createZoomMeeting(
        meetingData,
        'invalid-token',
        'refresh-token'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Zoom token refresh failed');
      expect(result.status).toBe(401);
    });

    it('should calculate duration correctly', async () => {
      const mockMeetingResponse = {
        data: {
          id: 123456789,
          join_url: 'https://zoom.us/j/123456789'
        }
      };

      axios.post.mockResolvedValue(mockMeetingResponse);

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:30:00Z', // 90 minutes
        timezone: 'UTC'
      };

      await zoomService.createZoomMeeting(meetingData, 'token', 'refresh');

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          duration: 90
        }),
        expect.any(Object)
      );
    });
  });

  describe('deleteZoomMeeting', () => {
    it('should delete zoom meeting successfully', async () => {
      axios.delete.mockResolvedValue({ data: {} });

      const result = await zoomService.deleteZoomMeeting(
        '123456789',
        'test-access-token',
        'test-refresh-token'
      );

      expect(result.success).toBe(true);
      expect(axios.delete).toHaveBeenCalledWith(
        'https://api.zoom.us/v2/meetings/123456789',
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-access-token' }
        })
      );
    });

    it('should handle deletion errors', async () => {
      axios.delete.mockRejectedValue({
        response: {
          data: { message: 'Meeting not found' }
        }
      });

      const result = await zoomService.deleteZoomMeeting(
        'invalid-id',
        'token',
        'refresh'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Meeting not found');
    });

    it('should handle network errors during deletion', async () => {
      axios.delete.mockRejectedValue(new Error('Network error'));

      const result = await zoomService.deleteZoomMeeting(
        '123456789',
        'token',
        'refresh'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
