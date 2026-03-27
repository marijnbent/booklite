import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BookCover, renderCollectionIcon } from "@/components/library/libraryShared";
import type { BookItem, CollectionItem } from "@/components/library/libraryShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Book, Check, Loader2, Plus, Search } from "lucide-react";

// ---------------------------------------------------------------------------
// Emoji picker
// ---------------------------------------------------------------------------

const EMOJI_OPTIONS = [
  "\u{1F4DA}", "\u{1F4D6}", "\u{1F4D5}", "\u{1F4D7}", "\u{1F4D8}", "\u{1F4D9}", "\u{1F4D3}", "\u{1F4D4}",
  "\u{1F3AF}", "\u{1F4A1}", "\u{1F525}", "\u2B50", "\u{1F48E}", "\u{1F3C6}", "\u{1F3A8}", "\u{1F3AD}",
  "\u{1F31F}", "\u{1F308}", "\u{1F340}", "\u{1F30A}", "\u{1F3D4}\uFE0F", "\u{1F319}", "\u2600\uFE0F", "\u{1F338}",
  "\u2764\uFE0F", "\u{1F49C}", "\u{1F499}", "\u{1F49A}", "\u{1F9E1}", "\u{1F49B}", "\u{1F5A4}", "\u{1F90D}",
  "\u{1F680}", "\u2708\uFE0F", "\u{1F3B5}", "\u{1F3AE}", "\u{1F52C}", "\u{1F4D0}", "\u{1F9EA}", "\u{1F4BB}",
  "\u{1F355}", "\u2615", "\u{1F377}", "\u{1F382}", "\u{1F32E}", "\u{1F366}", "\u{1F950}", "\u{1F369}",
];

const EmojiPicker: React.FC<{
  value: string | null;
  onChange: (emoji: string | null) => void;
}> = ({ value, onChange }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <label className="text-xs font-medium text-muted-foreground">Icon</label>
      {value && (
        <button onClick={() => onChange(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Remove
        </button>
      )}
    </div>
    <div className="grid grid-cols-8 gap-1">
      {EMOJI_OPTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onChange(emoji)}
          className={cn(
            "flex items-center justify-center size-8 rounded-md text-base transition-colors",
            value === emoji ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted",
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Create collection dialog
// ---------------------------------------------------------------------------

export const CreateCollectionDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>("\u{1F4DA}");
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiFetch("/api/v1/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), icon }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      setName("");
      setIcon("\u{1F4DA}");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>Group related books together.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              placeholder="e.g. Science Fiction, Work Reading..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMutation.mutate(); }}
              autoFocus
            />
          </div>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending} size="sm" className="gap-1.5">
            {createMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Edit collection dialog
// ---------------------------------------------------------------------------

export const EditCollectionDialog: React.FC<{
  collection: CollectionItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ collection, open, onOpenChange }) => {
  const [name, setName] = useState(collection.name);
  const [icon, setIcon] = useState<string | null>(collection.icon);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) { setName(collection.name); setIcon(collection.icon); }
  }, [open, collection]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/v1/collections/${collection.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), icon }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
          <DialogDescription>Update the name or icon.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) updateMutation.mutate(); }}
              autoFocus
            />
          </div>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">Cancel</Button>
          <Button onClick={() => updateMutation.mutate()} disabled={!name.trim() || updateMutation.isPending} size="sm" className="gap-1.5">
            {updateMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Add books to collection dialog
// ---------------------------------------------------------------------------

export const AddBooksDialog: React.FC<{
  collection: CollectionItem;
  existingBookIds: Set<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ collection, existingBookIds, open, onOpenChange }) => {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) { setSearchInput(""); setSearch(""); }
  }, [open]);

  const booksQuery = useQuery({
    queryKey: ["books", "add-to-collection", search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("q", search);
      return apiFetch<BookItem[]>(`/api/v1/books?${params.toString()}`);
    },
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: async (bookId: number) => {
      await apiFetch(`/api/v1/collections/${collection.id}/books/${bookId}`, { method: "POST" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["collection-books", collection.id] });
    },
  });

  const availableBooks = (booksQuery.data ?? []).filter((b) => !existingBookIds.has(b.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {renderCollectionIcon(collection, { svgClassName: "size-4", textClassName: "text-lg leading-none" })}
            Add books to {collection.name}
          </DialogTitle>
          <DialogDescription>Search your library and click to add.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search your library..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0 max-h-[400px]">
          {booksQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading...
            </div>
          )}
          {!booksQuery.isLoading && availableBooks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14">
              <Book className="size-5 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search ? "No matching books found." : "All books are already in this collection."}
              </p>
            </div>
          )}
          <div className="py-1">
            {availableBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => addMutation.mutate(book.id)}
                disabled={addMutation.isPending}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors hover:bg-muted"
              >
                <div className="w-7 h-10 shrink-0 overflow-hidden rounded bg-muted">
                  <BookCover book={book} className="h-full w-full" showTitle={false} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{book.author ?? "Unknown author"}</p>
                </div>
                <Plus className="size-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
