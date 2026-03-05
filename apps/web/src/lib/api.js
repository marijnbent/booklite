const BASE = "";
let accessToken = null;
let refreshToken = null;
export const setTokens = (tokens) => {
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
export const loadTokens = () => {
    const raw = localStorage.getItem("booklite_tokens");
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        accessToken = parsed.accessToken;
        refreshToken = parsed.refreshToken;
        return parsed;
    }
    catch {
        return null;
    }
};
const doRefresh = async () => {
    if (!refreshToken)
        return false;
    const response = await fetch(`${BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken })
    });
    if (!response.ok) {
        setTokens(null);
        return false;
    }
    const tokens = (await response.json());
    setTokens(tokens);
    return true;
};
export const apiFetch = async (input, init, retries = 1) => {
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
            return apiFetch(input, init, retries - 1);
        }
    }
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }
    if (response.status === 204) {
        return undefined;
    }
    return (await response.json());
};
