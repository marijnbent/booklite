import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
export const LoginPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [usernameOrEmail, setUsernameOrEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    return (_jsxs("div", { className: "card", style: { maxWidth: 480, margin: "80px auto" }, children: [_jsx("h2", { children: "Sign In" }), _jsxs("div", { className: "stack", children: [_jsx("input", { placeholder: "Username or email", value: usernameOrEmail, onChange: (event) => setUsernameOrEmail(event.target.value) }), _jsx("input", { type: "password", placeholder: "Password", value: password, onChange: (event) => setPassword(event.target.value) }), error && _jsx("p", { style: { color: "#b42318" }, children: error }), _jsx("button", { onClick: async () => {
                            setError("");
                            try {
                                await login(usernameOrEmail, password);
                                navigate("/library");
                            }
                            catch {
                                setError("Login failed. Check credentials.");
                            }
                        }, children: "Login" })] })] }));
};
