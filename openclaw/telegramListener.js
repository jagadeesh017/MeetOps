const fetch = require('node-fetch');

class TelegramListener {
  constructor({ botToken, agent, pollTimeoutSec = 30 }) {
    this.botToken = botToken;
    this.agent = agent;
    this.pollTimeoutSec = pollTimeoutSec;
    this.offset = 0;
    this.running = false;
  }

  get apiBase() {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  async _api(method, body) {
    const response = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const reason = data?.description || `Telegram API error (${response.status})`;
      throw new Error(reason);
    }

    return data.result;
  }

  async sendMessage(chatId, text) {
    await this._api("sendMessage", {
      chat_id: chatId,
      text: String(text || ""),
    });
  }

  async handleUpdate(update) {
    const msg = update?.message;
    const text = msg?.text;
    const chatId = msg?.chat?.id;
    const telegramUserId = msg?.from?.id;

    if (!chatId || !text || !telegramUserId) return;

    try {
      const reply = await this.agent.handleMessage({
        text,
        context: {
          chatId,
          userKey: `telegram-user:${telegramUserId}`,
          sessionId: `telegram-chat:${chatId}`,
        },
      });

      await this.sendMessage(chatId, reply);
    } catch (err) {
      await this.sendMessage(chatId, `Error: ${err?.message || "Failed to process request."}`);
    }
  }

  async pollOnce() {
    const updates = await this._api("getUpdates", {
      timeout: this.pollTimeoutSec,
      offset: this.offset,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      this.offset = update.update_id + 1;
      await this.handleUpdate(update);
    }
  }

  async start() {
    this.running = true;

    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        console.error("[OpenClaw] Telegram polling error:", err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  stop() {
    this.running = false;
  }
}

module.exports = { TelegramListener };
