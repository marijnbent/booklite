import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
export const KoboPage = () => {
    const queryClient = useQueryClient();
    const settings = useQuery({
        queryKey: ["kobo-settings"],
        queryFn: () => apiFetch("/api/v1/kobo/settings")
    });
    const updateMutation = useMutation({
        mutationFn: (payload) => apiFetch("/api/v1/kobo/settings", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kobo-settings"] })
    });
    const regenerateMutation = useMutation({
        mutationFn: () => apiFetch("/api/v1/kobo/settings/token", {
            method: "PUT"
        }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kobo-settings"] })
    });
    if (settings.isLoading)
        return _jsx("p", { children: "Loading Kobo settings\u2026" });
    const model = settings.data;
    if (!model)
        return _jsx("p", { children: "Could not load Kobo settings." });
    return (_jsxs("div", { className: "stack", children: [_jsx("h2", { children: "Kobo" }), _jsxs("div", { className: "card stack", children: [_jsxs("label", { className: "row", children: [_jsx("input", { type: "checkbox", checked: model.syncEnabled, onChange: (event) => updateMutation.mutate({ ...model, syncEnabled: event.target.checked }) }), "Enable sync"] }), _jsxs("label", { className: "row", children: [_jsx("input", { type: "checkbox", checked: model.twoWayProgressSync, onChange: (event) => updateMutation.mutate({
                                    ...model,
                                    twoWayProgressSync: event.target.checked
                                }) }), "Two-way progress sync"] }), _jsxs("div", { className: "row", children: [_jsxs("label", { children: ["Mark reading at %", _jsx("input", { type: "number", value: model.markReadingThreshold, onChange: (event) => updateMutation.mutate({
                                            ...model,
                                            markReadingThreshold: Number(event.target.value)
                                        }) })] }), _jsxs("label", { children: ["Mark finished at %", _jsx("input", { type: "number", value: model.markFinishedThreshold, onChange: (event) => updateMutation.mutate({
                                            ...model,
                                            markFinishedThreshold: Number(event.target.value)
                                        }) })] })] }), _jsxs("div", { className: "stack", children: [_jsx("label", { children: "Kobo token" }), _jsx("textarea", { value: model.token, readOnly: true, rows: 3 }), _jsxs("div", { className: "row", children: [_jsx("button", { className: "secondary", onClick: () => navigator.clipboard.writeText(model.token), children: "Copy token" }), _jsx("button", { onClick: () => regenerateMutation.mutate(), disabled: regenerateMutation.isPending, children: "Regenerate token" })] })] })] })] }));
};
