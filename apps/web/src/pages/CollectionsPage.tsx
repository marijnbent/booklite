import React, { useState } from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Plus,
  GripVertical,
  Trash2,
  BookOpen,
  FolderPlus,
} from "lucide-react";

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
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3 transition-all duration-200 cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 shadow-lg rotate-1 scale-[1.02]",
        !isDragging && "hover:border-primary/30 hover:shadow-sm"
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="size-4 text-muted-foreground/40 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{book.title}</p>
        <p className="text-xs text-muted-foreground truncate">{book.author ?? "Unknown author"}</p>
      </div>
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
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border-2 border-dashed p-4 transition-all duration-200",
        isOver
          ? "border-primary bg-primary/[0.04] shadow-inner"
          : "border-border/50 bg-muted/20 hover:border-border"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-colors duration-200",
            isOver ? "bg-primary/15" : "bg-secondary"
          )}>
            {collection.icon ? (
              <span className="text-base">{collection.icon}</span>
            ) : (
              <FolderOpen className="size-4 text-muted-foreground" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold">{collection.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {collection.book_count} {collection.book_count === 1 ? "book" : "books"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {collection.book_count}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={() => void onDelete(collection.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className={cn(
        "mt-2 text-xs transition-colors duration-200",
        isOver ? "text-primary" : "text-muted-foreground/50"
      )}>
        {isOver ? "Release to add book" : "Drop a book here"}
      </p>
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

  const handleCreateCollection = async () => {
    if (!newCollection.trim()) return;
    await apiFetch("/api/v1/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newCollection.trim(), icon: null })
    });
    setNewCollection("");
    await queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your books into collections
          </p>
        </div>

        {/* Create collection inline */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="New collection name"
            value={newCollection}
            onChange={(e) => setNewCollection(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleCreateCollection(); }}
            className="w-48"
          />
          <Button
            onClick={() => void handleCreateCollection()}
            disabled={!newCollection.trim()}
            size="sm"
          >
            <Plus className="size-4" />
            Create
          </Button>
        </div>
      </div>

      {/* Split layout */}
      <DndContext onDragEnd={(event) => void onDragEnd(event)}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Collections panel */}
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                  <FolderOpen className="size-3.5 text-primary" />
                </div>
                Your Collections
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {collectionItems.length === 0 && (
                <div className="flex flex-col items-center py-8">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/50 mb-3">
                    <FolderPlus className="size-7 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm text-muted-foreground">No collections yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Create one above to get started</p>
                </div>
              )}
              {collectionItems.map((collection, i) => (
                <div key={collection.id} className="animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <DropCollection
                    collection={collection}
                    onDelete={async (id) => {
                      await apiFetch(`/api/v1/collections/${id}`, { method: "DELETE" });
                      await queryClient.invalidateQueries({ queryKey: ["collections"] });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Books panel */}
          <Card className="border-border/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                  <BookOpen className="size-3.5 text-primary" />
                </div>
                Books
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {bookItems.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[600px] overflow-y-auto">
              {bookItems.map((book, i) => (
                <div key={book.id} className="space-y-2 animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                  <DraggableBook book={book} />
                  {/* Keyboard-accessible fallback */}
                  <div className="flex items-center gap-2 pl-7">
                    <Select
                      value={String(fallbackTarget[book.id] ?? "")}
                      onValueChange={(v) => {
                        setFallbackTarget((prev) => ({
                          ...prev,
                          [book.id]: Number(v)
                        }));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue placeholder="Add to collection..." />
                      </SelectTrigger>
                      <SelectContent>
                        {collectionItems.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.icon ? `${c.icon} ` : ""}{c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        const target = fallbackTarget[book.id];
                        if (!target) return;
                        await addBookToCollection(target, book.id);
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DndContext>
    </div>
  );
};
