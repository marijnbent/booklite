import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, loadTokens, setTokens } from "./api";
const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const refreshMe = async () => {
        try {
            const user = await apiFetch("/api/v1/me");
            setMe(user);
        }
        catch {
            setMe(null);
        }
    };
    useEffect(() => {
        loadTokens();
        refreshMe().finally(() => setLoading(false));
    }, []);
    const login = async (usernameOrEmail, password) => {
        const tokens = await apiFetch("/api/v1/auth/login", {
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
            await apiFetch("/api/v1/auth/logout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ refreshToken: tokens.refreshToken })
            }).catch(() => undefined);
        }
        setTokens(null);
        setMe(null);
    };
    const value = useMemo(() => ({ me, loading, login, logout, refreshMe }), [me, loading]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
};
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context)
        throw new Error("useAuth must be used inside AuthProvider");
    return context;
};
