import { jsx as _jsx } from "react/jsx-runtime";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
export const ProtectedRoute = ({ ownerOnly = false }) => {
    const { me, loading } = useAuth();
    if (loading)
        return _jsx("p", { children: "Loading\u2026" });
    if (!me)
        return _jsx(Navigate, { to: "/login", replace: true });
    if (ownerOnly && me.role !== "OWNER")
        return _jsx(Navigate, { to: "/library", replace: true });
    return _jsx(Outlet, {});
};
