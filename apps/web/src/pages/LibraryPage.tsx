import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, apiFetchRaw } from "@/lib/api";
import { sourceLabel } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import {
  ShareSelectedBooksDialog,
} from "@/components/library/BookShareControls";
import { BookDetailDrawer } from "@/components/library/BookDetailDrawer";
import { GridCard, ListRow, SelectionToolbar } from "@/components/library/LibraryBookViews";
import { useLibrarySelection } from "@/components/library/useLibrarySelection";
import {
  BookCollectionAssignment,
  BookCover,
  BookItem,
  BookPages,
  CollectionItem,
  MetadataPreview,
  PAGE_SIZE,
  PanelCoverOption,
  SHARED_WITH_ME_COLLECTION_ID,
  UNCOLLECTED_COLLECTION_ID,
  ViewMode,
  SortOption,
  StatusFilter,
  buildPanelCoverOptions,
  detailStatusOptions,
  formatSize,
  getStatusFilterBucket,
  isVirtualCollection,
  renderCollectionIcon,
  sortBooks,
  statusConfig,
  statusFilterLabels,
  statusFilterOptions,
  updateBookInData,
} from "@/components/library/libraryShared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertCircle,
  ArrowDownAZ,
  Book,
  BookMarked,
  Check,
  CheckSquare,
  ChevronDown,
  Grid3X3,
  List,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="space-y-2.5">
        <div className="aspect-[2/3] rounded-lg bg-muted/40 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 rounded-full bg-muted/40 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded-full bg-muted/30 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const ListSkeleton: React.FC = () => (
  <div className="space-y-1">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
        <div className="h-12 w-8 shrink-0 rounded bg-muted/40" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-2/5 rounded bg-muted/40" />
          <div className="h-2.5 w-1/4 rounded bg-muted/30" />
        </div>
      </div>
    ))}
  </div>
);

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

const EditCollectionDialog: React.FC<{
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

const AddBooksDialog: React.FC<{
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

// ---------------------------------------------------------------------------
// Shared context menu items for books
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("created");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({ title: "", author: "", series: "", description: "" });
  const [coverOptionsRequested, setCoverOptionsRequested] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [refreshMetadataStatus, setRefreshMetadataStatus] = useState<"idle" | "refreshing" | "done" | "error">("idle");

  // Collection state
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionItem | null>(null);
  const [addBooksDialogOpen, setAddBooksDialogOpen] = useState(false);
  const [sharingSelectionOpen, setSharingSelectionOpen] = useState(false);

  const suppressNextBookClickRef = useRef(false);

  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Collections
  const collectionsQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections?includeVirtual=true"),
  });

  const collections = collectionsQuery.data ?? [];
  const orderedCollections = useMemo(() => {
    const builtInOrder = ["favorites", "shared-with-me", "uncollected"];
    const builtIns = builtInOrder
      .map((slug) => collections.find((collection) => collection.slug === slug))
      .filter((collection): collection is CollectionItem => Boolean(collection));
    const builtInIds = new Set(builtIns.map((collection) => collection.id));
    const customCollections = collections.filter((collection) => !builtInIds.has(collection.id));
    return [...builtIns, ...customCollections];
  }, [collections]);

  const deleteCollectionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/api/v1/collections/${id}`, { method: "DELETE" });
    },
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      if (selectedCollectionId === id) setSelectedCollectionId(null);
    },
  });

  // Books (all — used when no collection is selected)
  const booksQuery = useInfiniteQuery({
    queryKey: ["books", debouncedQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (debouncedQuery) params.set("q", debouncedQuery);
      return apiFetch<BookItem[]>(`/api/v1/books?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
    enabled: selectedCollectionId === null,
  });

  // Books (collection)
  const collectionBooksQuery = useQuery({
    queryKey: ["collection-books", selectedCollectionId],
    queryFn: () => apiFetch<BookItem[]>(`/api/v1/collections/${selectedCollectionId}/books`),
    enabled:
      selectedCollectionId !== null &&
      selectedCollectionId !== SHARED_WITH_ME_COLLECTION_ID &&
      selectedCollectionId !== UNCOLLECTED_COLLECTION_ID,
  });

  const uncollectedBooksQuery = useQuery({
    queryKey: ["collection-books", "uncollected"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/collections/uncollected/books"),
    enabled: selectedCollectionId === UNCOLLECTED_COLLECTION_ID,
  });

  const sharedWithMeBooksQuery = useQuery({
    queryKey: ["collection-books", "shared-with-me"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/collections/shared-with-me/books"),
    enabled: selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID,
  });

  // Infinite scroll
  useEffect(() => {
    if (selectedCollectionId !== null) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && booksQuery.hasNextPage && !booksQuery.isFetchingNextPage) {
          void booksQuery.fetchNextPage();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedCollectionId, booksQuery.hasNextPage, booksQuery.isFetchingNextPage, booksQuery.fetchNextPage]);

  const allBooks = useMemo(() => {
    if (selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID) {
      let books = sharedWithMeBooksQuery.data ?? [];
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        books = books.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            (b.author?.toLowerCase().includes(q) ?? false),
        );
      }
      return books;
    }

    if (selectedCollectionId === UNCOLLECTED_COLLECTION_ID) {
      let books = uncollectedBooksQuery.data ?? [];
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        books = books.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            (b.author?.toLowerCase().includes(q) ?? false),
        );
      }
      return books;
    }

    if (selectedCollectionId !== null) {
      let books = collectionBooksQuery.data ?? [];
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        books = books.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            (b.author?.toLowerCase().includes(q) ?? false),
        );
      }
      return books;
    }
    return booksQuery.data?.pages.flat() ?? [];
  }, [
    selectedCollectionId,
    collectionBooksQuery.data,
    sharedWithMeBooksQuery.data,
    uncollectedBooksQuery.data,
    booksQuery.data,
    debouncedQuery,
  ]);

  const collectionBookIds = useMemo(
    () =>
      selectedCollectionId !== null && selectedCollectionId !== UNCOLLECTED_COLLECTION_ID
      && selectedCollectionId !== SHARED_WITH_ME_COLLECTION_ID
        ? new Set((collectionBooksQuery.data ?? []).map((b) => b.id))
        : new Set<number>(),
    [selectedCollectionId, collectionBooksQuery.data],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { ALL: 0, UNREAD: 0, READING: 0, READ: 0, ABANDONED: 0 };
    for (const book of allBooks) {
      counts[getStatusFilterBucket(book.progress?.status)]++;
      counts.ALL++;
    }
    return counts;
  }, [allBooks]);

  const filteredAndSorted = useMemo(() => {
    let result = allBooks;
    if (statusFilter !== "ALL") {
      result = result.filter((b) => getStatusFilterBucket(b.progress?.status) === statusFilter);
    }
    return [...result].sort((a, b) => sortBooks(a, b, sort));
  }, [allBooks, statusFilter, sort]);

  const filteredBookIds = useMemo(
    () => filteredAndSorted.map((book) => book.id),
    [filteredAndSorted],
  );
  const selectionResetKey = `${selectedCollectionId ?? "all"}:${statusFilter}:${debouncedQuery}`;
  const {
    selectedBookIds,
    selectionMode,
    setSelectionMode,
    selectionActive,
    clearSelection,
    handleBookClick,
    handleToggleSelect,
  } = useLibrarySelection({
    filteredBookIds,
    resetKey: selectionResetKey,
    onOpenBook: setSelectedBookId,
    onSelectionInactive: () => setSharingSelectionOpen(false),
    onMultipleSelected: () => setSelectedBookId(null),
  });

  const selectedBooks = useMemo(
    () => filteredAndSorted.filter((book) => selectedBookIds.has(book.id)),
    [filteredAndSorted, selectedBookIds],
  );
  const selectedOwnedBooks = useMemo(
    () => selectedBooks.filter((book) => !book.isShared),
    [selectedBooks],
  );

  // Detail panel queries
  const selectedBook = useQuery({
    queryKey: ["books", "detail", selectedBookId],
    queryFn: () => apiFetch<BookItem>(`/api/v1/books/${selectedBookId}`),
    enabled: selectedBookId !== null,
  });

  const bookCollections = useQuery({
    queryKey: ["books", selectedBookId, "collections"],
    queryFn: () => apiFetch<BookCollectionAssignment[]>(`/api/v1/books/${selectedBookId}/collections`),
    enabled: selectedBookId !== null,
  });

  const coverPreviewQuery = useQuery({
    queryKey: [
      "books",
      selectedBookId,
      "cover-preview",
      selectedBook.data?.title,
      selectedBook.data?.author,
    ],
    queryFn: () =>
      apiFetch<MetadataPreview>("/api/v1/metadata/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: selectedBook.data?.title ?? "",
          author: selectedBook.data?.author ?? undefined,
        }),
      }),
    enabled:
      selectedBookId !== null &&
      coverOptionsRequested &&
      Boolean(selectedBook.data?.title),
  });

  useEffect(() => {
    if (!selectedBook.data) return;
    setDraft({
      title: selectedBook.data.title,
      author: selectedBook.data.author ?? "",
      series: selectedBook.data.series ?? "",
      description: selectedBook.data.description ?? "",
    });
    setCoverOptionsRequested(false);
    setEditMode(false);
    setDescriptionExpanded(false);
    setRefreshMetadataStatus("idle");
  }, [selectedBook.data]);

  // Mutations
  const saveMetadata = useMutation({
    mutationFn: async () => {
      if (!selectedBookId) return;
      await apiFetch(`/api/v1/books/${selectedBookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim() || "Untitled",
          author: draft.author.trim() || null,
          series: draft.series.trim() || null,
          description: draft.description.trim() || null,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["collection-books"] });
      void queryClient.invalidateQueries({ queryKey: ["books", "detail", selectedBookId] });
      setEditMode(false);
    },
  });

  const setBookCover = useMutation({
    mutationFn: async (coverPath: string | null) => {
      if (!selectedBookId) return;
      await apiFetch(`/api/v1/books/${selectedBookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coverPath }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["books"] }),
        queryClient.invalidateQueries({ queryKey: ["collection-books"] }),
        queryClient.invalidateQueries({ queryKey: ["books", "detail", selectedBookId] }),
      ]);
    },
  });

  const invalidateBookLists = useCallback((bookId?: number) => {
    void queryClient.invalidateQueries({ queryKey: ["books"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-books"] });
    if (typeof bookId === "number") {
      void queryClient.invalidateQueries({ queryKey: ["books", "detail", bookId] });
    }
  }, [queryClient]);

  const invalidateCollections = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
  }, [queryClient]);

  const invalidateBookCollections = useCallback((bookId: number) => {
    void queryClient.invalidateQueries({ queryKey: ["books", bookId, "collections"] });
  }, [queryClient]);

  const patchVisibleBook = useCallback(
    (bookId: number, updater: (book: BookItem) => BookItem) => {
      queryClient.setQueryData(["books", debouncedQuery], (current: BookPages | undefined) =>
        updateBookInData(current, bookId, updater)
      );

      if (selectedCollectionId === UNCOLLECTED_COLLECTION_ID) {
        queryClient.setQueryData(["collection-books", "uncollected"], (current: BookItem[] | undefined) =>
          updateBookInData(current, bookId, updater)
        );
      } else if (selectedCollectionId !== null) {
        queryClient.setQueryData(["collection-books", selectedCollectionId], (current: BookItem[] | undefined) =>
          updateBookInData(current, bookId, updater)
        );
      }

      queryClient.setQueryData(["books", "detail", bookId], (current: BookItem | undefined) =>
        updateBookInData(current, bookId, updater)
      );
    },
    [debouncedQuery, queryClient, selectedCollectionId],
  );

  const handleShareCountChange = useCallback(
    (bookId: number, delta: number) => {
      patchVisibleBook(bookId, (book) => ({
        ...book,
        shareCount: Math.max(0, (book.shareCount ?? 0) + delta),
      }));
      invalidateBookLists(bookId);
    },
    [invalidateBookLists, patchVisibleBook],
  );

  const changeStatus = useCallback(
    async (bookId: number, status: string) => {
      await apiFetch(`/api/v1/books/${bookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      invalidateBookLists(bookId);
    },
    [invalidateBookLists],
  );

  const refreshMetadata = useCallback(
    async (bookId: number) => {
      setRefreshMetadataStatus("refreshing");
      try {
        await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, { method: "POST" });
        invalidateBookLists(bookId);
        setRefreshMetadataStatus("done");
        setTimeout(() => setRefreshMetadataStatus("idle"), 2000);
      } catch {
        setRefreshMetadataStatus("error");
        setTimeout(() => setRefreshMetadataStatus("idle"), 3000);
      }
    },
    [invalidateBookLists],
  );

  const deleteBook = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}`, { method: "DELETE" });
      if (selectedBookId === bookId) {
        setSelectedBookId(null);
        setEditMode(false);
        setCoverOptionsRequested(false);
      }
      if (selectedBookIds.has(bookId)) setSharingSelectionOpen(false);
      invalidateBookLists();
      invalidateCollections();
    },
    [invalidateBookLists, invalidateCollections, selectedBookId, selectedBookIds],
  );

  const removeSharedBook = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}/share`, { method: "DELETE" });
      if (selectedBookId === bookId) {
        setSelectedBookId(null);
        setEditMode(false);
        setCoverOptionsRequested(false);
      }
      if (selectedBookIds.has(bookId)) setSharingSelectionOpen(false);
      invalidateBookLists(bookId);
      invalidateCollections();
    },
    [invalidateBookLists, invalidateCollections, selectedBookId, selectedBookIds],
  );

  const toggleFavorite = useCallback(
    async (bookId: number, favorite: boolean) => {
      await apiFetch(`/api/v1/books/${bookId}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      patchVisibleBook(bookId, (book) => ({ ...book, isFavorite: favorite }));
      invalidateBookLists(bookId);
      invalidateCollections();
    },
    [invalidateBookLists, invalidateCollections, patchVisibleBook],
  );

  const addToCollection = useCallback(
    async (bookId: number, collectionId: number) => {
      await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, { method: "POST" });
      invalidateBookCollections(bookId);
      invalidateBookLists(bookId);
      invalidateCollections();
    },
    [invalidateBookCollections, invalidateBookLists, invalidateCollections],
  );

  const removeFromCollection = useCallback(
    async (bookId: number, collectionId: number) => {
      await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, { method: "DELETE" });
      invalidateBookCollections(bookId);
      invalidateBookLists(bookId);
      invalidateCollections();
    },
    [invalidateBookCollections, invalidateBookLists, invalidateCollections],
  );

  const setCollectionAssigned = useCallback(
    async (collectionId: number, assigned: boolean) => {
      if (!selectedBookId || !bookCollections.data) return;
      const currentIds = bookCollections.data.filter((c) => c.assigned).map((c) => c.id);
      const nextIds = assigned
        ? [...currentIds, collectionId]
        : currentIds.filter((id) => id !== collectionId);

      await apiFetch(`/api/v1/books/${selectedBookId}/collections`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionIds: [...new Set(nextIds)] }),
      });
      invalidateBookCollections(selectedBookId);
      invalidateBookLists(selectedBookId);
      invalidateCollections();
    },
    [selectedBookId, bookCollections.data, invalidateBookCollections, invalidateBookLists, invalidateCollections],
  );

  const handleDownload = useCallback(async (bookId: number) => {
    const response = await apiFetchRaw(`/api/v1/books/${bookId}/download`);
    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] ?? `book-${bookId}`;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, []);

  const openReader = useCallback(
    (bookId: number) => {
      window.open(`/library/${bookId}/read`, "_blank");
    },
    [],
  );

  const suppressBookClickOnce = useCallback(() => {
    suppressNextBookClickRef.current = true;
    window.setTimeout(() => {
      suppressNextBookClickRef.current = false;
    }, 0);
  }, []);

  const isLoading = selectedCollectionId !== null
    ? selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID
      ? sharedWithMeBooksQuery.isLoading
      : selectedCollectionId === UNCOLLECTED_COLLECTION_ID
      ? uncollectedBooksQuery.isLoading
      : collectionBooksQuery.isLoading
    : booksQuery.isLoading;
  const isError = selectedCollectionId !== null
    ? selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID
      ? sharedWithMeBooksQuery.isError
      : selectedCollectionId === UNCOLLECTED_COLLECTION_ID
      ? uncollectedBooksQuery.isError
      : collectionBooksQuery.isError
    : booksQuery.isError;
  const isEmpty = !isLoading && allBooks.length === 0;
  const hasResults = !isLoading && filteredAndSorted.length > 0;
  const noFilterResults = !isLoading && allBooks.length > 0 && filteredAndSorted.length === 0;
  const panelBook = selectedBook.data;
  const activeCollection = collections.find((c) => c.id === selectedCollectionId);
  const activeCollectionIsVirtual = isVirtualCollection(activeCollection);
  const panelCoverOptions = useMemo(
    () => buildPanelCoverOptions(panelBook?.coverPath ?? null, coverPreviewQuery.data?.coverOptions),
    [panelBook?.coverPath, coverPreviewQuery.data?.coverOptions],
  );
  const drawerCoverOptions = useMemo(
    () => panelCoverOptions.map((option) => ({
      ...option,
      badgeLabel: option.label,
      metaLabel: option.label === "Current cover" ? "Saved on this book" : sourceLabel(option.source),
    })),
    [panelCoverOptions],
  );

  // Shared menu item props for context/dropdown menus
  const bookMenuProps = useMemo(
    () => ({
      collections,
      activeCollectionId: selectedCollectionId,
      onSelect: setSelectedBookId,
      onToggleFavorite: (id: number, fav: boolean) => void toggleFavorite(id, fav),
      onStatusChange: (id: number, status: string) => void changeStatus(id, status),
      onRefreshMetadata: (id: number) => void refreshMetadata(id),
      onDownload: (id: number) => void handleDownload(id),
      onShareCountChange: handleShareCountChange,
      onRemoveShare: (id: number) => void removeSharedBook(id),
      onAddToCollection: (bookId: number, collectionId: number) => void addToCollection(bookId, collectionId),
      onRemoveFromCollection: (bookId: number, collectionId: number) => void removeFromCollection(bookId, collectionId),
      onDelete: (id: number) => void deleteBook(id),
      onMenuAction: suppressBookClickOnce,
      onBookClick: (id: number, event: React.MouseEvent) =>
        handleBookClick(id, event, suppressNextBookClickRef),
      onToggleSelect: handleToggleSelect,
    }),
    [collections, selectedCollectionId, toggleFavorite, changeStatus, refreshMetadata, handleDownload, handleShareCountChange, removeSharedBook, addToCollection, removeFromCollection, deleteBook, suppressBookClickOnce, handleBookClick, handleToggleSelect],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCollection
              ? `${activeCollection.icon ? activeCollection.icon + " " : ""}${activeCollection.name} \u00b7 ${statusCounts.ALL} books`
              : `${statusCounts.ALL} books${statusCounts.READING > 0 ? ` \u00b7 ${statusCounts.READING} reading` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeCollection && !activeCollectionIsVirtual && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setAddBooksDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              Add books
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="h-9 w-[190px] text-xs">
              <ArrowDownAZ className="size-3.5 text-muted-foreground/60" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Upload date: new first</SelectItem>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="title">Title A-Z</SelectItem>
              <SelectItem value="author">Author A-Z</SelectItem>
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as ViewMode); }}
            className="border border-border rounded-md p-0.5"
          >
            <ToggleGroupItem value="grid" aria-label="Grid" className="size-8 data-[state=on]:bg-accent">
              <Grid3X3 className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List" className="size-8 data-[state=on]:bg-accent">
              <List className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant={selectionActive ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => {
              if (selectionActive) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
          >
            <CheckSquare className="size-3.5" />
            Select
          </Button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-px">
        {statusFilterOptions.map((status) => {
          const active = statusFilter === status;
          const count = statusCounts[status];
          const config = status === "ALL" ? null : statusConfig[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
                active
                  ? "bg-primary/12 text-primary ring-1 ring-primary/25 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {config && <config.icon className="size-3" />}
              {statusFilterLabels[status]}
              <span className="text-[10px] tabular-nums opacity-50">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Collection filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-px">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium mr-1">Collections</span>
        <button
          onClick={() => setSelectedCollectionId(null)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
            selectedCollectionId === null
              ? "bg-primary/12 text-primary ring-1 ring-primary/25 shadow-sm"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          All
        </button>
        {orderedCollections.map((col) =>
          isVirtualCollection(col) ? (
            <button
              key={col.id}
              onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
                selectedCollectionId === col.id
                  ? "bg-primary/12 text-primary ring-1 ring-primary/25 shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {renderCollectionIcon(col)}
              {col.name}
              <span className="text-[10px] tabular-nums ml-0.5 opacity-40">
                {col.book_count}
              </span>
            </button>
          ) : (
            <ContextMenu key={col.id}>
              <ContextMenuTrigger asChild>
                <button
                  onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
                    selectedCollectionId === col.id
                      ? "bg-primary/12 text-primary ring-1 ring-primary/25 shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {renderCollectionIcon(col)}
                  {col.name}
                  <span className="text-[10px] tabular-nums ml-0.5 opacity-40">
                    {col.book_count}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                <ContextMenuItem
                  onClick={() => { setSelectedCollectionId(col.id); setAddBooksDialogOpen(true); }}
                  className="gap-2 text-xs"
                >
                  <Plus className="size-3.5" />
                  Add books
                </ContextMenuItem>
                {col.is_system !== 1 && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => setEditingCollection(col)} className="gap-2 text-xs">
                      <Pencil className="size-3.5" />
                      Edit
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => {
                        if (window.confirm(`Delete "${col.name}"? Books won't be removed from your library.`))
                          deleteCollectionMutation.mutate(col.id);
                      }}
                      className="text-destructive focus:text-destructive gap-2 text-xs"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
            </ContextMenu>
          )
        )}
        <button
          onClick={() => setCreateCollectionOpen(true)}
          className="shrink-0 flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-all duration-150"
          title="New collection"
        >
          <Plus className="size-3.5" />
          {collections.filter((collection) => !isVirtualCollection(collection)).length === 0 && <span>New collection</span>}
        </button>

      </div>

      {/* Content */}
      {isLoading && (view === "grid" ? <GridSkeleton /> : <ListSkeleton />)}

      {isError && (
        <div className="flex flex-col items-center py-20">
          <AlertCircle className="mb-3 size-6 text-destructive/40" />
          <p className="text-sm font-medium">Could not load library</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => {
              if (selectedCollectionId === UNCOLLECTED_COLLECTION_ID) {
                void uncollectedBooksQuery.refetch();
              } else if (selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID) {
                void sharedWithMeBooksQuery.refetch();
              } else if (selectedCollectionId !== null) {
                void collectionBooksQuery.refetch();
              }
              else void booksQuery.refetch();
            }}
          >
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center py-20">
          <BookMarked className="mb-3 size-8 text-muted-foreground/20" />
          <p className="text-sm font-medium">
            {debouncedQuery
              ? "No results"
              : selectedCollectionId !== null
                ? selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID
                  ? "No books shared with you"
                  : selectedCollectionId === UNCOLLECTED_COLLECTION_ID
                  ? "No uncollected books"
                  : "This collection is empty"
                : "Your library is empty"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {debouncedQuery
              ? "Try a different search."
              : selectedCollectionId !== null
                ? selectedCollectionId === SHARED_WITH_ME_COLLECTION_ID
                  ? "Books appear here as soon as someone shares them with you."
                  : selectedCollectionId === UNCOLLECTED_COLLECTION_ID
                  ? "Books disappear from this shelf as soon as they are added to a collection."
                  : "Add books using the button above or right-click a book."
                : "Upload some books to get started."}
          </p>
          {selectedCollectionId !== null && !debouncedQuery && !activeCollectionIsVirtual && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setAddBooksDialogOpen(true)}
            >
              <Plus className="size-3.5" />
              Add books
            </Button>
          )}
        </div>
      )}

      {noFilterResults && (
        <div className="flex flex-col items-center py-16">
          <p className="text-sm text-muted-foreground">
            {statusFilter === "ALL"
              ? "No books"
              : `No books marked "${statusFilterLabels[statusFilter].toLowerCase()}"`}
            {debouncedQuery && ` matching "${debouncedQuery}"`}.
          </p>
          <button onClick={() => setStatusFilter("ALL")} className="mt-2 text-sm text-primary hover:underline">
            Show all
          </button>
        </div>
      )}

      {hasResults && view === "grid" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {filteredAndSorted.map((book) => (
            <GridCard
              key={book.id}
              book={book}
              menuProps={bookMenuProps}
              isSelected={selectedBookIds.has(book.id)}
              selectionActive={selectionActive}
            />
          ))}
        </div>
      )}

      {hasResults && view === "list" && (
        <div className="space-y-0.5">
          {filteredAndSorted.map((book) => (
            <ListRow
              key={book.id}
              book={book}
              menuProps={bookMenuProps}
              isSelected={selectedBookIds.has(book.id)}
              selectionActive={selectionActive}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-px" />
      {selectedCollectionId === null && booksQuery.isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      )}

      {/* Selection toolbar */}
      {selectionActive && (
        <SelectionToolbar
          selectedCount={selectedBookIds.size}
          selectedBooks={selectedBooks}
          collections={collections}
          onAddToCollection={async (collectionId) => {
            await Promise.all([...selectedBookIds].map((id) => addToCollection(id, collectionId)));
            clearSelection();
          }}
          onSetStatus={async (status) => {
            await Promise.all([...selectedBookIds].map((id) => changeStatus(id, status)));
            clearSelection();
          }}
          onShare={() => setSharingSelectionOpen(true)}
          onRefreshMetadata={async () => {
            await Promise.all(selectedOwnedBooks.map((book) => refreshMetadata(book.id)));
            clearSelection();
          }}
          onDownload={async () => {
            for (const id of selectedBookIds) await handleDownload(id);
            clearSelection();
          }}
          onDelete={async () => {
            const count = selectedOwnedBooks.length;
            if (!window.confirm(`Delete ${count} book${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
            await Promise.all(selectedOwnedBooks.map((book) => deleteBook(book.id)));
            clearSelection();
          }}
          onClear={clearSelection}
        />
      )}

      {/* Detail drawer */}
      <BookDetailDrawer
        open={selectedBookId !== null}
        panelBook={panelBook}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBookId(null);
            setEditMode(false);
          }
        }}
        refreshMetadataStatus={refreshMetadataStatus}
        onToggleFavorite={() => {
          if (panelBook) void toggleFavorite(panelBook.id, !panelBook.isFavorite);
        }}
        onRefreshMetadata={() => {
          if (panelBook) void refreshMetadata(panelBook.id);
        }}
        onDelete={() => {
          if (panelBook && window.confirm(`Delete "${panelBook.title}"? This cannot be undone.`)) {
            void deleteBook(panelBook.id);
          }
        }}
        onRemoveSharedBook={() => {
          if (panelBook) void removeSharedBook(panelBook.id);
        }}
        onMenuAction={suppressBookClickOnce}
        coverOptionsRequested={coverOptionsRequested}
        onToggleCoverOptions={() => setCoverOptionsRequested((current) => !current)}
        coverOptionsLoading={coverPreviewQuery.isLoading}
        coverOptions={drawerCoverOptions}
        onSelectCover={(coverPath) => {
          setBookCover.mutate(coverPath);
        }}
        onClearCover={() => {
          setBookCover.mutate(null);
        }}
        setBookCoverPending={setBookCover.isPending}
        statusOptions={detailStatusOptions}
        statusValue={panelBook ? getStatusFilterBucket(panelBook.progress?.status) : "UNREAD"}
        onStatusChange={(status) => {
          if (panelBook) void changeStatus(panelBook.id, status);
        }}
        onRead={() => {
          if (panelBook) openReader(panelBook.id);
        }}
        onDownload={() => {
          if (panelBook) void handleDownload(panelBook.id);
        }}
        onShareCountChange={handleShareCountChange}
        fileSizeLabel={panelBook ? formatSize(panelBook.fileSize) : ""}
        descriptionExpanded={descriptionExpanded}
        setDescriptionExpanded={setDescriptionExpanded}
        bookCollectionsLoading={bookCollections.isLoading}
        bookCollections={bookCollections.data ?? []}
        onToggleCollectionAssigned={(collectionId, assigned) => {
          void setCollectionAssigned(collectionId, assigned);
        }}
        renderCollectionIcon={renderCollectionIcon}
        editMode={editMode}
        setEditMode={setEditMode}
        draft={draft}
        setDraft={setDraft}
        onSaveMetadata={() => saveMetadata.mutate()}
        saveMetadataPending={saveMetadata.isPending}
        BookCover={BookCover}
      />

      {/* Collection dialogs */}
      <CreateCollectionDialog open={createCollectionOpen} onOpenChange={setCreateCollectionOpen} />
      {editingCollection && (
        <EditCollectionDialog
          collection={editingCollection}
          open={!!editingCollection}
          onOpenChange={(open) => { if (!open) setEditingCollection(null); }}
        />
      )}
      {activeCollection && !activeCollectionIsVirtual && (
        <AddBooksDialog
          collection={activeCollection}
          existingBookIds={collectionBookIds}
          open={addBooksDialogOpen}
          onOpenChange={setAddBooksDialogOpen}
        />
      )}
      <ShareSelectedBooksDialog
        bookIds={selectedOwnedBooks.map((book) => book.id)}
        open={sharingSelectionOpen}
        onOpenChange={setSharingSelectionOpen}
      />
    </div>
  );
};
