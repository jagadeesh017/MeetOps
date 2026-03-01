const { getGoogleAuthUrl, googleCallback, getZoomAuthUrl, zoomCallback, disconnectIntegration, getIntegrationStatus } = require('../../src/controllers/integrationController');
const Employee = require('../../src/models/employee');
const { google } = require('googleapis');
const axios = require('axios');

// Mock dependencies
jest.mock('../../src/models/employee');
jest.mock('googleapis');
jest.mock('axios');

describe('Integration Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { id: 'user-123' },
      query: {},
      params: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn()
    };

    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost/callback';
    process.env.ZOOM_CLIENT_ID = 'zoom-client-id';
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    process.env.ZOOM_REDIRECT_URI = 'http://localhost/zoom/callback';

    jest.clearAllMocks();
  });

  describe('getGoogleAuthUrl', () => {
    it('should generate Google OAuth URL', () => {
      const mockOAuth2Client = {
        generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth')
      };

      google.auth.OAuth2 = jest.fn().mockReturnValue(mockOAuth2Client);

      getGoogleAuthUrl(req, res);

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: expect.any(Array),
        prompt: 'consent',
        state: 'user-123'
      });

      expect(res.json).toHaveBeenCalledWith({
        url: 'https://accounts.google.com/oauth'
      });
    });
  });

  describe('googleCallback', () => {
    it('should handle successful Google OAuth callback', async () => {
      req.query = {
        code: 'google-auth-code',
        state: 'user-123'
      };

      const mockOAuth2Client = {
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'access-token',
            refresh_token: 'refresh-token'
          }
        }),
        setCredentials: jest.fn()
      };

      google.auth.OAuth2 = jest.fn().mockReturnValue(mockOAuth2Client);

      const mockUserInfo = {
        data: { email: 'test@gmail.com' }
      };

      google.oauth2 = jest.fn().mockReturnValue({
        userinfo: {
          get: jest.fn().mockResolvedValue(mockUserInfo)
        }
      });

      Employee.findByIdAndUpdate.mockResolvedValue({ _id: 'user-123' });

      await googleCallback(req, res);

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('google-auth-code');
      expect(Employee.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          googleConnected: true,
          googleAccessToken: 'access-token',
          googleRefreshToken: 'refresh-token',
          googleEmail: 'test@gmail.com'
        })
      );
      expect(res.redirect).toHaveBeenCalled();
    });

    it('should handle Google OAuth error', async () => {
      req.query = {
        code: 'invalid-code',
        state: 'user-123'
      };

      const mockOAuth2Client = {
        getToken: jest.fn().mockRejectedValue(new Error('Invalid code'))
      };

      google.auth.OAuth2 = jest.fn().mockReturnValue(mockOAuth2Client);

      await googleCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('getZoomAuthUrl', () => {
    it('should generate Zoom OAuth URL', () => {
      getZoomAuthUrl(req, res);

      expect(res.json).toHaveBeenCalledWith({
        url: expect.stringContaining('zoom.us/oauth/authorize')
      });
    });

    it('should include user state in Zoom URL', () => {
      getZoomAuthUrl(req, res);

      const url = res.json.mock.calls[0][0].url;
      expect(url).toContain('state=user-123');
    });
  });

  describe('zoomCallback', () => {
    it('should handle successful Zoom OAuth callback', async () => {
      req.query = {
        code: 'zoom-auth-code',
        state: 'user-123'
      };

      axios.post.mockResolvedValue({
        data: {
          access_token: 'zoom-access-token',
          refresh_token: 'zoom-refresh-token'
        }
      });

      axios.get.mockResolvedValue({
        data: {
          email: 'test@zoom.us'
        }
      });

      Employee.findByIdAndUpdate.mockResolvedValue({ _id: 'user-123' });

      await zoomCallback(req, res);

      expect(axios.post).toHaveBeenCalledWith(
        'https://zoom.us/oauth/token',
        expect.any(String),
        expect.any(Object)
      );

      expect(Employee.findByIdAndUpdate).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalled();
    });

    it('should handle Zoom OAuth error', async () => {
      req.query = {
        code: 'invalid-code',
        state: 'user-123'
      };

      axios.post.mockRejectedValue(new Error('Invalid code'));

      await zoomCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('disconnectIntegration', () => {
    it('should disconnect Google integration', async () => {
      req.body = { platform: 'google' };

      const mockUser = {
        _id: 'user-123'
      };

      Employee.findByIdAndUpdate.mockResolvedValue(mockUser);

      await disconnectIntegration(req, res);

      expect(Employee.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          googleConnected: false,
          googleAccessToken: null,
          googleRefreshToken: null,
          googleEmail: null
        })
      );
      expect(res.json).toHaveBeenCalledWith({
        message: 'google disconnected successfully'
      });
    });

    it('should disconnect Zoom integration', async () => {
      req.body = { platform: 'zoom' };

      Employee.findByIdAndUpdate.mockResolvedValue({});

      await disconnectIntegration(req, res);

      expect(Employee.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          zoomConnected: false,
          zoomAccessToken: null
        })
      );
    });

    it('should return 400 for invalid platform', async () => {
      req.body = { platform: 'invalid' };

      await disconnectIntegration(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid platform'
      });
    });
  });

  describe('getIntegrationStatus', () => {
    it('should return integration status', async () => {
      const mockUser = {
        googleConnected: true,
        googleEmail: 'test@gmail.com',
        zoomConnected: true,
        zoomEmail: 'test@zoom.us'
      };

      Employee.findById.mockResolvedValue(mockUser);

      await getIntegrationStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        google: {
          connected: true,
          email: 'test@gmail.com'
        },
        zoom: {
          connected: true,
          email: 'test@zoom.us'
        }
      });
    });

    it('should return false for disconnected services', async () => {
      const mockUser = {
        googleConnected: false,
        zoomConnected: false
      };

      Employee.findById.mockResolvedValue(mockUser);

      await getIntegrationStatus(req, res);

      expect(res.json).toHaveBeenCalledWith({
        google: {
          connected: false,
          email: undefined
        },
        zoom: {
          connected: false,
          email: undefined
        }
      });
    });
  });
});
