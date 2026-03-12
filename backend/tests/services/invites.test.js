const nodemailer = require('nodemailer');
const { sendMeetingInvites, sendMeetingCancellations } = require('../../src/services/invites');
const { buildInviteHTML, buildCancellationHTML } = require('../../src/services/templates');

// Mock dependencies
jest.mock('nodemailer');
jest.mock('../../src/services/templates');
jest.mock('ical-generator', () => {
  const mockEvent = {
    createAttendee: jest.fn()
  };
  const mockCal = {
    createEvent: jest.fn(() => mockEvent),
    toString: jest.fn(() => 'BEGIN:VCALENDAR\nEND:VCALENDAR')
  };
  return jest.fn(() => mockCal);
});

describe('Email Invite Service', () => {
  let mockTransporter;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ accepted: ['test@example.com'] })
    };

    nodemailer.createTransport = jest.fn().mockReturnValue(mockTransporter);

    process.env.EMAIL_USER = 'test@example.com';
    process.env.EMAIL_PASS = 'test-password';
    process.env.EMAIL_SERVICE = 'gmail';

    buildInviteHTML.mockReturnValue('<html>Invite</html>');
    buildCancellationHTML.mockReturnValue('<html>Cancelled</html>');
  });

  afterEach(() => {
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;
    delete process.env.EMAIL_SERVICE;
  });

  describe('sendMeetingInvites', () => {
    it('should send invites to all attendees', async () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'attendee1@example.com', name: 'Attendee 1' },
          { email: 'attendee2@example.com', name: 'Attendee 2' }
        ],
        joinUrl: 'https://zoom.us/j/123456789',
        platform: 'zoom'
      };

      const result = await sendMeetingInvites(meetingData);

      expect(nodemailer.createTransport).toHaveBeenCalled();
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should handle empty attendees list', async () => {
      const meetingData = {
        title: 'Test Meeting',
        organizerEmail: 'organizer@example.com',
        attendees: []
      };

      const result = await sendMeetingInvites(meetingData);

      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle send failures gracefully', async () => {
      mockTransporter.sendMail
        .mockResolvedValueOnce({ accepted: ['test1@example.com'] })
        .mockRejectedValueOnce(new Error('Send failed'));

      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'test1@example.com' },
          { email: 'test2@example.com' }
        ]
      };

      const result = await sendMeetingInvites(meetingData);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should include ICS calendar attachment', async () => {
      const meetingData = {
        title: 'Meeting with Calendar',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [{ email: 'test@example.com' }],
        description: 'Test meeting description',
        joinUrl: 'https://meet.google.com/abc-defg-hij'
      };

      await sendMeetingInvites(meetingData);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Meeting with Calendar')
        })
      );
    });
  });

  describe('sendMeetingCancellations', () => {
    it('should send cancellation emails to attendees', async () => {
      const meetingData = {
        title: 'Cancelled Meeting',
        startTime: '2026-03-15T10:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'attendee1@example.com' },
          { email: 'attendee2@example.com' }
        ]
      };

      const result = await sendMeetingCancellations(meetingData);

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(2);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should use cancellation template', async () => {
      const meetingData = {
        title: 'Cancelled Meeting',
        startTime: '2026-03-15T10:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [{ email: 'test@example.com' }]
      };

      await sendMeetingCancellations(meetingData);

      expect(buildCancellationHTML).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cancelled Meeting'
        })
      );
    });
  });

  describe('createTransporter', () => {
    it('should throw error if credentials not configured', () => {
      delete process.env.EMAIL_USER;
      delete process.env.EMAIL_PASS;

      expect(() => {
        require('../../src/services/invites');
      }).toBeDefined();
    });

    it('should use gmail service if specified', () => {
      process.env.EMAIL_SERVICE = 'gmail';
      process.env.EMAIL_USER = 'test@gmail.com';
      process.env.EMAIL_PASS = 'password';

      const meetingData = {
        title: 'Test',
        organizerEmail: 'test@gmail.com',
        attendees: [{ email: 'attendee@test.com' }]
      };

      sendMeetingInvites(meetingData);

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'gmail'
        })
      );
    });
  });
});
