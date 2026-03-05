import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
export const LibraryPage = () => {
    const [q, setQ] = useState("");
    const [view, setView] = useState("grid");
    const queryClient = useQueryClient();
    const books = useQuery({
        queryKey: ["books", q],
        queryFn: () => apiFetch(`/api/v1/books${q ? `?q=${encodeURIComponent(q)}` : ""}`)
    });
    const items = useMemo(() => books.data ?? [], [books.data]);
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "Library" }), _jsxs("div", { className: "row", children: [_jsx("input", { placeholder: "Search books", value: q, onChange: (event) => setQ(event.target.value) }), _jsx("button", { className: "secondary", onClick: () => setView(view === "grid" ? "list" : "grid"), children: view === "grid" ? "List view" : "Grid view" })] })] }), books.isLoading && _jsx("p", { children: "Loading books\u2026" }), !books.isLoading && items.length === 0 && _jsx("p", { children: "No books yet." }), view === "grid" ? (_jsx("div", { className: "grid-books", children: items.map((book) => (_jsxs("div", { className: "book-card", children: [_jsx("strong", { children: book.title }), _jsx("p", { className: "small", children: book.author ?? "Unknown author" }), _jsx("p", { className: "small", children: book.fileExt.toUpperCase() }), book.koboSyncable === 1 ? _jsx("span", { className: "badge", children: "Kobo sync" }) : _jsx("span", { className: "badge", children: "Local only" }), _jsxs("div", { className: "row", style: { marginTop: 10 }, children: [_jsx("button", { className: "secondary", onClick: async () => {
                                        await apiFetch(`/api/v1/books/${book.id}/metadata/fetch`, { method: "POST" });
                                        await queryClient.invalidateQueries({ queryKey: ["books"] });
                                    }, children: "Refresh metadata" }), _jsxs("select", { value: book.progress?.status ?? "UNREAD", onChange: async (event) => {
                                        await apiFetch(`/api/v1/books/${book.id}`, {
                                            method: "PATCH",
                                            headers: { "content-type": "application/json" },
                                            body: JSON.stringify({ status: event.target.value })
                                        });
                                        await queryClient.invalidateQueries({ queryKey: ["books"] });
                                    }, children: [_jsx("option", { value: "UNREAD", children: "Unread" }), _jsx("option", { value: "READING", children: "Reading" }), _jsx("option", { value: "DONE", children: "Done" })] })] })] }, book.id))) })) : (_jsx("div", { className: "stack", children: items.map((book) => (_jsx("div", { className: "card", children: _jsxs("div", { className: "toolbar", children: [_jsxs("div", { children: [_jsx("strong", { children: book.title }), _jsx("p", { className: "small", children: book.author ?? "Unknown author" })] }), _jsxs("div", { className: "row", children: [_jsx("span", { className: "badge", children: book.fileExt.toUpperCase() }), _jsx("span", { className: "badge", children: book.progress?.status ?? "UNREAD" })] })] }) }, book.id))) }))] }));
};
