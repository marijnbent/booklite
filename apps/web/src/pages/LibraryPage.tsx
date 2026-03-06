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
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertCircle,
  ArrowDownAZ,
  Book,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Download,
  FolderOpen,
  Grid3X3,

  List,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Star,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
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

type StatusFilter = "ALL" | "UNREAD" | "READING" | "DONE";
type SortOption = "updated" | "title" | "author";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Status configuration
// ---------------------------------------------------------------------------

const statusConfig = {
  UNREAD: {
    label: "Unread",
    icon: Book,
    variant: "secondary" as const,
    color: "text-muted-foreground",
  },
  READING: {
    label: "Reading",
    icon: BookOpen,
    variant: "info" as const,
    color: "text-status-processing",
  },
  DONE: {
    label: "Done",
    icon: CheckCircle2,
    variant: "success" as const,
    color: "text-status-completed",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic hue from a book id for gradient fallback covers. */
function coverHue(id: number): number {
  return ((id * 137.508) % 360 + 360) % 360;
}

/** Format bytes to human-readable string. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side sort comparator. */
function sortBooks(a: BookItem, b: BookItem, sort: SortOption): number {
  switch (sort) {
    case "title":
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    case "author":
      return (a.author ?? "").localeCompare(b.author ?? "", undefined, {
        sensitivity: "base",
      });
    case "updated":
    default:
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Shared cover image / fallback component. */
const BookCover: React.FC<{
  book: Pick<BookItem, "id" | "title" | "coverPath">;
  className?: string;
  /** Show a faded icon + title text in the fallback. */
  showFallbackText?: boolean;
}> = ({ book, className, showFallbackText = true }) => {
  const [imgError, setImgError] = useState(false);
  const hue = coverHue(book.id);

  if (book.coverPath && !imgError) {
    return (
      <img
        src={book.coverPath}
        alt={book.title}
        loading="lazy"
        onError={() => setImgError(true)}
        className={cn("object-cover", className)}
      />
    );
  }

  // Deterministic gradient fallback
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-4",
        className
      )}
      style={{
        background: `linear-gradient(135deg, oklch(0.35 0.08 ${hue}) 0%, oklch(0.22 0.06 ${hue + 40}) 100%)`,
      }}
    >
      <Book className="size-8 text-white/20" />
      {showFallbackText && (
        <span className="text-[11px] font-medium text-white/40 text-center leading-tight line-clamp-3 max-w-[80%]">
          {book.title}
        </span>
      )}
    </div>
  );
};

/** Skeleton card for grid view loading state. */
const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="space-y-3">
        <div
          className="aspect-[2/3] rounded-xl bg-muted/50 animate-pulse"
          style={{ animationDelay: `${i * 60}ms` }}
        />
        <div className="space-y-2 px-0.5">
          <div className="h-3.5 w-3/4 rounded bg-muted/50 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted/40 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

/** Skeleton rows for list view loading state. */
const ListSkeleton: React.FC = () => (
  <div className="space-y-2">
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-4 rounded-xl bg-muted/30 p-3 animate-pulse"
        style={{ animationDelay: `${i * 50}ms` }}
      >
        <div className="h-14 w-10 shrink-0 rounded-md bg-muted/50" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/5 rounded bg-muted/50" />
          <div className="h-3 w-1/4 rounded bg-muted/40" />
        </div>
        <div className="h-5 w-14 rounded bg-muted/40" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
  // --- State ---------------------------------------------------------------
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    author: "",
    series: "",
    description: "",
  });

  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // --- Debounced search ----------------------------------------------------
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // --- Infinite query ------------------------------------------------------
  const booksQuery = useInfiniteQuery({
    queryKey: ["books", debouncedQuery],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      return apiFetch<BookItem[]>(`/api/v1/books?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.reduce((sum, page) => sum + page.length, 0);
    },
  });

  // --- IntersectionObserver for infinite scroll ----------------------------
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          booksQuery.hasNextPage &&
          !booksQuery.isFetchingNextPage
        ) {
          void booksQuery.fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [booksQuery.hasNextPage, booksQuery.isFetchingNextPage, booksQuery.fetchNextPage]);

  // --- Derived data --------------------------------------------------------
  const allBooks = useMemo(
    () => booksQuery.data?.pages.flat() ?? [],
    [booksQuery.data]
  );

  const statusCounts = useMemo(() => {
    const counts = { ALL: 0, UNREAD: 0, READING: 0, DONE: 0 };
    for (const book of allBooks) {
      const s = book.progress?.status ?? "UNREAD";
      counts[s]++;
      counts.ALL++;
    }
    return counts;
  }, [allBooks]);

  const filteredAndSorted = useMemo(() => {
    let result = allBooks;
    if (statusFilter !== "ALL") {
      result = result.filter(
        (b) => (b.progress?.status ?? "UNREAD") === statusFilter
      );
    }
    return [...result].sort((a, b) => sortBooks(a, b, sort));
  }, [allBooks, statusFilter, sort]);

  // --- Detail panel queries ------------------------------------------------
  const selectedBook = useQuery({
    queryKey: ["books", "detail", selectedBookId],
    queryFn: () => apiFetch<BookItem>(`/api/v1/books/${selectedBookId}`),
    enabled: selectedBookId !== null,
  });

  const bookCollections = useQuery({
    queryKey: ["books", selectedBookId, "collections"],
    queryFn: () =>
      apiFetch<BookCollectionAssignment[]>(
        `/api/v1/books/${selectedBookId}/collections`
      ),
    enabled: selectedBookId !== null,
  });

  // Sync draft when selected book changes
  useEffect(() => {
    if (!selectedBook.data) return;
    setDraft({
      title: selectedBook.data.title,
      author: selectedBook.data.author ?? "",
      series: selectedBook.data.series ?? "",
      description: selectedBook.data.description ?? "",
    });
    setEditMode(false);
  }, [selectedBook.data]);

  // --- Mutations -----------------------------------------------------------
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
      setEditMode(false);
    },
  });

  const changeStatus = useCallback(
    async (bookId: number, status: string) => {
      await apiFetch(`/api/v1/books/${bookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient]
  );

  const changeProgress = useCallback(
    async (bookId: number, progressPercent: number) => {
      await apiFetch(`/api/v1/books/${bookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progressPercent }),
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient]
  );

  const refreshMetadata = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, {
        method: "POST",
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient]
  );

  const refreshAllMetadata = useMutation({
    mutationFn: async () =>
      apiFetch<{
        ok: boolean;
        total: number;
        refreshed: number;
        updated: number;
        matched: number;
        fallback: number;
        failed: number;
      }>("/api/v1/books/metadata/fetch-all", {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const toggleFavorite = useCallback(
    async (bookId: number, favorite: boolean) => {
      await apiFetch(`/api/v1/books/${bookId}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    [queryClient]
  );

  const setCollectionAssigned = useCallback(
    async (collectionId: number, assigned: boolean) => {
      if (!selectedBookId || !bookCollections.data) return;
      const currentIds = bookCollections.data
        .filter((c) => c.assigned)
        .map((c) => c.id);
      const nextIds = assigned
        ? [...currentIds, collectionId]
        : currentIds.filter((id) => id !== collectionId);

      await apiFetch(`/api/v1/books/${selectedBookId}/collections`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionIds: [...new Set(nextIds)] }),
      });
      void queryClient.invalidateQueries({
        queryKey: ["books", selectedBookId, "collections"],
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    [selectedBookId, bookCollections.data, queryClient]
  );

  const handleDownload = useCallback((bookId: number) => {
    window.open(`/api/v1/books/${bookId}/download`, "_blank");
  }, []);

  // --- Render helpers ------------------------------------------------------
  const isLoading = booksQuery.isLoading;
  const isError = booksQuery.isError;
  const isEmpty = !isLoading && allBooks.length === 0;
  const hasResults = !isLoading && filteredAndSorted.length > 0;
  const noFilterResults =
    !isLoading && allBooks.length > 0 && filteredAndSorted.length === 0;

  const panelBook = selectedBook.data;

  // -----------------------------------------------------------------------
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 animate-fade-in">
        {/* ---- Header --------------------------------------------------- */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allBooks.length > 0
              ? `${allBooks.length} book${allBooks.length !== 1 ? "s" : ""} in your collection`
              : "Your personal book collection"}
            {booksQuery.hasNextPage && !isLoading && " (loading more...)"}
          </p>
        </div>

        {/* ---- Toolbar -------------------------------------------------- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search books..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => refreshAllMetadata.mutate()}
              disabled={refreshAllMetadata.isPending}
            >
              {refreshAllMetadata.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Refresh all metadata
            </Button>

            {/* Sort */}
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortOption)}
            >
              <SelectTrigger className="h-8 w-auto gap-1.5 text-xs px-3">
                <ArrowDownAZ className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
                <SelectItem value="author">Author A-Z</SelectItem>
              </SelectContent>
            </Select>

            {/* View toggle */}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => {
                if (v) setView(v as ViewMode);
              }}
            >
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <Grid3X3 className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view">
                <List className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* ---- Status filter tabs --------------------------------------- */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1">
          {(["ALL", "UNREAD", "READING", "DONE"] as const).map((status) => {
            const active = statusFilter === status;
            const count = statusCounts[status];
            const config =
              status === "ALL"
                ? null
                : statusConfig[status as keyof typeof statusConfig];
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 whitespace-nowrap",
                  active
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {config && (
                  <config.icon
                    className={cn("size-3.5", active && config.color)}
                  />
                )}
                <span>{status === "ALL" ? "All" : config?.label}</span>
                <span
                  className={cn(
                    "ml-0.5 text-[11px] tabular-nums",
                    active
                      ? "text-primary/70"
                      : "text-muted-foreground/60"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- Loading state -------------------------------------------- */}
        {isLoading && (view === "grid" ? <GridSkeleton /> : <ListSkeleton />)}

        {/* ---- Error state ---------------------------------------------- */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
              <AlertCircle className="size-8 text-destructive/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground/80">
              Something went wrong
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs text-center">
              We could not load your library. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-1.5"
              onClick={() => void booksQuery.refetch()}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* ---- Empty state ---------------------------------------------- */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 mb-4">
              <BookMarked className="size-10 text-muted-foreground/30" />
            </div>
            <h3 className="text-lg font-semibold text-foreground/80">
              {debouncedQuery ? "No results found" : "No books yet"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs text-center">
              {debouncedQuery
                ? `No books match "${debouncedQuery}". Try a different search.`
                : "Upload your first book to get started."}
            </p>
          </div>
        )}

        {/* ---- No filter results (but we have books) -------------------- */}
        {noFilterResults && (
          <div className="flex flex-col items-center justify-center py-16 animate-fade-up">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/50 mb-3">
              <Book className="size-7 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">
              No{" "}
              <span className="font-medium text-foreground/60">
                {statusFilter.toLowerCase()}
              </span>{" "}
              books
              {debouncedQuery && ` matching "${debouncedQuery}"`}.
            </p>
            <button
              onClick={() => setStatusFilter("ALL")}
              className="mt-2 text-sm text-primary hover:underline underline-offset-2"
            >
              Show all books
            </button>
          </div>
        )}

        {/* ---- Grid view ------------------------------------------------ */}
        {hasResults && view === "grid" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 animate-fade-in">
            {filteredAndSorted.map((book) => (
              <GridCard
                key={book.id}
                book={book}
                onSelect={setSelectedBookId}
                onToggleFavorite={toggleFavorite}
                onStatusChange={changeStatus}
                onRefreshMetadata={refreshMetadata}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* ---- List view ------------------------------------------------ */}
        {hasResults && view === "list" && (
          <div className="space-y-1.5 animate-fade-in">
            {filteredAndSorted.map((book) => (
              <ListRow
                key={book.id}
                book={book}
                onSelect={setSelectedBookId}
                onToggleFavorite={toggleFavorite}
                onStatusChange={changeStatus}
                onRefreshMetadata={refreshMetadata}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* ---- Infinite scroll sentinel --------------------------------- */}
        <div ref={sentinelRef} className="h-px" />
        {booksQuery.isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-primary/50" />
          </div>
        )}
      </div>

      {/* ==== Detail panel ================================================ */}
      <Dialog
        open={selectedBookId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBookId(null);
            setEditMode(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            // Override default dialog positioning to be a right-side panel
            "fixed inset-y-0 right-0 left-auto h-full w-full max-w-md",
            "translate-x-0 translate-y-0 rounded-none border-l border-border/40",
            "overflow-y-auto p-0 gap-0",
            // Override the bg-black/40 overlay to something subtle
            "data-[state=open]:animate-slide-in-left data-[state=open]:duration-300"
          )}
        >
          {/* Panel loading state */}
          {!panelBook && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-6 animate-spin text-primary/50" />
            </div>
          )}

          {panelBook && (
            <>
              {/* Header: cover thumbnail + title side by side */}
              <div className="p-5 pb-0">
                <DialogHeader className="sr-only">
                  <DialogTitle>{panelBook.title}</DialogTitle>
                  <DialogDescription>
                    Book details and metadata management
                  </DialogDescription>
                </DialogHeader>

                <div className="flex gap-4">
                  {/* Small cover */}
                  <div className="relative w-24 shrink-0 aspect-[2/3] overflow-hidden rounded-lg shadow-md">
                    <BookCover
                      book={panelBook}
                      className="h-full w-full"
                      showFallbackText={false}
                    />
                    <Badge
                      variant="secondary"
                      className="absolute bottom-1.5 right-1.5 text-[9px] bg-background/80 backdrop-blur-sm border-border/30"
                    >
                      {panelBook.fileExt.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Title / author / meta */}
                  <div className="flex-1 min-w-0 py-0.5">
                    <h2 className="text-lg font-bold tracking-tight leading-snug line-clamp-3">
                      {panelBook.title}
                    </h2>
                    {panelBook.author && (
                      <p className="mt-1 text-sm text-muted-foreground truncate">
                        by {panelBook.author}
                      </p>
                    )}
                    {panelBook.series && (
                      <p className="mt-0.5 text-xs text-muted-foreground/60 italic truncate">
                        {panelBook.series}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        className="flex items-center justify-center size-7 rounded-md bg-muted/40 hover:bg-muted transition-colors"
                        onClick={() =>
                          void toggleFavorite(panelBook.id, !panelBook.isFavorite)
                        }
                        title={panelBook.isFavorite ? "Remove from favorites" : "Add to favorites"}
                      >
                        <Star
                          className={cn(
                            "size-3.5 transition-colors",
                            panelBook.isFavorite
                              ? "fill-yellow-400 text-yellow-500"
                              : "text-muted-foreground/50"
                          )}
                        />
                      </button>
                      <span className="text-[11px] text-muted-foreground/50">
                        {formatSize(panelBook.fileSize)}
                      </span>
                      {panelBook.koboSyncable === 1 && (
                        <Badge variant="default" className="text-[10px] py-0 px-1.5">
                          Kobo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-5 space-y-5">

                {/* Status selector */}
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                    Reading Status
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={panelBook.progress?.status ?? "UNREAD"}
                    onValueChange={(v) => {
                      if (v) void changeStatus(panelBook.id, v);
                    }}
                    className="w-full"
                  >
                    {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                      const c = statusConfig[s];
                      return (
                        <ToggleGroupItem
                          key={s}
                          value={s}
                          className="flex-1 gap-1.5 text-xs"
                        >
                          <c.icon className="size-3.5" />
                          {c.label}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>

                {/* Progress bar for reading books */}
                {(panelBook.progress?.status === "READING" ||
                  (panelBook.progress?.progressPercent ?? 0) > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                        Progress
                      </Label>
                      <span className="text-xs font-medium tabular-nums text-foreground/70">
                        {panelBook.progress?.progressPercent ?? 0}%
                      </span>
                    </div>
                    <Progress
                      value={panelBook.progress?.progressPercent ?? 0}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Description (read-only) */}
                {panelBook.description && !editMode && (
                  <div>
                    <Label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                      Description
                    </Label>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground/80 line-clamp-6">
                      {panelBook.description}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Edit metadata section */}
                <div className="space-y-3">
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
                  >
                    <Save className="size-4" />
                    Edit metadata
                    <ChevronDown
                      className={cn(
                        "size-3.5 text-muted-foreground transition-transform duration-200",
                        editMode && "rotate-180"
                      )}
                    />
                  </button>

                  {editMode && (
                    <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-4 animate-fade-in">
                      <div className="space-y-1.5">
                        <Label>Title</Label>
                        <Input
                          value={draft.title}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              title: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Author</Label>
                        <Input
                          value={draft.author}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              author: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Series</Label>
                        <Input
                          value={draft.series}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              series: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea
                          rows={4}
                          value={draft.description}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => saveMetadata.mutate()}
                          disabled={saveMetadata.isPending}
                          className="gap-1.5"
                        >
                          {saveMetadata.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void refreshMetadata(panelBook.id)
                          }
                          className="gap-1.5"
                        >
                          <RefreshCw className="size-3.5" />
                          Fetch metadata
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Collections */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
                    <FolderOpen className="size-4" />
                    Collections
                  </div>
                  <div className="space-y-1.5">
                    {bookCollections.isLoading && (
                      <div className="flex items-center gap-2 py-3 justify-center">
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          Loading...
                        </span>
                      </div>
                    )}
                    {(bookCollections.data ?? []).map((collection) => (
                      <div
                        key={collection.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-muted/10 px-3 py-2 transition-colors hover:bg-muted/20"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {collection.icon && (
                              <span className="mr-1.5">
                                {collection.icon}
                              </span>
                            )}
                            {collection.name}
                          </p>
                          {collection.isSystem && (
                            <p className="text-[10px] text-muted-foreground/70">
                              System
                            </p>
                          )}
                        </div>
                        <Button
                          variant={
                            collection.assigned ? "default" : "outline"
                          }
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          onClick={() =>
                            void setCollectionAssigned(
                              collection.id,
                              !collection.assigned
                            )
                          }
                        >
                          {collection.assigned ? "Included" : "Include"}
                        </Button>
                      </div>
                    ))}
                    {bookCollections.data?.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No collections yet
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Download */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => handleDownload(panelBook.id)}
                >
                  <Download className="size-4" />
                  Download {panelBook.fileExt.toUpperCase()}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatSize(panelBook.fileSize)}
                  </span>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

// ---------------------------------------------------------------------------
// Grid card sub-component
// ---------------------------------------------------------------------------

const GridCard: React.FC<{
  book: BookItem;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(
  ({
    book,
    onSelect,
    onToggleFavorite,
    onStatusChange,
    onRefreshMetadata,
    onDownload,
  }) => {
    const status = book.progress?.status ?? "UNREAD";
    const config = statusConfig[status];
    const percent = book.progress?.progressPercent ?? 0;

    return (
      <Card
        className="group relative overflow-hidden cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.06]"
        onClick={() => onSelect(book.id)}
      >
        {/* Cover area */}
        <div className="relative aspect-[2/3] overflow-hidden">
          <BookCover
            book={book}
            className="h-full w-full transition-transform duration-300 group-hover:scale-[1.02]"
          />

          {/* Format badge */}
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm border-border/30"
          >
            {book.fileExt.toUpperCase()}
          </Badge>

          {/* Favorite star */}
          <button
            className="absolute top-2 left-2 flex items-center justify-center size-7 rounded-md bg-background/80 backdrop-blur-sm border border-border/30 hover:bg-background transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              void onToggleFavorite(book.id, !book.isFavorite);
            }}
            title={
              book.isFavorite
                ? "Remove from favorites"
                : "Add to favorites"
            }
          >
            <Star
              className={cn(
                "size-3.5 transition-colors",
                book.isFavorite
                  ? "fill-yellow-400 text-yellow-500"
                  : "text-muted-foreground"
              )}
            />
          </button>

          {/* Actions dropdown - appears on hover */}
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center size-7 rounded-md bg-background/80 backdrop-blur-sm border border-border/30 hover:bg-background transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                  Status
                </DropdownMenuLabel>
                {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                  const sc = statusConfig[s];
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onStatusChange(book.id, s);
                      }}
                      className={cn(
                        "gap-2",
                        status === s && "bg-accent"
                      )}
                    >
                      <sc.icon className="size-3.5" />
                      {sc.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRefreshMetadata(book.id);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh metadata
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(book.id);
                  }}
                  className="gap-2"
                >
                  <Download className="size-3.5" />
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Progress bar at bottom of cover for READING books */}
          {status === "READING" && percent > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-1 bg-black/20">
              <div
                className="h-full bg-status-processing transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        {/* Info below cover */}
        <div className="p-3 space-y-1.5">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {book.author ?? "Unknown author"}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant={config.variant} className="text-[10px] gap-1">
              <config.icon className="size-3" />
              {config.label}
            </Badge>
            {status === "READING" && percent > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground font-medium">
                {percent}%
              </span>
            )}
          </div>
        </div>
      </Card>
    );
  }
);
GridCard.displayName = "GridCard";

// ---------------------------------------------------------------------------
// List row sub-component
// ---------------------------------------------------------------------------

const ListRow: React.FC<{
  book: BookItem;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(
  ({
    book,
    onSelect,
    onToggleFavorite,
    onStatusChange,
    onRefreshMetadata,
    onDownload,
  }) => {
    const status = book.progress?.status ?? "UNREAD";
    const config = statusConfig[status];
    const percent = book.progress?.progressPercent ?? 0;

    return (
      <Card
        className="group cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/[0.04]"
        onClick={() => onSelect(book.id)}
      >
        <div className="flex items-center gap-3 p-3">
          {/* Small cover thumbnail */}
          <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md">
            <BookCover
              book={book}
              className="h-full w-full"
              showFallbackText={false}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors duration-200">
              {book.title}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {book.author ?? "Unknown author"}
              {book.series && (
                <span className="text-muted-foreground/50">
                  {" "}
                  &middot; {book.series}
                </span>
              )}
            </p>
            {/* Progress bar inline for READING */}
            {status === "READING" && percent > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 max-w-24 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-status-processing transition-all duration-500 rounded-full"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground font-medium">
                  {percent}%
                </span>
              </div>
            )}
          </div>

          {/* Right-side metadata */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Favorite */}
            <button
              className="rounded-md p-1.5 hover:bg-muted/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                void onToggleFavorite(book.id, !book.isFavorite);
              }}
            >
              <Star
                className={cn(
                  "size-3.5 transition-colors",
                  book.isFavorite
                    ? "fill-yellow-400 text-yellow-500"
                    : "text-muted-foreground/40"
                )}
              />
            </button>
            <Badge variant="secondary" className="text-[10px]">
              {book.fileExt.toUpperCase()}
            </Badge>
            <span className="text-[11px] text-muted-foreground/60 tabular-nums w-14 text-right">
              {formatSize(book.fileSize)}
            </span>
            <Badge variant={config.variant} className="text-[10px] gap-1">
              <config.icon className="size-3" />
              {config.label}
            </Badge>
          </div>

          {/* Actions dropdown */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center size-7 rounded-md hover:bg-muted/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
                  Status
                </DropdownMenuLabel>
                {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                  const sc = statusConfig[s];
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onStatusChange(book.id, s);
                      }}
                      className={cn(
                        "gap-2",
                        status === s && "bg-accent"
                      )}
                    >
                      <sc.icon className="size-3.5" />
                      {sc.label}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    void onRefreshMetadata(book.id);
                  }}
                  className="gap-2"
                >
                  <RefreshCw className="size-3.5" />
                  Refresh metadata
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(book.id);
                  }}
                  className="gap-2"
                >
                  <Download className="size-3.5" />
                  Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>
    );
  }
);
ListRow.displayName = "ListRow";
