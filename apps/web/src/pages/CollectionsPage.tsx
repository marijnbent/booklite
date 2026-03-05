import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FolderOpen,
  Plus,
  Trash2,
  BookOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Book,
  Check,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  series: string | null;
  description: string | null;
  coverPath: string | null;
  fileExt: string;
  fileSize: number;
  koboSyncable: number;
  createdAt: string;
  updatedAt: string;
  progress: {
    status: "UNREAD" | "READING" | "DONE";
    progressPercent: number;
  } | null;
}

interface CollectionBookItem extends BookItem {
  sort_order?: number;
}

// ---------------------------------------------------------------------------
// Emoji picker -- simple grid of common emojis
// ---------------------------------------------------------------------------

const EMOJI_OPTIONS = [
  "📚", "📖", "📕", "📗", "📘", "📙", "📓", "📔",
  "🎯", "💡", "🔥", "⭐", "💎", "🏆", "🎨", "🎭",
  "🌟", "🌈", "🍀", "🌊", "🏔️", "🌙", "☀️", "🌸",
  "❤️", "💜", "💙", "💚", "🧡", "💛", "🖤", "🤍",
  "🚀", "✈️", "🎵", "🎮", "🔬", "📐", "🧪", "💻",
  "🍕", "☕", "🍷", "🎂", "🌮", "🍦", "🥐", "🍩",
];

const EmojiPicker: React.FC<{
  value: string | null;
  onChange: (emoji: string | null) => void;
}> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
          Icon
        </label>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
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
              "flex items-center justify-center size-9 rounded-lg text-lg transition-all duration-150",
              "hover:bg-primary/10 hover:scale-110",
              "active:scale-95",
              value === emoji
                ? "bg-primary/15 ring-2 ring-primary/30 shadow-sm"
                : "bg-muted/30"
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Book cover (inline, small version for collections)
// ---------------------------------------------------------------------------

const MiniCover: React.FC<{
  book: BookItem;
  className?: string;
}> = ({ book, className }) => {
  const [imgError, setImgError] = useState(false);
  const showFallback = !book.coverPath || imgError;
  const hue = (book.id * 137) % 360;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md w-8 h-11 shrink-0",
        className
      )}
    >
      {showFallback ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}) 0%, oklch(0.25 0.05 ${(hue + 40) % 360}) 100%)`,
          }}
        >
          <Book className="size-3 text-white/25" />
        </div>
      ) : (
        <img
          src={book.coverPath!}
          alt=""
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Cover stack -- shows a few cover thumbnails stacked
// ---------------------------------------------------------------------------

const CoverStack: React.FC<{
  books: BookItem[];
}> = ({ books }) => {
  const display = books.slice(0, 4);

  if (display.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-muted-foreground/20">
        <FolderOpen className="size-8" />
      </div>
    );
  }

  return (
    <div className="relative h-24 flex items-end justify-center">
      {display.map((book, i) => {
        const hue = (book.id * 137) % 360;
        const offset = (i - (display.length - 1) / 2) * 20;
        const rotation = (i - (display.length - 1) / 2) * 4;
        const zIndex = i;

        return (
          <div
            key={book.id}
            className="absolute w-12 h-[68px] rounded-md overflow-hidden shadow-md border border-white/20 dark:border-white/10 transition-transform duration-200"
            style={{
              transform: `translateX(${offset}px) rotate(${rotation}deg)`,
              zIndex,
            }}
          >
            {book.coverPath ? (
              <img
                src={book.coverPath}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}), oklch(0.25 0.05 ${(hue + 40) % 360}))`,
                }}
              >
                <Book className="size-4 text-white/20" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create collection dialog
// ---------------------------------------------------------------------------

const CreateCollectionDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>("📚");
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
      setIcon("📚");
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            Group related books together for easy access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Name
            </label>
            <Input
              placeholder="e.g. Science Fiction, Work Reading..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  createMutation.mutate();
                }
              }}
              autoFocus
            />
          </div>

          <EmojiPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            size="sm"
          >
            {createMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
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

const EditCollectionDialog: React.FC<{
  collection: CollectionItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ collection, open, onOpenChange }) => {
  const [name, setName] = useState(collection.name);
  const [icon, setIcon] = useState<string | null>(collection.icon);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setName(collection.name);
      setIcon(collection.icon);
    }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
          <DialogDescription>
            Update the name or icon for this collection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  updateMutation.mutate();
                }
              }}
              autoFocus
            />
          </div>

          <EmojiPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            size="sm"
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
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

const AddBooksDialog: React.FC<{
  collection: CollectionItem;
  existingBookIds: Set<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ collection, existingBookIds, open, onOpenChange }) => {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

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
      await apiFetch(
        `/api/v1/collections/${collection.id}/books/${bookId}`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({
        queryKey: ["collection-books", collection.id],
      });
    },
  });

  const books = booksQuery.data ?? [];
  const availableBooks = books.filter((b) => !existingBookIds.has(b.id));

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {collection.icon && <span>{collection.icon}</span>}
            Add books to {collection.name}
          </DialogTitle>
          <DialogDescription>
            Search your library and click to add books.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            placeholder="Search your library..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {/* Book list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0 max-h-[400px]">
          {booksQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground/60">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading...
            </div>
          )}

          {!booksQuery.isLoading && availableBooks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Book className="size-8 text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground/60">
                {search
                  ? "No matching books found."
                  : "All books are already in this collection."}
              </p>
            </div>
          )}

          <div className="space-y-1 py-2">
            {availableBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => addMutation.mutate(book.id)}
                disabled={addMutation.isPending}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
                  "transition-all duration-150",
                  "hover:bg-primary/[0.06] active:scale-[0.99]",
                  "group"
                )}
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {book.fileExt.toUpperCase()}
                </Badge>
                <Plus className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Expanded collection view (inline)
// ---------------------------------------------------------------------------

const CollectionExpanded: React.FC<{
  collection: CollectionItem;
  onClose: () => void;
}> = ({ collection, onClose }) => {
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const booksQuery = useQuery({
    queryKey: ["collection-books", collection.id],
    queryFn: () =>
      apiFetch<CollectionBookItem[]>(
        `/api/v1/collections/${collection.id}/books`
      ),
  });

  const removeMutation = useMutation({
    mutationFn: async (bookId: number) => {
      await apiFetch(
        `/api/v1/collections/${collection.id}/books/${bookId}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["collection-books", collection.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  const books = booksQuery.data ?? [];
  const existingIds = useMemo(
    () => new Set(books.map((b) => b.id)),
    [books]
  );

  return (
    <div
      className={cn(
        "col-span-full rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm",
        "overflow-hidden animate-fade-in"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
          {collection.icon ? (
            <span className="text-lg">{collection.icon}</span>
          ) : (
            <FolderOpen className="size-4 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">{collection.name}</h3>
          <p className="text-[11px] text-muted-foreground/60">
            {books.length} book{books.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="size-3.5" />
          Add books
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Books list */}
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {booksQuery.isLoading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground/60">
            <Loader2 className="size-4 animate-spin mr-2" />
            Loading...
          </div>
        )}

        {!booksQuery.isLoading && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10">
            <BookOpen className="size-8 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground/60 mb-3">
              This collection is empty.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="size-3.5" />
              Add your first book
            </Button>
          </div>
        )}

        {books.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {books.map((book) => (
              <div
                key={book.id}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
                  "hover:bg-muted/50 transition-colors duration-150"
                )}
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground/60 truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <button
                  onClick={() => removeMutation.mutate(book.id)}
                  disabled={removeMutation.isPending}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                    "flex size-7 items-center justify-center rounded-md",
                    "text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10"
                  )}
                  title="Remove from collection"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add books dialog */}
      <AddBooksDialog
        collection={collection}
        existingBookIds={existingIds}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Collection card
// ---------------------------------------------------------------------------

const CollectionCard: React.FC<{
  collection: CollectionItem;
  coverBooks: BookItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ collection, coverBooks, isExpanded, onToggleExpand, onEdit, onDelete }) => {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl cursor-pointer",
        "bg-card border shadow-sm",
        "transition-all duration-200",
        isExpanded
          ? "border-primary/30 shadow-md shadow-primary/[0.06]"
          : "border-border/50 hover:border-border/80 hover:shadow-md hover:shadow-primary/[0.04]"
      )}
      onClick={onToggleExpand}
    >
      {/* Cover thumbnails area */}
      <div className="relative px-4 pt-4 pb-2">
        <CoverStack books={coverBooks} />

        {/* Actions dropdown -- top right */}
        <div
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-7 bg-background/90 backdrop-blur-sm border border-border/50 shadow-sm"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="size-3.5 mr-1" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5 mr-1" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-1">
        <div
          className={cn(
            "flex size-8 items-center justify-center rounded-lg shrink-0 transition-colors duration-200",
            isExpanded ? "bg-primary/15" : "bg-secondary"
          )}
        >
          {collection.icon ? (
            <span className="text-base">{collection.icon}</span>
          ) : (
            <FolderOpen className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{collection.name}</p>
          <p className="text-[11px] text-muted-foreground/60">
            {collection.book_count}{" "}
            {collection.book_count === 1 ? "book" : "books"}
          </p>
        </div>
        <div
          className={cn(
            "flex size-6 items-center justify-center rounded-md transition-all duration-200",
            isExpanded
              ? "text-primary bg-primary/10"
              : "text-muted-foreground/40 group-hover:text-muted-foreground"
          )}
        >
          {isExpanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CollectionsPage: React.FC = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingCollection, setEditingCollection] =
    useState<CollectionItem | null>(null);
  const queryClient = useQueryClient();

  // Fetch collections
  const collectionsQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections"),
  });

  // Fetch cover preview books for each collection
  // We fetch all books with a small limit just for cover previews
  const previewBooksQuery = useQuery({
    queryKey: ["books", "collection-previews"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/books?limit=100"),
    enabled: (collectionsQuery.data?.length ?? 0) > 0,
  });

  // For each expanded collection, we fetch its books separately
  // Cover previews use the first few books from the main library as a rough preview
  // (the actual collection books are fetched when expanded)

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/api/v1/collections/${id}`, { method: "DELETE" });
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      if (expandedId === id) setExpandedId(null);
    },
  });

  const collections = collectionsQuery.data ?? [];
  const previewBooks = previewBooksQuery.data ?? [];

  // Build a rough mapping of collection -> preview books
  // Since we don't have per-collection books in the list view,
  // we'll fetch them when a collection is expanded. For the card preview,
  // we just show a few books from the library as visual filler.
  const getPreviewBooks = useCallback(
    (collectionId: number): BookItem[] => {
      // Deterministic subset based on collection id
      const start = (collectionId * 3) % Math.max(previewBooks.length, 1);
      const result: BookItem[] = [];
      for (let i = 0; i < 4 && i < previewBooks.length; i++) {
        result.push(previewBooks[(start + i) % previewBooks.length]);
      }
      return result;
    },
    [previewBooks]
  );

  const handleToggleExpand = useCallback(
    (id: number) => {
      setExpandedId((prev) => (prev === id ? null : id));
    },
    []
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ---------------------------------------------------------------- */}
      {/* Page header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {collections.length > 0 ? (
              <>
                <span className="tabular-nums font-medium text-foreground/80">
                  {collections.length}
                </span>{" "}
                collection{collections.length !== 1 ? "s" : ""}
              </>
            ) : (
              "Organize your books into collections"
            )}
          </p>
        </div>

        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="gap-1.5 self-start sm:self-auto"
        >
          <Plus className="size-3.5" />
          New collection
        </Button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Loading state                                                    */}
      {/* ---------------------------------------------------------------- */}
      {collectionsQuery.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-card border border-border/30 overflow-hidden"
            >
              <div className="h-28 bg-muted/30 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-muted/40 rounded animate-pulse w-2/3" />
                <div className="h-3 bg-muted/30 rounded animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Empty state                                                      */}
      {/* ---------------------------------------------------------------- */}
      {!collectionsQuery.isLoading && collections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 mb-4">
            <FolderPlus className="size-10 text-muted-foreground/25" />
          </div>
          <h3 className="text-lg font-semibold text-foreground/80">
            No collections yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground/60 max-w-xs text-center">
            Create your first collection to start organizing your books into
            groups.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="mt-5 gap-1.5"
          >
            <Plus className="size-3.5" />
            Create collection
          </Button>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Collections grid                                                 */}
      {/* ---------------------------------------------------------------- */}
      {!collectionsQuery.isLoading && collections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collections.map((collection) => (
            <React.Fragment key={collection.id}>
              <CollectionCard
                collection={collection}
                coverBooks={getPreviewBooks(collection.id)}
                isExpanded={expandedId === collection.id}
                onToggleExpand={() => handleToggleExpand(collection.id)}
                onEdit={() => setEditingCollection(collection)}
                onDelete={() => {
                  if (
                    window.confirm(
                      `Delete "${collection.name}"? Books won't be removed from your library.`
                    )
                  ) {
                    deleteMutation.mutate(collection.id);
                  }
                }}
              />

              {/* Expanded inline view */}
              {expandedId === collection.id && (
                <CollectionExpanded
                  collection={collection}
                  onClose={() => setExpandedId(null)}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Dialogs                                                          */}
      {/* ---------------------------------------------------------------- */}
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {editingCollection && (
        <EditCollectionDialog
          collection={editingCollection}
          open={!!editingCollection}
          onOpenChange={(open) => {
            if (!open) setEditingCollection(null);
          }}
        />
      )}
    </div>
  );
};
