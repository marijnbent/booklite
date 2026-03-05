import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, AuthTokens, loadTokens, setTokens } from "./api";

type Role = "OWNER" | "MEMBER";

export interface Me {
  id: number;
  email: string;
  username: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    try {
      const user = await apiFetch<Me>("/api/v1/me");
      setMe(user);
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    loadTokens();
    refreshMe().finally(() => setLoading(false));
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const tokens = await apiFetch<AuthTokens>("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernameOrEmail, password })
    });

    setTokens(tokens);
    await refreshMe();
  };

  const logout = async () => {
    const tokens = loadTokens();
    if (tokens?.refreshToken) {
      await apiFetch<{ ok: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      }).catch(() => undefined);
    }
    setTokens(null);
    setMe(null);
  };

  const value = useMemo(
    () => ({ me, loading, login, logout, refreshMe }),
    [me, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
