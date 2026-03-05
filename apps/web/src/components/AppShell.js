import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
export const AppShell = () => {
    const { me, logout } = useAuth();
    const navigate = useNavigate();
    return (_jsxs("div", { className: "layout", children: [_jsxs("aside", { className: "sidebar", children: [_jsx("h1", { className: "brand", children: "BookLite" }), _jsx("div", { className: "small", style: { marginBottom: 12 }, children: me ? `${me.username} (${me.role})` : "" }), _jsxs("nav", { className: "nav", children: [_jsx(NavLink, { to: "/library", children: "Library" }), _jsx(NavLink, { to: "/collections", children: "Collections" }), _jsx(NavLink, { to: "/uploads", children: "Uploads" }), _jsx(NavLink, { to: "/kobo", children: "Kobo" }), _jsx(NavLink, { to: "/profile", children: "Profile" }), me?.role === "OWNER" && _jsx(NavLink, { to: "/admin-users", children: "Admin Users" })] }), _jsx("div", { style: { marginTop: 16 }, children: _jsx("button", { className: "secondary", onClick: async () => {
                                await logout();
                                navigate("/login");
                            }, children: "Logout" }) })] }), _jsx("main", { className: "content", children: _jsx(Outlet, {}) })] }));
};
