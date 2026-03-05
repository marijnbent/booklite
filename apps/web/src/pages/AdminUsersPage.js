import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
export const AdminUsersPage = () => {
    const queryClient = useQueryClient();
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("MEMBER");
    const users = useQuery({
        queryKey: ["users"],
        queryFn: () => apiFetch("/api/v1/users")
    });
    const settings = useQuery({
        queryKey: ["app-settings"],
        queryFn: () => apiFetch("/api/v1/app-settings")
    });
    const createUser = useMutation({
        mutationFn: () => apiFetch("/api/v1/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, username, password, role })
        }),
        onSuccess: () => {
            setEmail("");
            setUsername("");
            setPassword("");
            queryClient.invalidateQueries({ queryKey: ["users"] });
        }
    });
    const patchUser = useMutation({
        mutationFn: ({ id, payload }) => apiFetch(`/api/v1/users/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
    });
    const patchSettings = useMutation({
        mutationFn: (payload) => apiFetch("/api/v1/app-settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-settings"] })
    });
    return (_jsxs("div", { className: "stack", children: [_jsx("h2", { children: "Admin Users" }), _jsxs("div", { className: "card stack", children: [_jsx("h3", { children: "Create user" }), _jsxs("div", { className: "row", children: [_jsx("input", { placeholder: "Email", value: email, onChange: (e) => setEmail(e.target.value) }), _jsx("input", { placeholder: "Username", value: username, onChange: (e) => setUsername(e.target.value) }), _jsx("input", { type: "password", placeholder: "Password", value: password, onChange: (e) => setPassword(e.target.value) }), _jsxs("select", { value: role, onChange: (e) => setRole(e.target.value), children: [_jsx("option", { value: "MEMBER", children: "MEMBER" }), _jsx("option", { value: "OWNER", children: "OWNER" })] }), _jsx("button", { onClick: () => createUser.mutate(), disabled: createUser.isPending, children: "Create" })] })] }), _jsxs("div", { className: "card stack", children: [_jsx("h3", { children: "Users" }), (users.data ?? []).map((user) => (_jsxs("div", { className: "toolbar", children: [_jsxs("div", { children: [_jsx("strong", { children: user.username }), " ", _jsxs("span", { className: "small", children: ["(", user.email, ")"] }), _jsx("div", { className: "small", children: user.disabledAt ? "Disabled" : "Active" })] }), _jsxs("div", { className: "row", children: [_jsxs("select", { value: user.role, onChange: (event) => patchUser.mutate({
                                            id: user.id,
                                            payload: { role: event.target.value }
                                        }), children: [_jsx("option", { value: "OWNER", children: "OWNER" }), _jsx("option", { value: "MEMBER", children: "MEMBER" })] }), _jsx("button", { className: "secondary", onClick: () => patchUser.mutate({
                                            id: user.id,
                                            payload: { disabled: !user.disabledAt }
                                        }), children: user.disabledAt ? "Enable" : "Disable" })] })] }, user.id)))] }), _jsxs("div", { className: "card stack", children: [_jsx("h3", { children: "System Settings" }), settings.data && (_jsxs("div", { className: "stack", children: [_jsxs("label", { children: ["Metadata fallback", _jsxs("select", { value: settings.data.metadataProviderFallback, onChange: (event) => patchSettings.mutate({
                                            metadataProviderFallback: event.target.value
                                        }), children: [_jsx("option", { value: "google", children: "Google fallback on Open Library miss" }), _jsx("option", { value: "none", children: "Open Library only" })] })] }), _jsxs("label", { className: "row", children: [_jsx("input", { type: "checkbox", checked: settings.data.kepubConversionEnabled, onChange: (event) => patchSettings.mutate({ kepubConversionEnabled: event.target.checked }) }), "Enable kepub conversion (flag only in v1)"] }), _jsxs("label", { children: ["Upload limit (MB)", _jsx("input", { type: "number", value: settings.data.uploadLimitMb, onChange: (event) => patchSettings.mutate({ uploadLimitMb: Number(event.target.value) }) })] })] }))] })] }));
};
