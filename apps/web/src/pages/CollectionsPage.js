import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { DndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
const DraggableBook = ({ book }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `book-${book.id}`,
        data: { bookId: book.id }
    });
    return (_jsxs("div", { ref: setNodeRef, style: {
            transform: CSS.Translate.toString(transform),
            opacity: isDragging ? 0.5 : 1,
            border: "1px solid #d4dce7",
            borderRadius: 8,
            padding: 8,
            background: "#fff"
        }, ...listeners, ...attributes, children: [_jsx("strong", { children: book.title }), _jsx("p", { className: "small", children: book.author ?? "Unknown author" }), _jsx("span", { className: "small", children: "Drag onto a collection" })] }));
};
const DropCollection = ({ collection, onDelete }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `collection-${collection.id}`,
        data: { collectionId: collection.id }
    });
    return (_jsxs("div", { ref: setNodeRef, className: `collection-zone ${isOver ? "over" : ""}`, children: [_jsxs("div", { className: "toolbar", children: [_jsxs("strong", { children: [collection.icon ? `${collection.icon} ` : "", collection.name] }), _jsxs("div", { className: "row", children: [_jsxs("span", { className: "badge", children: [collection.book_count, " books"] }), _jsx("button", { className: "danger", onClick: () => void onDelete(collection.id), children: "Delete" })] })] }), _jsx("p", { className: "small", children: "Drop book here" })] }));
};
export const CollectionsPage = () => {
    const [newCollection, setNewCollection] = useState("");
    const [fallbackTarget, setFallbackTarget] = useState({});
    const queryClient = useQueryClient();
    const collections = useQuery({
        queryKey: ["collections"],
        queryFn: () => apiFetch("/api/v1/collections")
    });
    const books = useQuery({
        queryKey: ["books", "collections-source"],
        queryFn: () => apiFetch("/api/v1/books?limit=200")
    });
    const collectionItems = collections.data ?? [];
    const bookItems = books.data ?? [];
    const addBookToCollection = async (collectionId, bookId) => {
        await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, {
            method: "POST"
        });
        await queryClient.invalidateQueries({ queryKey: ["collections"] });
    };
    const onDragEnd = async (event) => {
        const bookId = Number(String(event.active.id).replace("book-", ""));
        const overId = event.over?.id ? String(event.over.id) : "";
        if (!Number.isFinite(bookId) || !overId.startsWith("collection-"))
            return;
        const collectionId = Number(overId.replace("collection-", ""));
        if (!Number.isFinite(collectionId))
            return;
        await addBookToCollection(collectionId, bookId);
    };
    return (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "toolbar", children: [_jsx("h2", { children: "Collections" }), _jsxs("div", { className: "row", children: [_jsx("input", { placeholder: "New collection", value: newCollection, onChange: (event) => setNewCollection(event.target.value) }), _jsx("button", { onClick: async () => {
                                    if (!newCollection.trim())
                                        return;
                                    await apiFetch("/api/v1/collections", {
                                        method: "POST",
                                        headers: { "content-type": "application/json" },
                                        body: JSON.stringify({ name: newCollection.trim(), icon: "📚" })
                                    });
                                    setNewCollection("");
                                    await queryClient.invalidateQueries({ queryKey: ["collections"] });
                                }, children: "Create" })] })] }), _jsx("div", { className: "split", children: _jsxs(DndContext, { onDragEnd: (event) => void onDragEnd(event), children: [_jsxs("div", { className: "stack card", children: [_jsx("h3", { children: "Your Collections" }), collectionItems.map((collection) => (_jsx(DropCollection, { collection: collection, onDelete: async (id) => {
                                        await apiFetch(`/api/v1/collections/${id}`, { method: "DELETE" });
                                        await queryClient.invalidateQueries({ queryKey: ["collections"] });
                                    } }, collection.id))), collectionItems.length === 0 && _jsx("p", { className: "small", children: "No collections yet." })] }), _jsxs("div", { className: "stack card", children: [_jsx("h3", { children: "Books" }), bookItems.map((book) => (_jsxs("div", { className: "stack", style: { gap: 8 }, children: [_jsx(DraggableBook, { book: book }), _jsxs("div", { className: "row", children: [_jsxs("select", { value: fallbackTarget[book.id] ?? "", onChange: (event) => {
                                                        setFallbackTarget((prev) => ({
                                                            ...prev,
                                                            [book.id]: Number(event.target.value)
                                                        }));
                                                    }, children: [_jsx("option", { value: "", children: "Keyboard fallback: select collection" }), collectionItems.map((collection) => (_jsx("option", { value: collection.id, children: collection.name }, collection.id)))] }), _jsx("button", { className: "secondary", onClick: async () => {
                                                        const target = fallbackTarget[book.id];
                                                        if (!target)
                                                            return;
                                                        await addBookToCollection(target, book.id);
                                                    }, children: "Add" })] })] }, book.id)))] })] }) })] }));
};
