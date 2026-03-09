module.exports = ({ meetopsClient }) => ({
  name: "cancelMeeting",
  async run({ message, context = {} }) {
    return meetopsClient.chat(message, {
      userKey: context.userKey,
      sessionId: context.sessionId,
      timezone: context.timezone,
    });
  },
});
