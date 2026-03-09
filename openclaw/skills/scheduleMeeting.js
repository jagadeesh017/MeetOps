module.exports = ({ meetopsClient }) => ({
  name: "scheduleMeeting",
  async run({ message, context = {} }) {
    return meetopsClient.chat(message, {
      userKey: context.userKey,
      sessionId: context.sessionId,
      timezone: context.timezone,
    });
  },
});
