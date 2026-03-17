import axios from "axios";

const BASE = "http://localhost:5000";

const api = axios.create({ baseURL: BASE });

// ─── Request: attach access token from storage ───────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response: 401 → auto-refresh → retry once ───────────────────────────────
let isRefreshing = false;
let failedQueue = [];   // requests waiting while a refresh is in-flight

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Only handle 401, only retry once, skip the refresh endpoint itself
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Queue concurrent requests while refresh is in-flight
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken =
      localStorage.getItem("refreshToken") ||
      sessionStorage.getItem("refreshToken");

    if (!refreshToken) {
      isRefreshing = false;
      processQueue(error, null);
      clearSessionAndRedirect();
      return Promise.reject(error);
    }

    try {
      // Use plain axios (not `api`) to avoid interceptor recursion
      const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
      const newToken = data.accessToken;

      // Update stored access token (preserve whichever storage was used)
      if (localStorage.getItem("token")) localStorage.setItem("token", newToken);
      else sessionStorage.setItem("token", newToken);

      // Notify React context of new token (decoupled via custom event)
      window.dispatchEvent(new CustomEvent("tokenRefreshed", { detail: { token: newToken } }));

      api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
      original.headers.Authorization = `Bearer ${newToken}`;

      processQueue(null, newToken);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      clearSessionAndRedirect();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

function clearSessionAndRedirect() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  sessionStorage.clear();
  window.location.href = "/";
}

// ─── Convenience wrappers (kept for backward compat) ─────────────────────────
export const getMeetings = (userEmail) =>
  api.get(`/meetings?userEmail=${userEmail}`).then((r) => r.data);

export const createMeeting = (data) =>
  api.post("/meetings", data).then((r) => r.data);

export const updateMeeting = (id, data) =>
  api.put(`/meetings/${id}`, data).then((r) => r.data);

export const deleteMeeting = (id) =>
  api.delete(`/meetings/${id}`).then((r) => r.data);

export const checkAttendeeAvailability = (attendees, startTime, endTime, excludeMeetingId = null) =>
  api.post("/meetings/check-availability", { attendees, startTime, endTime, excludeMeetingId }).then((r) => r.data);

// Returns array of hours (0-23) where NO meeting exists in the DB for the given date
export const getGlobalFreeHours = (date) =>
  api.get(`/meetings/free-hours?date=${date}`).then((r) => r.data.freeHours);

export const disconnectIntegration = (platform) =>
  api.post("/integrations/disconnect", { platform }).then((r) => r.data);

export default api;
