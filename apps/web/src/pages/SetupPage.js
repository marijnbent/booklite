import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
export const SetupPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [statusLoading, setStatusLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        apiFetch("/api/v1/setup/status")
            .then((result) => {
            if (result.completed) {
                navigate("/login");
            }
        })
            .finally(() => setStatusLoading(false));
    }, []);
    if (statusLoading)
        return _jsx("p", { children: "Checking setup\u2026" });
    return (_jsxs("div", { className: "card", style: { maxWidth: 560, margin: "80px auto" }, children: [_jsx("h2", { children: "Initial Owner Setup" }), _jsx("p", { className: "small", children: "Create the first OWNER account." }), _jsxs("div", { className: "stack", children: [_jsx("input", { placeholder: "Email", value: email, onChange: (e) => setEmail(e.target.value) }), _jsx("input", { placeholder: "Username", value: username, onChange: (e) => setUsername(e.target.value) }), _jsx("input", { type: "password", placeholder: "Password", value: password, onChange: (e) => setPassword(e.target.value) }), error && _jsx("p", { style: { color: "#b42318" }, children: error }), _jsx("button", { onClick: async () => {
                            try {
                                await apiFetch("/api/v1/setup", {
                                    method: "POST",
                                    headers: { "content-type": "application/json" },
                                    body: JSON.stringify({ email, username, password })
                                });
                                navigate("/login");
                            }
                            catch (setupError) {
                                setError(String(setupError));
                            }
                        }, children: "Create Owner" })] })] }));
};
