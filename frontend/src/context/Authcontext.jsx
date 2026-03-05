import { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import api from "../services/api";

export const AuthContext = createContext();

const BASE = "http://localhost:5000";

export default function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);

  // ─── Try to get a new access token using the stored refresh token ────────
  const silentRefresh = useCallback(async () => {
    const refreshToken =
      localStorage.getItem("refreshToken") ||
      sessionStorage.getItem("refreshToken");

    if (!refreshToken) return null;

    try {
      const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
      const newToken = data.accessToken;

      // Persist to whichever storage originally held the token
      if (localStorage.getItem("token") !== null) {
        localStorage.setItem("token", newToken);
      } else {
        sessionStorage.setItem("token", newToken);
      }

      setToken(newToken);
      return newToken;
    } catch {
      return null;
    }
  }, []);

  // ─── On mount: hydrate auth state ────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedToken =
          sessionStorage.getItem("token") || localStorage.getItem("token");

        if (savedToken) {
          setToken(savedToken);
          const res = await api.get("/auth/me");
          setUser(res.data);
        } else {
          // No access token — try silent refresh
          const newToken = await silentRefresh();
          if (newToken) {
            const res = await api.get("/auth/me");
            setUser(res.data);
          }
        }
      } catch {
        // /auth/me failed (expired token) → the interceptor already tried
        // refresh and failed → clear everything
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        sessionStorage.clear();
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [silentRefresh]);

  // ─── Keep context token in sync when interceptor refreshes it ───────────
  useEffect(() => {
    const handler = (e) => setToken(e.detail.token);
    window.addEventListener("tokenRefreshed", handler);
    return () => window.removeEventListener("tokenRefreshed", handler);
  }, []);

  // ─── Logout: revoke refresh token on server + clear storage ─────────────
  const logout = useCallback(async () => {
    const refreshToken =
      localStorage.getItem("refreshToken") ||
      sessionStorage.getItem("refreshToken");

    if (refreshToken) {
      try { await api.post("/auth/logout", { refreshToken }); } catch (_) {}
    }

    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    sessionStorage.clear();
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, token, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
