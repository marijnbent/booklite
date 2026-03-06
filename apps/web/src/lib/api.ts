export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

const BASE = "";

let accessToken: string | null = null;
let refreshToken: string | null = null;

export const setTokens = (tokens: AuthTokens | null): void => {
  if (!tokens) {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem("booklite_tokens");
    return;
  }

  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem("booklite_tokens", JSON.stringify(tokens));
};

export const loadTokens = (): AuthTokens | null => {
  const raw = localStorage.getItem("booklite_tokens");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthTokens;
    accessToken = parsed.accessToken;
    refreshToken = parsed.refreshToken;
    return parsed;
  } catch {
    return null;
  }
};

const doRefresh = async (): Promise<boolean> => {
  if (!refreshToken) return false;

  const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    setTokens(null);
    return false;
  }

  const tokens = (await response.json()) as AuthTokens;
  setTokens(tokens);
  return true;
};

export const apiFetch = async <T>(
  input: string,
  init?: RequestInit,
  retries = 1
): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
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
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
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
