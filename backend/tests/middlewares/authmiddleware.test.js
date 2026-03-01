const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middlewares/authmiddleware');

// Mock jwt
jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if no authorization header', () => {
    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'No token provided' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 if authorization header is empty', () => {
    req.headers.authorization = '';

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'No token provided' });
  });

  it('should verify token and call next on valid token', () => {
    const mockDecoded = { id: '123', email: 'test@example.com' };
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue(mockDecoded);

    authMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
    expect(req.user).toEqual(mockDecoded);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 401 on invalid token', () => {
    req.headers.authorization = 'Bearer invalid-token';
    jwt.verify.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 on expired token', () => {
    req.headers.authorization = 'Bearer expired-token';
    jwt.verify.mockImplementation(() => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      throw error;
    });

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
  });

  it('should handle Bearer token format correctly', () => {
    const mockDecoded = { id: '456' };
    req.headers.authorization = 'Bearer my-test-token-123';
    jwt.verify.mockReturnValue(mockDecoded);

    authMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('my-test-token-123', 'test-secret');
    expect(next).toHaveBeenCalled();
  });

  it('should use default secret if JWT_SECRET not set', () => {
    delete process.env.JWT_SECRET;
    const mockDecoded = { id: '789' };
    req.headers.authorization = 'Bearer token';
    jwt.verify.mockReturnValue(mockDecoded);

    authMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('token', 'secretkey');
    expect(next).toHaveBeenCalled();
  });
});
