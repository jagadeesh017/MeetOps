// Set environment variable before requiring the service
process.env.GROQ_API_KEY = 'test-api-key';

const aiService = require('../../src/services/ai-service');

// Note: parseMeetingPrompt tests are skipped because Groq SDK is instantiated
// at module load time and cannot be easily mocked. The function would require
// dependency injection to be fully unit testable.

describe('AI Service', () => {
  afterAll(() => {
    delete process.env.GROQ_API_KEY;
  });

  describe('validateMeetingData', () => {
    it('should return true for valid meeting data', () => {
      const meetingData = {
        title: 'Test Meeting',
        attendees: ['user1@example.com'],
        duration: 60
      };

      expect(aiService.validateMeetingData(meetingData)).toBe(true);
    });

    it('should return false when title is missing', () => {
      const meetingData = {
        attendees: ['user1@example.com'],
        duration: 60
      };

      expect(aiService.validateMeetingData(meetingData)).toBeFalsy();
    });

    it('should return false when attendees is empty', () => {
      const meetingData = {
        title: 'Test Meeting',
        attendees: [],
        duration: 60
      };

      expect(aiService.validateMeetingData(meetingData)).toBeFalsy();
    });

    it('should return false when duration is zero', () => {
      const meetingData = {
        title: 'Test Meeting',
        attendees: ['user1@example.com'],
        duration: 0
      };

      expect(aiService.validateMeetingData(meetingData)).toBeFalsy();
    });

    it('should return false when attendees is not an array', () => {
      const meetingData = {
        title: 'Test Meeting',
        attendees: 'user1@example.com',
        duration: 60
      };

      expect(aiService.validateMeetingData(meetingData)).toBeFalsy();
    });
  });
});
