const Meeting = require("../models/meeting");
const { sendMeetingInvites } = require("./invites");

async function saveAndInvite(meetingDocs, invitePayload) {
  if (!Array.isArray(meetingDocs) || meetingDocs.length === 0) return [];

  let created = [];

  if (meetingDocs.length > 1) {
    created = await Meeting.insertMany(meetingDocs);
  } else {
    const single = await Meeting.create(meetingDocs[0]);
    created = [single];
  }

  if (invitePayload && invitePayload.attendees && invitePayload.attendees.length > 0) {
    sendMeetingInvites(invitePayload)
      .catch(() => null);
  }

  return created;
}

module.exports = { saveAndInvite };
