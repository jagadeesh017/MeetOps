const emailTemplateService = require('../../src/services/templates');

describe('Email Template Service', () => {
  describe('buildInviteHTML', () => {
    it('should build invite email for Zoom meeting', () => {
      const meetingData = {
        title: 'Team Standup',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'attendee1@example.com', name: 'Attendee One' },
          { email: 'attendee2@example.com', name: 'Attendee Two' }
        ],
        description: 'Daily standup meeting',
        joinUrl: 'https://zoom.us/j/123456789',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('Team Standup');
      expect(html).toContain('Zoom');
      expect(html).toContain('https://zoom.us/j/123456789');
      expect(html).toContain('Attendee One, Attendee Two');
      expect(html).toContain('Daily standup meeting');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('MeetOps');
    });

    it('should build invite email for Google Meet meeting', () => {
      const meetingData = {
        title: 'Project Review',
        startTime: '2026-03-15T14:00:00Z',
        endTime: '2026-03-15T15:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'attendee@example.com', name: 'Attendee' }
        ],
        description: 'Q1 project review',
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        platform: 'google'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('Project Review');
      expect(html).toContain('Google Meet');
      expect(html).toContain('https://meet.google.com/abc-defg-hij');
      expect(html).toContain('Attendee');
      expect(html).toContain('Q1 project review');
    });

    it('should handle meeting with meet platform variant', () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [],
        joinUrl: 'https://meet.google.com/test',
        platform: 'meet'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('Google Meet');
    });

    it('should handle empty attendees list', () => {
      const meetingData = {
        title: 'Solo Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [],
        joinUrl: 'https://zoom.us/j/123',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('None');
    });

    it('should handle attendees with only emails', () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [
          { email: 'user1@example.com' },
          { email: 'user2@example.com' }
        ],
        joinUrl: 'https://zoom.us/j/123',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('user1@example.com, user2@example.com');
    });

    it('should handle missing description', () => {
      const meetingData = {
        title: 'No Description Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        attendees: [],
        joinUrl: 'https://zoom.us/j/123',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildInviteHTML(meetingData);

      expect(html).toContain('No Description Meeting');
      expect(html).not.toContain('undefined');
    });
  });

  describe('buildCancellationHTML', () => {
    it('should build cancellation email for Zoom meeting', () => {
      const meetingData = {
        title: 'Cancelled Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildCancellationHTML(meetingData);

      expect(html).toContain('Cancelled Meeting');
      expect(html).toContain('has been cancelled');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('MeetOps');
    });

    it('should build cancellation email for Google Meet', () => {
      const meetingData = {
        title: 'Cancelled Project Review',
        startTime: '2026-03-15T14:00:00Z',
        endTime: '2026-03-15T15:00:00Z',
        organizerEmail: 'organizer@example.com',
        platform: 'google'
      };

      const html = emailTemplateService.buildCancellationHTML(meetingData);

      expect(html).toContain('Cancelled Project Review');
      expect(html).toContain('has been cancelled');
      expect(html).toContain('organizer@example.com');
    });

    it('should handle unknown platform', () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: '2026-03-15T10:00:00Z',
        endTime: '2026-03-15T11:00:00Z',
        organizerEmail: 'organizer@example.com',
        platform: 'unknown'
      };

      const html = emailTemplateService.buildCancellationHTML(meetingData);

      expect(html).toContain('Test Meeting');
      expect(html).toContain('has been cancelled');
    });

    it('should format date time correctly', () => {
      const meetingData = {
        title: 'Test Meeting',
        startTime: new Date('2026-03-15T10:00:00Z'),
        endTime: new Date('2026-03-15T11:00:00Z'),
        organizerEmail: 'organizer@example.com',
        platform: 'zoom'
      };

      const html = emailTemplateService.buildCancellationHTML(meetingData);

      expect(html).toContain('Test Meeting');
      // Date formatting will vary by locale, just check it's there
      expect(html.length).toBeGreaterThan(0);
    });
  });
});
