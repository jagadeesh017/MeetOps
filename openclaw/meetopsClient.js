const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_API_URL = "http://localhost:5000";

class MeetOpsClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || process.env.BACKEND_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
    this.timeoutMs = Number(options.timeoutMs || process.env.BACKEND_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

    // Optional fallback mode (single static token). Multi-user mode uses per-user sessions.
    this.staticToken = process.env.BACKEND_AUTH_TOKEN || "";

    // userKey -> { accessToken, refreshToken, email }
    this.userSessions = new Map();
  }

  _assertConfig() {
    if (!this.baseUrl) throw new Error("Missing BACKEND_API_URL.");
  }

  async _request(path, { method = "GET", headers = {}, body, authToken } = {}) {
    this._assertConfig();

    const requestHeaders = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (authToken) {
      requestHeaders.Authorization = `Bearer ${authToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {
        data = { message: text || "Invalid JSON response" };
      }

      if (!response.ok) {
        const err = new Error(data?.message || `Request failed (${response.status})`);
        err.status = response.status;
        err.payload = data;
        throw err;
      }

      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  _getSession(userKey) {
    if (!userKey) return null;
    return this.userSessions.get(String(userKey)) || null;
  }

  _setSession(userKey, session) {
    this.userSessions.set(String(userKey), { ...session });
  }

  async linkAccount(userKey, email, password) {
    if (!userKey) throw new Error("Missing user key.");
    if (!email || !password) throw new Error("Usage: /link your-email your-password");

    console.log("[MeetOpsClient] Linking account for:", email);
    const data = await this._request("/auth/login", {
      method: "POST",
      body: { email, password },
    });

    const accessToken = data?.accessToken || "";
    const refreshToken = data?.refreshToken || "";
    const userEmail = data?.user?.email || email;

    if (!accessToken || !refreshToken) {
      throw new Error("Unable to link account: invalid login response.");
    }

    this._setSession(userKey, {
      accessToken,
      refreshToken,
      email: userEmail,
    });

    console.log("[MeetOpsClient] Account linked successfully:", userEmail);
    return { email: userEmail };
  }

  async unlinkAccount(userKey) {
    const session = this._getSession(userKey);
    if (!session) return { unlinked: false };

    try {
      await this._request("/auth/logout", {
        method: "POST",
        body: { refreshToken: session.refreshToken },
      });
    } catch (_) {
      // Do not block unlink if backend logout fails.
    }

    this.userSessions.delete(String(userKey));
    return { unlinked: true };
  }

  async _refresh(userKey) {
    const session = this._getSession(userKey);
    if (!session?.refreshToken) throw new Error("Session expired. Please link again using /link email password");

    const data = await this._request("/auth/refresh", {
      method: "POST",
      body: { refreshToken: session.refreshToken },
    });

    const nextAccess = data?.accessToken || "";
    if (!nextAccess) throw new Error("Session expired. Please link again using /link email password");

    this._setSession(userKey, {
      ...session,
      accessToken: nextAccess,
    });

    return nextAccess;
  }

  _tokenFor(userKey) {
    if (this.staticToken) return this.staticToken;
    const session = this._getSession(userKey);
    return session?.accessToken || "";
  }

  _ensureAuthenticated(userKey) {
    if (this.staticToken) return;
    if (!this._getSession(userKey)?.accessToken) {
      throw new Error("Please link your account first: /link your-email your-password");
    }
  }

  async chat(prompt, { userKey, sessionId, conversationHistory = [], timezone } = {}) {
    this._ensureAuthenticated(userKey);

    const body = {
      prompt,
      sessionId,
      conversationHistory,
    };
    if (timezone) body.timezone = timezone;

    try {
      return await this._request("/api/ai/chat", {
        method: "POST",
        authToken: this._tokenFor(userKey),
        body,
      });
    } catch (err) {
      if (err?.status === 401 && !this.staticToken) {
        const nextToken = await this._refresh(userKey);
        return this._request("/api/ai/chat", {
          method: "POST",
          authToken: nextToken,
          body,
        });
      }
      throw err;
    }
  }
}

module.exports = { MeetOpsClient };
