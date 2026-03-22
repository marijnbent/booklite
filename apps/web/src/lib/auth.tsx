import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiFetch,
  AuthTokens,
  getTokens,
  loadImpersonationState,
  loadTokens,
  setImpersonationState,
  setTokens,
  type StoredImpersonationState,
} from "./api";

type Role = "OWNER" | "MEMBER";

export interface Me {
  id: number;
  email: string | null;
  username: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
}

interface AuthContextValue {
  me: Me | null;
  loading: boolean;
  isImpersonating: boolean;
  impersonation: {
    adminUsername: string;
    targetUserId: number;
    targetUsername: string;
    startedAt: string;
    restorePath: string;
  } | null;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  beginImpersonation: (userId: number) => Promise<void>;
  endImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [impersonation, setImpersonation] = useState<AuthContextValue["impersonation"]>(null);

  const toPublicImpersonation = (
    state: StoredImpersonationState | null
  ): AuthContextValue["impersonation"] =>
    state
      ? {
          adminUsername: state.adminUsername,
          targetUserId: state.targetUserId,
          targetUsername: state.targetUsername,
          startedAt: state.startedAt,
          restorePath: state.restorePath,
        }
      : null;

  const revokeRefreshToken = async (token: string): Promise<void> => {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    });
  };

  const refreshMe = async () => {
    try {
      const user = await apiFetch<Me>("/api/v1/me");
      setMe(user);
      return user;
    } catch {
      setMe(null);
      return null;
    }
  };

  useEffect(() => {
    loadTokens();
    setImpersonation(toPublicImpersonation(loadImpersonationState()));
    refreshMe().finally(() => setLoading(false));
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const tokens = await apiFetch<AuthTokens>("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ usernameOrEmail, password })
    });

    setImpersonationState(null);
    setImpersonation(null);
    setTokens(tokens);
    queryClient.clear();
    await refreshMe();
  };

  const logout = async () => {
    const tokens = getTokens() ?? loadTokens();
    if (tokens?.refreshToken) {
      await revokeRefreshToken(tokens.refreshToken).catch(() => undefined);
    }
    setTokens(null);
    setImpersonationState(null);
    setImpersonation(null);
    setMe(null);
    queryClient.clear();
  };

  const beginImpersonation = async (userId: number) => {
    const adminTokens = getTokens() ?? loadTokens();
    if (!adminTokens || !me) {
      throw new Error("Admin session is not available");
    }

    const response = await apiFetch<{
      tokens: AuthTokens;
      impersonatedUser: Pick<Me, "id" | "email" | "username" | "role">;
    }>(`/api/v1/admin/users/${userId}/impersonate`, {
      method: "POST",
    });

    const nextState: StoredImpersonationState = {
      adminTokens,
      adminUsername: me.username,
      targetUserId: response.impersonatedUser.id,
      targetUsername: response.impersonatedUser.username,
      startedAt: new Date().toISOString(),
      restorePath: "/admin-users",
    };

    setImpersonationState(nextState);
    setImpersonation(toPublicImpersonation(nextState));
    setTokens(response.tokens);
    queryClient.clear();
    await refreshMe();
  };

  const endImpersonation = async () => {
    const state = loadImpersonationState();
    if (!state) return;

    const activeTokens = getTokens() ?? loadTokens();
    if (activeTokens?.refreshToken) {
      await revokeRefreshToken(activeTokens.refreshToken).catch(() => undefined);
    }

    setTokens(state.adminTokens);
    setImpersonationState(null);
    setImpersonation(null);
    queryClient.clear();
    await refreshMe();
  };

  const value = useMemo(
    () => ({
      me,
      loading,
      isImpersonating: impersonation !== null,
      impersonation,
      login,
      logout,
      refreshMe,
      beginImpersonation,
      endImpersonation,
    }),
    [me, loading, impersonation]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
};
