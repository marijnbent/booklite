import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";

interface BookItem {
  id: number;
  title: string;
  author: string | null;
  series: string | null;
  description: string | null;
  fileExt: string;
  koboSyncable: number;
  progress: {
    status: "UNREAD" | "READING" | "DONE";
    progressPercent: number;
  } | null;
}

export const LibraryPage: React.FC = () => {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const queryClient = useQueryClient();

  const books = useQuery({
    queryKey: ["books", q],
    queryFn: () => apiFetch<BookItem[]>(`/api/v1/books${q ? `?q=${encodeURIComponent(q)}` : ""}`)
  });

  const items = useMemo(() => books.data ?? [], [books.data]);

  return (
    <div className="stack">
      <div className="toolbar">
        <h2>Library</h2>
        <div className="row">
          <input
            placeholder="Search books"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <button className="secondary" onClick={() => setView(view === "grid" ? "list" : "grid")}> 
            {view === "grid" ? "List view" : "Grid view"}
          </button>
        </div>
      </div>

      {books.isLoading && <p>Loading books…</p>}

      {!books.isLoading && items.length === 0 && <p>No books yet.</p>}

      {view === "grid" ? (
        <div className="grid-books">
          {items.map((book) => (
            <div className="book-card" key={book.id}>
              <strong>{book.title}</strong>
              <p className="small">{book.author ?? "Unknown author"}</p>
              <p className="small">{book.fileExt.toUpperCase()}</p>
              {book.koboSyncable === 1 ? <span className="badge">Kobo sync</span> : <span className="badge">Local only</span>}
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="secondary"
                  onClick={async () => {
                    await apiFetch(`/api/v1/books/${book.id}/metadata/fetch`, { method: "POST" });
                    await queryClient.invalidateQueries({ queryKey: ["books"] });
                  }}
                >
                  Refresh metadata
                </button>
                <select
                  value={book.progress?.status ?? "UNREAD"}
                  onChange={async (event) => {
                    await apiFetch(`/api/v1/books/${book.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ status: event.target.value })
                    });
                    await queryClient.invalidateQueries({ queryKey: ["books"] });
                  }}
                >
                  <option value="UNREAD">Unread</option>
                  <option value="READING">Reading</option>
                  <option value="DONE">Done</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="stack">
          {items.map((book) => (
            <div className="card" key={book.id}>
              <div className="toolbar">
                <div>
                  <strong>{book.title}</strong>
                  <p className="small">{book.author ?? "Unknown author"}</p>
                </div>
                <div className="row">
                  <span className="badge">{book.fileExt.toUpperCase()}</span>
                  <span className="badge">{book.progress?.status ?? "UNREAD"}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
