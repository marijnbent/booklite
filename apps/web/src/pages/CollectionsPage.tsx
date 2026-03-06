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
}> = ({ value, onChange }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Icon
        </label>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
              "flex items-center justify-center size-8 rounded-md text-base transition-colors",
              value === emoji
                ? "bg-primary/10 ring-1 ring-primary/30"
                : "hover:bg-muted",
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
        "relative overflow-hidden rounded w-7 h-10 shrink-0 bg-muted",
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
// Create collection dialog
// ---------------------------------------------------------------------------

const CreateCollectionDialog: React.FC<{
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
          <DialogDescription>
            Group related books together for easy access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
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
            className="gap-1.5"
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
      <DialogContent className="sm:max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>Edit collection</DialogTitle>
          <DialogDescription>
            Update the name or icon for this collection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
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
            className="gap-1.5"
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
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {collection.icon && (
              <span className="text-lg">{collection.icon}</span>
            )}
            Add books to {collection.name}
          </DialogTitle>
          <DialogDescription>
            Search your library and click to add books.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
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

        {/* Book list */}
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
                {search
                  ? "No matching books found."
                  : "All books are already in this collection."}
              </p>
            </div>
          )}

          <div className="py-1">
            {availableBooks.map((book) => (
              <button
                key={book.id}
                onClick={() => addMutation.mutate(book.id)}
                disabled={addMutation.isPending}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left",
                  "transition-colors duration-150",
                  "hover:bg-muted",
                )}
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium uppercase tracking-wider shrink-0">
                  {book.fileExt}
                </span>
                <Plus className="size-4 text-muted-foreground shrink-0" />
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
    <div className="border border-border rounded-md bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <span className="text-lg shrink-0">
          {collection.icon ?? ""}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">
            {collection.name}
          </h3>
          <p className="text-xs text-muted-foreground">
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
          className="size-7 shrink-0 text-muted-foreground"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Books list */}
      <div className="max-h-[400px] overflow-y-auto">
        {booksQuery.isLoading && (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" />
            Loading...
          </div>
        )}

        {!booksQuery.isLoading && books.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <BookOpen className="size-5 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
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
          <div className="divide-y divide-border/50">
            {books.map((book) => (
              <div
                key={book.id}
                className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors duration-150"
              >
                <MiniCover book={book} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {book.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {book.author ?? "Unknown author"}
                  </p>
                </div>
                <button
                  onClick={() => removeMutation.mutate(book.id)}
                  disabled={removeMutation.isPending}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                    "flex size-6 items-center justify-center rounded-md",
                    "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
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
// Collection row
// ---------------------------------------------------------------------------

const CollectionRow: React.FC<{
  collection: CollectionItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({
  collection,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
}) => {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150",
        isExpanded
          ? "bg-muted/50"
          : "hover:bg-muted/30",
      )}
      onClick={onToggleExpand}
    >
      {/* Icon */}
      <span className="text-lg w-7 text-center shrink-0">
        {collection.icon ?? <FolderOpen className="size-4 text-muted-foreground mx-auto" />}
      </span>

      {/* Name */}
      <span className="flex-1 min-w-0 text-sm font-medium truncate">
        {collection.name}
      </span>

      {/* Book count */}
      <Badge variant="secondary" className="rounded-full text-xs font-normal tabular-nums">
        {collection.book_count}
      </Badge>

      {/* Expand chevron */}
      <div className="text-muted-foreground">
        {isExpanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </div>

      {/* Actions dropdown */}
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 rounded-md">
            <DropdownMenuItem onClick={onEdit} className="gap-2">
              <Pencil className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive gap-2"
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your books into groups.
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

      {/* Loading */}
      {collectionsQuery.isLoading && (
        <div className="border border-border rounded-md bg-card overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                i < 3 && "border-b border-border",
              )}
            >
              <div className="size-7 rounded bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-muted rounded animate-pulse w-1/3" />
              </div>
              <div className="h-5 w-8 bg-muted rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!collectionsQuery.isLoading && collections.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <FolderPlus className="size-8 text-muted-foreground/30 mb-3" />
          <h3 className="text-lg font-medium">
            No collections yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm text-center">
            Create your first collection to start organizing your books into
            groups. Use collections for genres, reading lists, or any grouping
            you like.
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

      {/* Collections list */}
      {!collectionsQuery.isLoading && collections.length > 0 && (
        <div className="border border-border rounded-md bg-card overflow-hidden divide-y divide-border">
          {collections.map((collection) => (
            <React.Fragment key={collection.id}>
              <CollectionRow
                collection={collection}
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

              {expandedId === collection.id && (
                <div className="border-t border-border">
                  <CollectionExpanded
                    collection={collection}
                    onClose={() => setExpandedId(null)}
                  />
                </div>
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
