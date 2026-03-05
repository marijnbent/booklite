import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Book,
  Grid3X3,
  List,
  Search,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  BookMarked,
  Star,
  Loader2,
  Save,
  FolderOpen,
} from "lucide-react";

interface BookItem {
  id: number;
  title: string;
  author: string | null;
  series: string | null;
  description: string | null;
  fileExt: string;
  koboSyncable: number;
  isFavorite?: boolean;
  progress: {
    status: "UNREAD" | "READING" | "DONE";
    progressPercent: number;
  } | null;
}

interface BookCollectionAssignment {
  id: number;
  name: string;
  icon: string | null;
  slug: string | null;
  isSystem: boolean;
  assigned: boolean;
}

const statusConfig = {
  UNREAD: { label: "Unread", icon: Book, variant: "secondary" as const },
  READING: { label: "Reading", icon: BookOpen, variant: "info" as const },
  DONE: { label: "Done", icon: CheckCircle2, variant: "success" as const },
};

export const LibraryPage: React.FC = () => {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    author: "",
    series: "",
    description: ""
  });
  const queryClient = useQueryClient();

  const books = useQuery({
    queryKey: ["books", q],
    queryFn: () => apiFetch<BookItem[]>(`/api/v1/books${q ? `?q=${encodeURIComponent(q)}` : ""}`)
  });

  const selectedBook = useQuery({
    queryKey: ["books", "detail", selectedBookId],
    queryFn: () => apiFetch<BookItem>(`/api/v1/books/${selectedBookId}`),
    enabled: selectedBookId !== null
  });

  const bookCollections = useQuery({
    queryKey: ["books", selectedBookId, "collections"],
    queryFn: () => apiFetch<BookCollectionAssignment[]>(`/api/v1/books/${selectedBookId}/collections`),
    enabled: selectedBookId !== null
  });

  useEffect(() => {
    if (!selectedBook.data) return;
    setDraft({
      title: selectedBook.data.title,
      author: selectedBook.data.author ?? "",
      series: selectedBook.data.series ?? "",
      description: selectedBook.data.description ?? ""
    });
  }, [selectedBook.data]);

  const items = useMemo(() => books.data ?? [], [books.data]);

  const saveMetadataMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBookId) return;
      await apiFetch(`/api/v1/books/${selectedBookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim() || "Untitled",
          author: draft.author.trim() ? draft.author.trim() : null,
          series: draft.series.trim() ? draft.series.trim() : null,
          description: draft.description.trim() ? draft.description.trim() : null
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      await queryClient.invalidateQueries({ queryKey: ["books", "detail", selectedBookId] });
    }
  });

  const handleStatusChange = async (bookId: number, status: string) => {
    await apiFetch(`/api/v1/books/${bookId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    await queryClient.invalidateQueries({ queryKey: ["books"] });
  };

  const handleRefreshMetadata = async (bookId: number) => {
    await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    await queryClient.invalidateQueries({ queryKey: ["books", "detail", bookId] });
  };

  const handleFavorite = async (bookId: number, favorite: boolean) => {
    await apiFetch(`/api/v1/books/${bookId}/favorite`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorite })
    });
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    await queryClient.invalidateQueries({ queryKey: ["books", "detail", bookId] });
    await queryClient.invalidateQueries({ queryKey: ["books", bookId, "collections"] });
    await queryClient.invalidateQueries({ queryKey: ["books", selectedBookId, "collections"] });
    await queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  const setCollectionAssigned = async (collectionId: number, assigned: boolean) => {
    if (!selectedBookId || !bookCollections.data) return;

    const currentIds = bookCollections.data.filter((c) => c.assigned).map((c) => c.id);
    const nextIds = assigned
      ? [...currentIds, collectionId]
      : currentIds.filter((id) => id !== collectionId);

    await apiFetch(`/api/v1/books/${selectedBookId}/collections`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionIds: [...new Set(nextIds)] })
    });

    await queryClient.invalidateQueries({ queryKey: ["books", selectedBookId, "collections"] });
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    await queryClient.invalidateQueries({ queryKey: ["collections"] });
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length > 0
              ? `${items.length} book${items.length !== 1 ? "s" : ""} in your collection`
              : "Your personal book collection"}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search books..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as "grid" | "list"); }}
          >
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <Grid3X3 className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {books.isLoading && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-52 rounded-xl bg-muted/40 animate-pulse"
                style={{ animationDelay: `${i * 80}ms` }}
              />
            ))}
          </div>
        )}

        {!books.isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 mb-4">
              <BookMarked className="size-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-semibold text-foreground/80">No books yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs text-center">
              {q
                ? "No books match your search. Try a different query."
                : "Upload your first book to get started."}
            </p>
          </div>
        )}

        {!books.isLoading && items.length > 0 && view === "grid" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {items.map((book, i) => (
              <Card
                key={book.id}
                className={cn(
                  "group relative overflow-hidden hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.04] animate-fade-up cursor-pointer"
                )}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => setSelectedBookId(book.id)}
              >
                <div className="relative h-28 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] flex items-center justify-center overflow-hidden">
                  <Book className="size-10 text-primary/20 transition-transform duration-300 group-hover:scale-110" />
                  <Badge
                    variant="secondary"
                    className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm border-border/30"
                  >
                    {book.fileExt.toUpperCase()}
                  </Badge>
                  <button
                    className="absolute top-2 left-2 rounded-md bg-background/80 p-1 hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleFavorite(book.id, !book.isFavorite);
                    }}
                    title={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={cn("size-3.5", book.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")} />
                  </button>
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
                    {book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {book.author ?? "Unknown author"}
                  </p>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const status = book.progress?.status ?? "UNREAD";
                      const config = statusConfig[status];
                      return (
                        <Badge variant={config.variant} className="text-[10px] gap-1">
                          <config.icon className="size-3" />
                          {config.label}
                        </Badge>
                      );
                    })()}
                    {book.koboSyncable === 1 && (
                      <Badge variant="default" className="text-[10px]">EPUB</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Select
                      value={book.progress?.status ?? "UNREAD"}
                      onValueChange={(v) => void handleStatusChange(book.id, v)}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNREAD">Unread</SelectItem>
                        <SelectItem value="READING">Reading</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRefreshMetadata(book.id);
                      }}
                      title="Refresh metadata"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {!books.isLoading && items.length > 0 && view === "list" && (
          <div className="space-y-2">
            {items.map((book, i) => (
              <Card
                key={book.id}
                className="group hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.04] animate-fade-up cursor-pointer"
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => setSelectedBookId(book.id)}
              >
                <div className="flex items-center gap-4 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/[0.06]">
                    <Book className="size-5 text-primary/30" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors duration-200">
                      {book.title}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {book.author ?? "Unknown author"}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-2">
                    <button
                      className="rounded-md bg-muted/40 p-1 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleFavorite(book.id, !book.isFavorite);
                      }}
                      title={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Star className={cn("size-3.5", book.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")} />
                    </button>
                    <Badge variant="secondary" className="text-[10px]">
                      {book.fileExt.toUpperCase()}
                    </Badge>
                    {(() => {
                      const status = book.progress?.status ?? "UNREAD";
                      const config = statusConfig[status];
                      return (
                        <Badge variant={config.variant} className="text-[10px] gap-1">
                          <config.icon className="size-3" />
                          {config.label}
                        </Badge>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      value={book.progress?.status ?? "UNREAD"}
                      onValueChange={(v) => void handleStatusChange(book.id, v)}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs" onClick={(e) => e.stopPropagation()}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNREAD">Unread</SelectItem>
                        <SelectItem value="READING">Reading</SelectItem>
                        <SelectItem value="DONE">Done</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRefreshMetadata(book.id);
                      }}
                      title="Refresh metadata"
                    >
                      <RefreshCw className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={selectedBookId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedBookId(null);
        }}
      >
        <DialogContent className="left-auto right-0 top-0 h-screen max-w-md w-full translate-x-0 translate-y-0 rounded-none border-l border-border/50 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedBook.data?.title ?? "Book details"}
            </DialogTitle>
            <DialogDescription>
              Manage metadata, favorites, and collection assignment.
            </DialogDescription>
          </DialogHeader>

          {!selectedBook.data && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          )}

          {selectedBook.data && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Author</label>
                <Input
                  value={draft.author}
                  onChange={(e) => setDraft((prev) => ({ ...prev, author: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Series</label>
                <Input
                  value={draft.series}
                  onChange={(e) => setDraft((prev) => ({ ...prev, series: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  rows={5}
                  value={draft.description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => saveMetadataMutation.mutate()}
                  disabled={saveMetadataMutation.isPending}
                  className="gap-1.5"
                >
                  {saveMetadataMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save metadata
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleRefreshMetadata(selectedBook.data.id)}
                  className="gap-1.5"
                >
                  <RefreshCw className="size-4" />
                  Fetch metadata
                </Button>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <button
                  className="flex w-full items-center justify-between"
                  onClick={() => void handleFavorite(selectedBook.data.id, !selectedBook.data.isFavorite)}
                >
                  <span className="text-sm font-medium">Favorite</span>
                  <Star className={cn("size-4", selectedBook.data.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground")} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FolderOpen className="size-4" />
                  Collections
                </div>
                <div className="space-y-2 rounded-lg border border-border/50 p-3 bg-muted/10">
                  {(bookCollections.data ?? []).map((collection) => (
                    <div key={collection.id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{collection.name}</p>
                        {collection.slug === "favorites" && (
                          <p className="text-[11px] text-muted-foreground">System collection</p>
                        )}
                      </div>
                      <Button
                        variant={collection.assigned ? "default" : "outline"}
                        size="sm"
                        onClick={() => void setCollectionAssigned(collection.id, !collection.assigned)}
                      >
                        {collection.assigned ? "Included" : "Include"}
                      </Button>
                    </div>
                  ))}
                  {bookCollections.isLoading && (
                    <p className="text-xs text-muted-foreground">Loading collections...</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
