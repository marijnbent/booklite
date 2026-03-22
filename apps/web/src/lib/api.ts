export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface StoredImpersonationState {
  adminTokens: AuthTokens;
  adminUsername: string;
  targetUserId: number;
  targetUsername: string;
  startedAt: string;
  restorePath: string;
}

const BASE = "";
const TOKENS_KEY = "booklite_tokens";
const IMPERSONATION_KEY = "booklite_impersonation";

let currentTokens: AuthTokens | null = null;
let tokenVersion = 0;
let refreshRequest: Promise<boolean> | null = null;

export const getAccessToken = (): string | null => currentTokens?.accessToken ?? null;

export const getTokens = (): AuthTokens | null =>
  currentTokens
    ? {
        accessToken: currentTokens.accessToken,
        refreshToken: currentTokens.refreshToken,
        expiresInSeconds: currentTokens.expiresInSeconds,
      }
    : null;

export const setTokens = (tokens: AuthTokens | null): void => {
  tokenVersion += 1;
  currentTokens = tokens;

  if (!tokens) {
    localStorage.removeItem(TOKENS_KEY);
    return;
  }

  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
};

export const loadTokens = (): AuthTokens | null => {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) {
    currentTokens = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    currentTokens = parsed;
    return parsed;
  } catch {
    currentTokens = null;
    return null;
  }
};

export const setImpersonationState = (state: StoredImpersonationState | null): void => {
  if (!state) {
    localStorage.removeItem(IMPERSONATION_KEY);
    return;
  }

  localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
};

export const loadImpersonationState = (): StoredImpersonationState | null => {
  const raw = localStorage.getItem(IMPERSONATION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredImpersonationState;
  } catch {
    return null;
  }
};

const doRefresh = async (): Promise<boolean> => {
  if (!currentTokens?.refreshToken) return false;
  if (refreshRequest) return refreshRequest;

  const refreshTokenSnapshot = currentTokens.refreshToken;
  const versionSnapshot = tokenVersion;

  refreshRequest = (async () => {
    const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenSnapshot })
    });

    if (!response.ok) {
      if (currentTokens?.refreshToken === refreshTokenSnapshot && tokenVersion === versionSnapshot) {
        setTokens(null);
      }
      return false;
    }

    const tokens = (await response.json()) as AuthTokens;
    if (currentTokens?.refreshToken === refreshTokenSnapshot && tokenVersion === versionSnapshot) {
      setTokens(tokens);
    }
    return true;
  })();

  try {
    return await refreshRequest;
  } finally {
    refreshRequest = null;
  }
};

export const apiFetch = async <T>(
  input: string,
  init?: RequestInit,
  retries = 1
): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  if (currentTokens?.accessToken) {
    headers.set("authorization", `Bearer ${currentTokens.accessToken}`);
  }

  const response = await fetch(`${BASE}${input}`, {
    ...init,
    headers
  });

  if (response.status === 401 && retries > 0) {
    const refreshed = await doRefresh();
    if (refreshed) {
      return apiFetch<T>(input, init, retries - 1);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const apiFetchRaw = async (
  input: string,
  init?: RequestInit,
  retries = 1
): Promise<Response> => {
  const headers = new Headers(init?.headers ?? {});
  if (currentTokens?.accessToken) {
    headers.set("authorization", `Bearer ${currentTokens.accessToken}`);
  }

  const response = await fetch(`${BASE}${input}`, {
    ...init,
    headers
  });

  if (response.status === 401 && retries > 0) {
    const refreshed = await doRefresh();
    if (refreshed) {
      return apiFetchRaw(input, init, retries - 1);
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  return response;
};
