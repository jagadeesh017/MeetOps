import { createContext, useEffect, useState } from "react";
import api from "../services/api";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedToken = localStorage.getItem("token") || sessionStorage.getItem("token");
        setToken(savedToken);

        if (!savedToken) {
          setLoading(false);
          return;
        }

        const res = await api.get("/auth/me");
        setUser(res.data);
      } catch (err) {
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, token, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}
