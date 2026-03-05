import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
} from "lucide-react";

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

const statusConfig = {
  UNREAD: { label: "Unread", icon: Book, variant: "secondary" as const },
  READING: { label: "Reading", icon: BookOpen, variant: "info" as const },
  DONE: { label: "Done", icon: CheckCircle2, variant: "success" as const },
};

export const LibraryPage: React.FC = () => {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const queryClient = useQueryClient();

  const books = useQuery({
    queryKey: ["books", q],
    queryFn: () => apiFetch<BookItem[]>(`/api/v1/books${q ? `?q=${encodeURIComponent(q)}` : ""}`)
  });

  const items = useMemo(() => books.data ?? [], [books.data]);

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
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length > 0
            ? `${items.length} book${items.length !== 1 ? "s" : ""} in your collection`
            : "Your personal book collection"}
        </p>
      </div>

      {/* Toolbar */}
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

      {/* Loading state */}
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

      {/* Empty state */}
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

      {/* Grid view */}
      {!books.isLoading && items.length > 0 && view === "grid" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {items.map((book, i) => (
            <Card
              key={book.id}
              className={cn(
                "group relative overflow-hidden hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.04] animate-fade-up"
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Cover placeholder with gradient */}
              <div className="relative h-28 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] flex items-center justify-center overflow-hidden">
                <Book className="size-10 text-primary/20 transition-transform duration-300 group-hover:scale-110" />
                {/* File type badge overlaid on cover */}
                <Badge
                  variant="secondary"
                  className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm border-border/30"
                >
                  {book.fileExt.toUpperCase()}
                </Badge>
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
                    <Badge variant="default" className="text-[10px]">Kobo</Badge>
                  )}
                </div>

                {/* Actions -- visible on hover */}
                <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <Select
                    value={book.progress?.status ?? "UNREAD"}
                    onValueChange={(v) => void handleStatusChange(book.id, v)}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1">
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
                    onClick={() => void handleRefreshMetadata(book.id)}
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

      {/* List view */}
      {!books.isLoading && items.length > 0 && view === "list" && (
        <div className="space-y-2">
          {items.map((book, i) => (
            <Card
              key={book.id}
              className="group hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.04] animate-fade-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Mini cover */}
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/[0.06]">
                  <Book className="size-5 text-primary/30" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors duration-200">
                    {book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>

                {/* Badges */}
                <div className="hidden sm:flex items-center gap-2">
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
                  {book.koboSyncable === 1 && (
                    <Badge variant="default" className="text-[10px]">Kobo</Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Select
                    value={book.progress?.status ?? "UNREAD"}
                    onValueChange={(v) => void handleStatusChange(book.id, v)}
                  >
                    <SelectTrigger className="h-7 w-24 text-xs">
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
                    onClick={() => void handleRefreshMetadata(book.id)}
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
  );
};
