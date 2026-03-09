function pickSkill(text, skills) {
  const message = String(text || "").trim().toLowerCase();

  if (/\b(cancel|delete|remove|drop)\b/.test(message)) {
    return skills.cancelMeeting;
  }

  if (/\b(list|show|what|which|upcoming|today|tomorrow|next|meetings?)\b/.test(message)) {
    return skills.listMeetings;
  }

  return skills.scheduleMeeting;
}

function parseLinkCommand(text) {
  const raw = String(text || "").trim();
  if (!raw.toLowerCase().startsWith("/link ")) return null;

  const parts = raw.split(/\s+/);
  if (parts.length < 3) return { error: "Usage: /link your-email your-password" };

  return {
    email: parts[1],
    password: parts.slice(2).join(" "),
  };
}

function createOpenClawAgent({ skills, meetopsClient }) {
  return {
    async handleMessage({ text, context = {} }) {
      const raw = String(text || "").trim();
      const userKey = String(context.userKey || context.chatId || "");

      if (!raw) return "Please send a message.";

      if (raw === "/start" || raw === "/help") {
        return [
          "MeetOps Telegram is ready.",
          "1) Link account: /link your-email your-password",
          "2) Ask naturally: schedule/cancel/list meetings",
          "3) Logout: /logout",
        ].join("\n");
      }

      if (raw.toLowerCase() === "/logout") {
        await meetopsClient.unlinkAccount(userKey);
        return "Your MeetOps account has been unlinked from this Telegram chat.";
      }

      const link = parseLinkCommand(raw);
      if (link) {
        if (link.error) return link.error;
        const result = await meetopsClient.linkAccount(userKey, link.email, link.password);
        return `Account linked: ${result.email}`;
      }

      const skill = pickSkill(raw, skills);
      if (!skill) return "No skill is available to handle this request.";

      try {
        const result = await skill.run({ message: raw, context: { ...context, userKey } });
        if (typeof result === "string") return result;
        return result?.reply || result?.message || "Done.";
      } catch (err) {
        return `Error: ${err?.message || "Failed to process request."}`;
      }
    },
  };
}

module.exports = { createOpenClawAgent, pickSkill };
