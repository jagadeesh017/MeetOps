# Availability Check Feature

## Overview
This feature checks attendee availability when scheduling meetings and allows the organizer to proceed even if some attendees are busy.

## Features

### 1. **Availability Check Endpoint**
- **Endpoint**: `POST /meetings/check-availability`
- **Purpose**: Check if attendees are available for a specific time slot
- **Request Body**:
  ```json
  {
    "attendees": [{"name": "John", "email": "john@example.com"}],
    "startTime": "2026-02-22T10:00:00.000Z",
    "endTime": "2026-02-22T11:00:00.000Z"
  }
  ```
- **Response**:
  ```json
  {
    "available": false,
    "busyAttendees": [
      {
        "email": "john@example.com",
        "name": "John",
        "conflict": {
          "title": "Team Standup",
          "startTime": "2026-02-22T10:00:00.000Z",
          "endTime": "2026-02-22T10:30:00.000Z",
          "joinUrl": "https://zoom.us/j/123456"
        }
      }
    ],
    "checkedCount": 1
  }
  ```

### 2. **Meeting Creation with Conflict Handling**
- **New Parameter**: `ignoreBusy` (boolean)
- **Behavior**:
  - If `ignoreBusy` is `false` or not provided, the API checks for attendee conflicts
  - If conflicts are found, returns a 409 status with `canProceed: true`
  - If `ignoreBusy` is `true`, skips attendee conflict checks (but still checks organizer)
  - Organizer conflicts are always enforced (cannot be ignored)

### 3. **Frontend UI Enhancements**

#### Check Availability Button
- Appears below the attendee list when attendees are added
- Shows "🔍 Check Availability" button
- Displays loading state while checking
- Shows success message if all attendees are available

#### Busy Warning Dialog
- Automatically appears when trying to create a meeting with busy attendees
- Shows list of busy attendees with their conflicting meetings
- Displays conflict details: meeting title and time range
- Provides two options:
  - **Proceed Anyway**: Creates the meeting ignoring busy attendees
  - **Cancel**: Returns to form to adjust meeting time

#### Visual Indicators
- Yellow warning box with ⚠️ icon
- Clear list of busy attendees with conflict details
- Formatted time display for easy reading

## User Flow

1. **User schedules a meeting** and adds attendees
2. **Optional**: User clicks "Check Availability" button to verify
3. **On Submit**: System automatically checks for conflicts
4. **If conflicts found**:
   - Warning dialog appears showing busy attendees
   - User can either:
     - Adjust meeting time and try again
     - Click "Proceed Anyway" to create meeting despite conflicts
5. **Meeting created** with all attendees notified

## Technical Implementation

### Backend Changes
- **File**: `backend/src/controllers/meetingController.js`
  - Added `checkAttendeeAvailability()` function
  - Modified `createMeeting()` to accept `ignoreBusy` parameter
  - Separated organizer and attendee conflict checks
  - Enhanced error responses with structured conflict data

- **File**: `backend/src/routes/meetingroutes.js`
  - Added new route: `POST /meetings/check-availability`

### Frontend Changes
- **File**: `frontend/src/services/api.js`
  - Added `checkAttendeeAvailability()` function

- **File**: `frontend/src/components/ScheduleMeeting.jsx`
  - Added state management for busy attendees and warnings
  - Implemented `handleCheckAvailability()` function
  - Implemented `handleProceedAnyway()` function
  - Added busy warning UI component
  - Added "Check Availability" button in attendee section
  - Modified `handleSubmit()` to handle conflict responses

## Benefits

1. **Improved Scheduling**: Users can see conflicts before creating meetings
2. **Flexibility**: Allows urgent meetings to be scheduled even with busy attendees
3. **Transparency**: Clear visibility of who is busy and when
4. **Better UX**: Proactive conflict detection reduces scheduling errors
5. **Informed Decisions**: Users can make informed choices about meeting timing

## Example Scenarios

### Scenario 1: All Available
- User adds 3 attendees
- Clicks "Check Availability"
- ✅ Message: "All attendees are available for this time slot!"
- User proceeds to create meeting

### Scenario 2: Some Busy - Check First
- User adds 2 attendees
- Clicks "Check Availability"
- ⚠️ Shows: "Alice is busy with 'Client Call' 10:00-11:00"
- User adjusts time or proceeds anyway

### Scenario 3: Some Busy - Auto-detected
- User doesn't check availability manually
- Clicks "Send" to create meeting
- ⚠️ Warning appears automatically
- User decides to proceed anyway or cancel
