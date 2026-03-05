import React, { useMemo, useState } from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
  book_count: number;
}

interface BookItem {
  id: number;
  title: string;
  author: string | null;
}

const DraggableBook: React.FC<{ book: BookItem }> = ({ book }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `book-${book.id}`,
    data: { bookId: book.id }
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        border: "1px solid #d4dce7",
        borderRadius: 8,
        padding: 8,
        background: "#fff"
      }}
      {...listeners}
      {...attributes}
    >
      <strong>{book.title}</strong>
      <p className="small">{book.author ?? "Unknown author"}</p>
      <span className="small">Drag onto a collection</span>
    </div>
  );
};

const DropCollection: React.FC<{
  collection: CollectionItem;
  onDelete: (id: number) => Promise<void>;
}> = ({ collection, onDelete }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `collection-${collection.id}`,
    data: { collectionId: collection.id }
  });

  return (
    <div ref={setNodeRef} className={`collection-zone ${isOver ? "over" : ""}`}>
      <div className="toolbar">
        <strong>
          {collection.icon ? `${collection.icon} ` : ""}
          {collection.name}
        </strong>
        <div className="row">
          <span className="badge">{collection.book_count} books</span>
          <button className="danger" onClick={() => void onDelete(collection.id)}>
            Delete
          </button>
        </div>
      </div>
      <p className="small">Drop book here</p>
    </div>
  );
};

export const CollectionsPage: React.FC = () => {
  const [newCollection, setNewCollection] = useState("");
  const [fallbackTarget, setFallbackTarget] = useState<Record<number, number>>({});
  const queryClient = useQueryClient();

  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections")
  });

  const books = useQuery({
    queryKey: ["books", "collections-source"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/books?limit=200")
  });

  const collectionItems = collections.data ?? [];
  const bookItems = books.data ?? [];

  const addBookToCollection = async (collectionId: number, bookId: number) => {
    await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, {
      method: "POST"
    });
    await queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const bookId = Number(String(event.active.id).replace("book-", ""));
    const overId = event.over?.id ? String(event.over.id) : "";

    if (!Number.isFinite(bookId) || !overId.startsWith("collection-")) return;

    const collectionId = Number(overId.replace("collection-", ""));
    if (!Number.isFinite(collectionId)) return;

    await addBookToCollection(collectionId, bookId);
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Collections</h2>
        <div className="row">
          <input
            placeholder="New collection"
            value={newCollection}
            onChange={(event) => setNewCollection(event.target.value)}
          />
          <button
            onClick={async () => {
              if (!newCollection.trim()) return;
              await apiFetch("/api/v1/collections", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: newCollection.trim(), icon: "📚" })
              });
              setNewCollection("");
              await queryClient.invalidateQueries({ queryKey: ["collections"] });
            }}
          >
            Create
          </button>
        </div>
      </div>

      <div className="split">
        <DndContext onDragEnd={(event) => void onDragEnd(event)}>
          <div className="stack card">
            <h3>Your Collections</h3>
            {collectionItems.map((collection) => (
              <DropCollection
                key={collection.id}
                collection={collection}
                onDelete={async (id) => {
                  await apiFetch(`/api/v1/collections/${id}`, { method: "DELETE" });
                  await queryClient.invalidateQueries({ queryKey: ["collections"] });
                }}
              />
            ))}
            {collectionItems.length === 0 && <p className="small">No collections yet.</p>}
          </div>

          <div className="stack card">
            <h3>Books</h3>
            {bookItems.map((book) => (
              <div key={book.id} className="stack" style={{ gap: 8 }}>
                <DraggableBook book={book} />
                <div className="row">
                  <select
                    value={fallbackTarget[book.id] ?? ""}
                    onChange={(event) => {
                      setFallbackTarget((prev) => ({
                        ...prev,
                        [book.id]: Number(event.target.value)
                      }));
                    }}
                  >
                    <option value="">Keyboard fallback: select collection</option>
                    {collectionItems.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    onClick={async () => {
                      const target = fallbackTarget[book.id];
                      if (!target) return;
                      await addBookToCollection(target, book.id);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
};
