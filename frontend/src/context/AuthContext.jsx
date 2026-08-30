import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = auth

  const refresh = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(false);
      return false;
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data?.token) {
      localStorage.setItem("access_token", data.token);
    }
    const freshUser = await refresh();
    return freshUser || data;
  };
  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    if (data?.token) {
      localStorage.setItem("access_token", data.token);
    }
    const freshUser = await refresh();
    return freshUser || data;
  };
  const googleSession = async (sessionId) => {
    await api.post("/auth/session", {}, { headers: { "X-Session-ID": sessionId } });
    return refresh();
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem("access_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, googleSession, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
