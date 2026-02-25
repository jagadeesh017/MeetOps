import { createContext, useEffect, useState } from "react";
import axios from "axios";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const savedToken =
          localStorage.getItem("token") ||
          sessionStorage.getItem("token");

        setToken(savedToken);

        if (!savedToken) {
          setLoading(false);
          return;
        }

        const res = await axios.get("http://localhost:5000/auth/me", {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
        setUser(res.data);
      } catch (err) {
        console.error("Auth check failed:", err.message);
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
