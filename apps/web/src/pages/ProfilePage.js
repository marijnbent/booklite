import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from "../lib/auth";
export const ProfilePage = () => {
    const { me } = useAuth();
    if (!me)
        return _jsx("p", { children: "Not authenticated." });
    return (_jsxs("div", { className: "stack", children: [_jsx("h2", { children: "Profile" }), _jsxs("div", { className: "card stack", children: [_jsxs("p", { children: [_jsx("strong", { children: "Username:" }), " ", me.username] }), _jsxs("p", { children: [_jsx("strong", { children: "Email:" }), " ", me.email] }), _jsxs("p", { children: [_jsx("strong", { children: "Role:" }), " ", me.role] }), _jsxs("p", { className: "small", children: ["Created at ", new Date(me.createdAt).toLocaleString()] })] })] }));
};
