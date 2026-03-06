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
// Emoji picker
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
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">
          Icon
        </label>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-[11px] text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onChange(emoji)}
            className={cn(
              "flex items-center justify-center size-9 rounded-xl text-lg transition-all duration-150",
              "hover:bg-primary/10 hover:scale-110",
              "active:scale-95",
              value === emoji
                ? "bg-primary/12 ring-2 ring-primary/25 shadow-sm shadow-primary/10"
                : "bg-muted/20 hover:bg-muted/40",
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
// Mini cover
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
        "relative overflow-hidden rounded-lg w-8 h-11 shrink-0 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
        className,
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
// Cover stack
// ---------------------------------------------------------------------------

const CoverStack: React.FC<{
  books: BookItem[];
}> = ({ books }) => {
  const display = books.slice(0, 4);

  if (display.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-muted-foreground/15">
        <FolderOpen className="size-10" />
      </div>
    );
  }

  return (
    <div className="relative h-28 flex items-end justify-center">
      {display.map((book, i) => {
        const hue = (book.id * 137) % 360;
        const offset = (i - (display.length - 1) / 2) * 22;
        const rotation = (i - (display.length - 1) / 2) * 5;
        const zIndex = i;

        return (
          <div
            key={book.id}
            className="absolute w-14 h-[72px] rounded-lg overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] ring-1 ring-white/15 dark:ring-white/8 transition-transform duration-300 group-hover:scale-105"
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
      <DialogContent className="sm:max-w-md rounded-2xl border-border/30 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg tracking-tight">
            Create collection
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/60">
            Group related books together for easy access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">
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
              className="rounded-xl bg-secondary/30 border-border/30 focus-visible:border-primary/30 focus-visible:ring-primary/10"
            />
          </div>

          <EmojiPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            size="sm"
            className="rounded-lg gap-1.5 shadow-sm shadow-primary/15"
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
      <DialogContent className="sm:max-w-md rounded-2xl border-border/30 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg tracking-tight">
            Edit collection
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/60">
            Update the name or icon for this collection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-3">
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/60">
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
              className="rounded-xl bg-secondary/30 border-border/30 focus-visible:border-primary/30 focus-visible:ring-primary/10"
            />
          </div>

          <EmojiPicker value={icon} onChange={setIcon} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            size="sm"
            className="rounded-lg gap-1.5 shadow-sm shadow-primary/15"
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
        { method: "POST" },
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

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      setSearchInput("");
      setSearch("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col rounded-2xl border-border/30 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-lg tracking-tight">
            {collection.icon && (
              <span className="text-xl">{collection.icon}</span>
            )}
            Add books to {collection.name}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground/60">
            Search your library and click to add books.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative group/search">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/35 transition-colors group-focus-within/search:text-primary/60" />
          <Input
            placeholder="Search your library..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10 rounded-xl bg-secondary/30 border-border/30 focus-visible:border-primary/25 focus-visible:ring-primary/10"
            autoFocus
          />
        </div>

        {/* Book list */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 min-h-0 max-h-[400px]">
          {booksQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground/50">
              <Loader2 className="size-4 animate-spin mr-2" />
              Loading...
            </div>
          )}

          {!booksQuery.isLoading && availableBooks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/30 mb-3">
                <Book className="size-5 text-muted-foreground/20" />
              </div>
              <p className="text-sm text-muted-foreground/50">
                {search
                  ? "No matching books found."
                  : "All books are already in this collection."}
              </p>
            </div>
          )}

          <div className="space-y-0.5 py-2">
            {availableBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => addMutation.mutate(book.id)}
                disabled={addMutation.isPending}
                className={cn(
                  "w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-left",
                  "transition-all duration-150",
                  "hover:bg-primary/[0.05] active:scale-[0.99]",
                  "group",
                )}
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors duration-150">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground/50 truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground/30 bg-muted/20 px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0">
                  {book.fileExt}
                </span>
                <div className="flex size-6 items-center justify-center rounded-lg bg-primary/8 text-primary/50 group-hover:bg-primary/15 group-hover:text-primary transition-all duration-150 shrink-0">
                  <Plus className="size-3.5" />
                </div>
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
        `/api/v1/collections/${collection.id}/books`,
      ),
  });

  const removeMutation = useMutation({
    mutationFn: async (bookId: number) => {
      await apiFetch(
        `/api/v1/collections/${collection.id}/books/${bookId}`,
        { method: "DELETE" },
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
    [books],
  );

  return (
    <div
      className={cn(
        "col-span-full rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm",
        "overflow-hidden animate-scale-in",
        "shadow-lg shadow-primary/[0.03]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3.5 px-5 py-4 border-b border-border/30">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
          {collection.icon ? (
            <span className="text-xl">{collection.icon}</span>
          ) : (
            <FolderOpen className="size-4.5 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm tracking-tight">
            {collection.name}
          </h3>
          <p className="text-[11px] text-muted-foreground/50">
            {books.length} book{books.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs rounded-lg border-primary/20 text-primary hover:bg-primary/[0.06]"
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="size-3.5" />
          Add books
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-lg text-muted-foreground/40 hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Books list */}
      <div className="p-3 max-h-[400px] overflow-y-auto">
        {booksQuery.isLoading && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground/40">
            <Loader2 className="size-4 animate-spin mr-2" />
            Loading...
          </div>
        )}

        {!booksQuery.isLoading && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/30 mb-3">
              <BookOpen className="size-6 text-muted-foreground/20" />
            </div>
            <p className="text-sm text-muted-foreground/50 mb-4">
              This collection is empty.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="gap-1.5 text-xs rounded-lg border-primary/20 text-primary hover:bg-primary/[0.06]"
            >
              <Plus className="size-3.5" />
              Add your first book
            </Button>
          </div>
        )}

        {books.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5">
            {books.map((book, i) => (
              <div
                key={book.id}
                className={cn(
                  "group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl",
                  "hover:bg-muted/30 transition-colors duration-150",
                )}
                style={{
                  animationDelay: `${i * 30}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground/50 truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <button
                  onClick={() => removeMutation.mutate(book.id)}
                  disabled={removeMutation.isPending}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-all duration-150",
                    "flex size-7 items-center justify-center rounded-lg",
                    "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/8",
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
}> = ({
  collection,
  coverBooks,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}) => {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl cursor-pointer",
        "bg-card/80 backdrop-blur-sm",
        "transition-all duration-300",
        isExpanded
          ? "border border-primary/25 shadow-lg shadow-primary/[0.06] ring-1 ring-primary/10"
          : "border border-border/40 shadow-sm hover:shadow-md hover:shadow-primary/[0.04] hover:-translate-y-0.5 hover:border-border/60",
      )}
      onClick={onToggleExpand}
    >
      {/* Cover thumbnails area */}
      <div className="relative px-5 pt-5 pb-2">
        <CoverStack books={coverBooks} />

        {/* Actions dropdown */}
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="size-7 bg-card/90 backdrop-blur-md border border-border/40 shadow-sm rounded-lg hover:bg-card"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl">
              <DropdownMenuItem onClick={onEdit} className="gap-2 rounded-lg">
                <Pencil className="size-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive gap-2 rounded-lg"
              >
                <Trash2 className="size-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-2">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-xl shrink-0 transition-all duration-200",
            isExpanded
              ? "bg-primary/12 shadow-sm shadow-primary/10"
              : "bg-secondary/60 group-hover:bg-secondary",
          )}
        >
          {collection.icon ? (
            <span className="text-lg">{collection.icon}</span>
          ) : (
            <FolderOpen className="size-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate tracking-tight">
            {collection.name}
          </p>
          <p className="text-[11px] text-muted-foreground/50">
            {collection.book_count}{" "}
            {collection.book_count === 1 ? "book" : "books"}
          </p>
        </div>
        <div
          className={cn(
            "flex size-6 items-center justify-center rounded-lg transition-all duration-200",
            isExpanded
              ? "text-primary bg-primary/10"
              : "text-muted-foreground/30 group-hover:text-muted-foreground/60",
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

  const collectionsQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections"),
  });

  const previewBooksQuery = useQuery({
    queryKey: ["books", "collection-previews"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/books?limit=100"),
    enabled: (collectionsQuery.data?.length ?? 0) > 0,
  });

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

  const getPreviewBooks = useCallback(
    (collectionId: number): BookItem[] => {
      const start = (collectionId * 3) % Math.max(previewBooks.length, 1);
      const result: BookItem[] = [];
      for (let i = 0; i < 4 && i < previewBooks.length; i++) {
        result.push(previewBooks[(start + i) % previewBooks.length]);
      }
      return result;
    },
    [previewBooks],
  );

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Collections</h1>
          <p className="mt-2 text-sm text-muted-foreground/60">
            {collections.length > 0 ? (
              <>
                <span className="tabular-nums font-semibold text-foreground/70">
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
          className="gap-1.5 self-start sm:self-auto rounded-xl shadow-sm shadow-primary/15"
        >
          <Plus className="size-3.5" />
          New collection
        </Button>
      </div>

      {/* Loading */}
      {collectionsQuery.isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-card border border-border/20 overflow-hidden"
            >
              <div className="h-32 bg-muted/20 animate-pulse" />
              <div className="p-5 space-y-2.5">
                <div className="h-4 bg-muted/30 rounded-full animate-pulse w-2/3" />
                <div className="h-3 bg-muted/20 rounded-full animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!collectionsQuery.isLoading && collections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-up">
          <div className="relative mb-6">
            <div className="absolute -left-2 -top-1 w-16 h-16 rounded-2xl bg-primary/6 rotate-[-6deg]" />
            <div className="relative flex size-20 items-center justify-center rounded-2xl bg-primary/10">
              <FolderPlus className="size-9 text-primary/35" />
            </div>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">
            No collections yet
          </h3>
          <p className="mt-2 text-sm text-muted-foreground/50 max-w-sm text-center leading-relaxed">
            Create your first collection to start organizing your books into
            groups. Use collections for genres, reading lists, or any grouping
            you like.
          </p>
          <Button
            onClick={() => setCreateOpen(true)}
            size="sm"
            className="mt-6 gap-1.5 rounded-xl shadow-sm shadow-primary/15"
          >
            <Plus className="size-3.5" />
            Create collection
          </Button>
        </div>
      )}

      {/* Collections grid */}
      {!collectionsQuery.isLoading && collections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {collections.map((collection, i) => (
            <React.Fragment key={collection.id}>
              <div
                className="animate-fade-up"
                style={{
                  animationDelay: `${i * 50}ms`,
                  animationFillMode: "backwards",
                }}
              >
                <CollectionCard
                  collection={collection}
                  coverBooks={getPreviewBooks(collection.id)}
                  isExpanded={expandedId === collection.id}
                  onToggleExpand={() => handleToggleExpand(collection.id)}
                  onEdit={() => setEditingCollection(collection)}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Delete "${collection.name}"? Books won't be removed from your library.`,
                      )
                    ) {
                      deleteMutation.mutate(collection.id);
                    }
                  }}
                />
              </div>

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

      {/* Dialogs */}
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
