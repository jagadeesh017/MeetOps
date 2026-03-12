const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { login } = require('../../src/controllers/authController');
const Employee = require('../../src/models/employee');


jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../../src/models/employee');

describe('Auth Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return 400 if user not found', async () => {
      req.body = {
        email: 'notfound@example.com',
        password: 'password123'
      };

      Employee.findOne.mockResolvedValue(null);

      await login(req, res);

      expect(Employee.findOne).toHaveBeenCalledWith({ email: 'notfound@example.com' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('should return 400 if password does not match', async () => {
      req.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const mockUser = {
        _id: '123',
        email: 'test@example.com',
        password: 'hashedpassword'
      };

      Employee.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      await login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashedpassword');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });

    it('should return token on successful login', async () => {
      req.body = {
        email: 'test@example.com',
        password: 'correctpassword'
      };

      const mockUser = {
        _id: '123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        department: 'Engineering',
        settings: {},
        save: jest.fn().mockResolvedValue()
      };

      const mockToken = 'jwt-token-12345';

      Employee.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue(mockToken);

      await login(req, res);

      expect(Employee.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', 'hashedpassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: '123' },
        'test-secret',
        { expiresIn: '30m' }
      );
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        accessToken: mockToken,
        refreshToken: expect.any(String),
        user: expect.objectContaining({ id: '123' })
      }));
    });

    it('should return 500 on server error', async () => {
      req.body = {
        email: 'test@example.com',
        password: 'password123'
      };

      Employee.findOne.mockRejectedValue(new Error('Database error'));

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Server error' });
    });

    it('should handle empty credentials', async () => {
      req.body = {
        email: '',
        password: ''
      };

      Employee.findOne.mockResolvedValue(null);

      await login(req, res);

      expect(Employee.findOne).toHaveBeenCalledWith({ email: '' });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
    });
  });
});
