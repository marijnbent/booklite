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
import { GridSkeleton, ListSkeleton } from "@/components/library/LibrarySkeletons";
import {
  CreateCollectionDialog,
  EditCollectionDialog,
  AddBooksDialog,
} from "@/components/library/LibraryCollectionDialogs";
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

const SORT_LABELS: Record<SortOption, string> = {
  created: "Newest uploads",
  updated: "Recently updated",
  title: "Title (A-Z)",
  author: "Author (A-Z)",
};

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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {activeCollection
              ? `${activeCollection.icon ? activeCollection.icon + " " : ""}${activeCollection.name} \u00b7 ${statusCounts.ALL} books`
              : `${statusCounts.ALL} books${statusCounts.READING > 0 ? ` \u00b7 ${statusCounts.READING} reading` : ""}`}
          </p>
        </div>
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

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            placeholder="Search..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 rounded-lg border-border/70 bg-background pl-9 pr-8 text-sm placeholder:text-muted-foreground/60"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="h-9 w-auto rounded-lg border-border/70 bg-background px-3 text-sm" aria-label={`Sort by: ${SORT_LABELS[sort]}`}>
              <div className="flex items-center gap-2 text-left">
                <ArrowDownAZ className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="font-medium text-foreground">{SORT_LABELS[sort]}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">{SORT_LABELS.created}</SelectItem>
              <SelectItem value="updated">{SORT_LABELS.updated}</SelectItem>
              <SelectItem value="title">{SORT_LABELS.title}</SelectItem>
              <SelectItem value="author">{SORT_LABELS.author}</SelectItem>
            </SelectContent>
          </Select>

          <div className="h-5 w-px bg-border/60" />

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as ViewMode); }}
            className="h-9 rounded-lg border border-border/70 bg-background p-0.5"
          >
            <ToggleGroupItem value="grid" aria-label="Grid" className="size-8 rounded-md text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground">
              <Grid3X3 className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List" className="size-8 rounded-md text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground">
              <List className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            variant={selectionActive ? "secondary" : "ghost"}
            size="sm"
            className="h-9 gap-1.5 rounded-lg px-2.5 text-sm"
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
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {config && <config.icon className="size-3.5" />}
              {statusFilterLabels[status]}
              <span className={cn(
                "text-[11px] tabular-nums font-normal",
                active ? "text-primary/70" : "text-muted-foreground/60",
              )}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Collection filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-px">
        <button
          onClick={() => setSelectedCollectionId(null)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
            selectedCollectionId === null
              ? "bg-primary/10 text-primary"
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
                "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
                selectedCollectionId === col.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {renderCollectionIcon(col)}
              {col.name}
              <span className={cn(
                "text-[11px] tabular-nums font-normal",
                selectedCollectionId === col.id ? "text-primary/70" : "text-muted-foreground/60",
              )}>{col.book_count}</span>
            </button>
          ) : (
            <ContextMenu key={col.id}>
              <ContextMenuTrigger asChild>
                <button
                  onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
                    selectedCollectionId === col.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {renderCollectionIcon(col)}
                  {col.name}
                  <span className={cn(
                    "text-[11px] tabular-nums font-normal",
                    selectedCollectionId === col.id ? "text-primary/70" : "text-muted-foreground/60",
                  )}>{col.book_count}</span>
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
          className="shrink-0 flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-colors duration-150"
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
