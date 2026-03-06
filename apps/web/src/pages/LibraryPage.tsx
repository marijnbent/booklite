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

function coverHue(id: number): number {
  return (((id * 137.508) % 360) + 360) % 360;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortBooks(a: BookItem, b: BookItem, sort: SortOption): number {
  switch (sort) {
    case "title":
      return a.title.localeCompare(b.title, undefined, {
        sensitivity: "base",
      });
    case "author":
      return (a.author ?? "").localeCompare(b.author ?? "", undefined, {
        sensitivity: "base",
      });
    case "updated":
    default:
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const BookCover: React.FC<{
  book: Pick<BookItem, "id" | "title" | "coverPath">;
  className?: string;
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

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 p-4",
        className,
      )}
      style={{
        background: `linear-gradient(145deg, oklch(0.38 0.09 ${hue}) 0%, oklch(0.20 0.06 ${hue + 40}) 100%)`,
      }}
    >
      <Book className="size-8 text-white/15" />
      {showFallbackText && (
        <span className="text-[10px] font-medium text-white/35 text-center leading-tight line-clamp-3 max-w-[80%]">
          {book.title}
        </span>
      )}
    </div>
  );
};

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 lg:gap-6">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="space-y-3">
        <div
          className="aspect-[2/3] rounded-md bg-muted/40 animate-pulse"
        />
        <div className="space-y-2 px-1">
          <div className="h-3.5 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-muted/30 animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const ListSkeleton: React.FC = () => (
  <div className="space-y-1">
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-4 rounded-md p-3 animate-pulse"
      >
        <div className="h-14 w-10 shrink-0 rounded bg-muted/40" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-2/5 rounded-full bg-muted/40" />
          <div className="h-3 w-1/4 rounded-full bg-muted/30" />
        </div>
        <div className="h-5 w-14 rounded-full bg-muted/30" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    booksQuery.hasNextPage,
    booksQuery.isFetchingNextPage,
    booksQuery.fetchNextPage,
  ]);

  const allBooks = useMemo(
    () => booksQuery.data?.pages.flat() ?? [],
    [booksQuery.data],
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
        (b) => (b.progress?.status ?? "UNREAD") === statusFilter,
      );
    }
    return [...result].sort((a, b) => sortBooks(a, b, sort));
  }, [allBooks, statusFilter, sort]);

  const selectedBook = useQuery({
    queryKey: ["books", "detail", selectedBookId],
    queryFn: () => apiFetch<BookItem>(`/api/v1/books/${selectedBookId}`),
    enabled: selectedBookId !== null,
  });

  const bookCollections = useQuery({
    queryKey: ["books", selectedBookId, "collections"],
    queryFn: () =>
      apiFetch<BookCollectionAssignment[]>(
        `/api/v1/books/${selectedBookId}/collections`,
      ),
    enabled: selectedBookId !== null,
  });

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
    [queryClient],
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
    [queryClient],
  );

  const refreshMetadata = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, {
        method: "POST",
      });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient],
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
    [queryClient],
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
    [selectedBookId, bookCollections.data, queryClient],
  );

  const handleDownload = useCallback((bookId: number) => {
    window.open(`/api/v1/books/${bookId}/download`, "_blank");
  }, []);

  const isLoading = booksQuery.isLoading;
  const isError = booksQuery.isError;
  const isEmpty = !isLoading && allBooks.length === 0;
  const hasResults = !isLoading && filteredAndSorted.length > 0;
  const noFilterResults =
    !isLoading && allBooks.length > 0 && filteredAndSorted.length === 0;

  const panelBook = selectedBook.data;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-8 animate-fade-in">
        {/* ---- Header ------------------------------------------------- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {allBooks.length > 0
                ? `${allBooks.length} book${allBooks.length !== 1 ? "s" : ""}`
                : "Your personal book collection"}
              {statusCounts.READING > 0 && ` \u00b7 ${statusCounts.READING} reading`}
              {statusCounts.DONE > 0 && ` \u00b7 ${statusCounts.DONE} finished`}
              {booksQuery.hasNextPage && !isLoading && " \u00b7 loading more..."}
            </p>
          </div>
        </div>

        {/* ---- Toolbar ------------------------------------------------ */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
            <Input
              placeholder="Search books..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9 pr-8"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-foreground"
                  onClick={() => refreshAllMetadata.mutate()}
                  disabled={refreshAllMetadata.isPending}
                >
                  {refreshAllMetadata.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Refresh all metadata
              </TooltipContent>
            </Tooltip>

            <div className="w-px h-5 bg-border/60 mx-1 hidden sm:block" />

            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortOption)}
            >
              <SelectTrigger className="h-9 w-auto gap-1.5 text-xs px-3 bg-transparent hover:bg-accent transition-colors">
                <ArrowDownAZ className="size-3.5 text-muted-foreground/60" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
                <SelectItem value="author">Author A-Z</SelectItem>
              </SelectContent>
            </Select>

            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => {
                if (v) setView(v as ViewMode);
              }}
              className="bg-secondary/60 rounded-md p-0.5"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="Grid view"
                className="rounded size-8 data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                <Grid3X3 className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                className="rounded size-8 data-[state=on]:bg-card data-[state=on]:shadow-sm"
              >
                <List className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* ---- Status filter tabs ------------------------------------- */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-2 -mt-2">
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
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {config && (
                  <config.icon
                    className={cn(
                      "size-3.5",
                      active ? config.color : "opacity-60",
                    )}
                  />
                )}
                <span>{status === "ALL" ? "All" : config?.label}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    active
                      ? "text-foreground/50"
                      : "text-muted-foreground/40",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---- Loading ------------------------------------------------ */}
        {isLoading && (view === "grid" ? <GridSkeleton /> : <ListSkeleton />)}

        {/* ---- Error -------------------------------------------------- */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-24">
            <AlertCircle className="size-8 text-destructive/40 mb-4" />
            <h3 className="text-lg font-semibold">
              Something went wrong
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-xs text-center">
              Could not load your library. Please try again.
            </p>
            <Button
              variant="outline"
              className="mt-5 gap-1.5"
              onClick={() => void booksQuery.refetch()}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* ---- Empty state -------------------------------------------- */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-24">
            <BookMarked className="size-10 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold">
              {debouncedQuery ? "No results found" : "Your library is empty"}
            </h3>
            <p className="mt-1.5 text-sm text-muted-foreground max-w-sm text-center">
              {debouncedQuery
                ? `No books match "${debouncedQuery}". Try a different search.`
                : "Upload your first book to get started."}
            </p>
          </div>
        )}

        {/* ---- No filter results -------------------------------------- */}
        {noFilterResults && (
          <div className="flex flex-col items-center justify-center py-20">
            <Book className="size-8 text-muted-foreground/20 mb-4" />
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
              className="mt-2.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Show all books
            </button>
          </div>
        )}

        {/* ---- Grid view ---------------------------------------------- */}
        {hasResults && view === "grid" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 lg:gap-6 animate-fade-in">
            {filteredAndSorted.map((book, i) => (
              <GridCard
                key={book.id}
                book={book}
                index={i}
                onSelect={setSelectedBookId}
                onToggleFavorite={toggleFavorite}
                onStatusChange={changeStatus}
                onRefreshMetadata={refreshMetadata}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* ---- List view ---------------------------------------------- */}
        {hasResults && view === "list" && (
          <div className="space-y-0.5 animate-fade-in">
            <div className="hidden sm:flex items-center gap-3 px-3 py-2 text-[11px] uppercase tracking-wide font-medium text-muted-foreground border-b border-border mb-1">
              <div className="w-10 shrink-0" />
              <div className="flex-1">Title</div>
              <div className="w-8" />
              <div className="w-14 text-center">Format</div>
              <div className="w-14 text-right">Size</div>
              <div className="w-20 text-center">Status</div>
              <div className="w-7" />
            </div>
            {filteredAndSorted.map((book, i) => (
              <ListRow
                key={book.id}
                book={book}
                index={i}
                onSelect={setSelectedBookId}
                onToggleFavorite={toggleFavorite}
                onStatusChange={changeStatus}
                onRefreshMetadata={refreshMetadata}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* ---- Infinite scroll sentinel ------------------------------- */}
        <div ref={sentinelRef} className="h-px" />
        {booksQuery.isFetchingNextPage && (
          <div className="flex justify-center py-8">
            <div className="flex items-center gap-2.5">
              <Loader2 className="size-4 animate-spin text-primary/40" />
              <span className="text-xs text-muted-foreground/50">
                Loading more books...
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ==== Detail panel ============================================== */}
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
            "fixed inset-y-0 right-0 left-auto h-full w-full max-w-[440px]",
            "translate-x-0 translate-y-0 rounded-none",
            "border-l border-border bg-card",
            "overflow-y-auto p-0 gap-0",
            "data-[state=open]:animate-slide-in-right data-[state=open]:duration-300",
          )}
        >
          {!panelBook && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-6 animate-spin text-primary/40" />
            </div>
          )}

          {panelBook && (
            <>
              {/* Header */}
              <div>
                <div className="p-6 pb-0">
                  <DialogHeader className="sr-only">
                    <DialogTitle>{panelBook.title}</DialogTitle>
                    <DialogDescription>
                      Book details and metadata management
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex gap-5">
                    <div className="relative w-28 shrink-0 aspect-[2/3] overflow-hidden rounded-md shadow-md">
                      <BookCover
                        book={panelBook}
                        className="h-full w-full"
                        showFallbackText={false}
                      />
                      <Badge
                        variant="secondary"
                        className="absolute bottom-1.5 right-1.5 text-[9px]"
                      >
                        {panelBook.fileExt.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex-1 min-w-0 py-1">
                      <h2 className="text-xl font-bold tracking-tight leading-snug line-clamp-3">
                        {panelBook.title}
                      </h2>
                      {panelBook.author && (
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          by {panelBook.author}
                        </p>
                      )}
                      {panelBook.series && (
                        <p className="mt-1 text-xs text-muted-foreground/50 italic truncate">
                          {panelBook.series}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2.5">
                        <button
                          className={cn(
                            "flex items-center justify-center size-7 rounded transition-colors",
                            panelBook.isFavorite
                              ? "bg-yellow-400/15 hover:bg-yellow-400/25"
                              : "bg-muted/40 hover:bg-muted/60",
                          )}
                          onClick={() =>
                            void toggleFavorite(
                              panelBook.id,
                              !panelBook.isFavorite,
                            )
                          }
                          title={
                            panelBook.isFavorite
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                        >
                          <Star
                            className={cn(
                              "size-3.5",
                              panelBook.isFavorite
                                ? "fill-yellow-400 text-yellow-500"
                                : "text-muted-foreground/40",
                            )}
                          />
                        </button>
                        <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                          {formatSize(panelBook.fileSize)}
                        </span>
                        {panelBook.koboSyncable === 1 && (
                          <Badge
                            variant="default"
                            className="text-[10px] py-0 px-1.5 rounded-full"
                          >
                            Kobo
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 pt-5 space-y-6">
                {/* Status selector */}
                <div className="space-y-2.5">
                  <Label className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Reading Status
                  </Label>
                  <ToggleGroup
                    type="single"
                    value={panelBook.progress?.status ?? "UNREAD"}
                    onValueChange={(v) => {
                      if (v) void changeStatus(panelBook.id, v);
                    }}
                    className="w-full bg-secondary rounded-md p-0.5"
                  >
                    {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                      const c = statusConfig[s];
                      return (
                        <ToggleGroupItem
                          key={s}
                          value={s}
                          className="flex-1 gap-1.5 text-xs rounded data-[state=on]:bg-card data-[state=on]:shadow-sm"
                        >
                          <c.icon className="size-3.5" />
                          {c.label}
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>

                {/* Progress */}
                {(panelBook.progress?.status === "READING" ||
                  (panelBook.progress?.progressPercent ?? 0) > 0) && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                        Progress
                      </Label>
                      <span className="text-xs font-semibold tabular-nums text-foreground/70">
                        {panelBook.progress?.progressPercent ?? 0}%
                      </span>
                    </div>
                    <Progress
                      value={panelBook.progress?.progressPercent ?? 0}
                      className="h-2 rounded-full"
                    />
                  </div>
                )}

                {/* Description */}
                {panelBook.description && !editMode && (
                  <div>
                    <Label className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                      Description
                    </Label>
                    <p className="mt-2 text-[13px] leading-relaxed text-foreground/70 line-clamp-6">
                      {panelBook.description}
                    </p>
                  </div>
                )}

                <div className="h-px bg-border/40" />

                {/* Edit metadata */}
                <div className="space-y-3">
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className={cn(
                      "flex items-center gap-2.5 w-full text-sm font-medium transition-colors duration-200 rounded-lg px-3 py-2 -mx-3",
                      editMode
                        ? "text-primary bg-primary/[0.06]"
                        : "text-foreground/70 hover:text-foreground hover:bg-muted/40",
                    )}
                  >
                    <Save className="size-4" />
                    Edit metadata
                    <ChevronDown
                      className={cn(
                        "size-3.5 ml-auto text-muted-foreground/50 transition-transform duration-200",
                        editMode && "rotate-180",
                      )}
                    />
                  </button>

                  {editMode && (
                    <div className="space-y-4 rounded-md border border-border/50 bg-secondary/30 p-4 animate-fade-in">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground/60">
                          Title
                        </Label>
                        <Input
                          value={draft.title}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              title: e.target.value,
                            }))
                          }
                          className="bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground/60">
                          Author
                        </Label>
                        <Input
                          value={draft.author}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              author: e.target.value,
                            }))
                          }
                          className="bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground/60">
                          Series
                        </Label>
                        <Input
                          value={draft.series}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              series: e.target.value,
                            }))
                          }
                          className="bg-card"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground/60">
                          Description
                        </Label>
                        <Textarea
                          rows={4}
                          value={draft.description}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                          className="bg-card resize-none"
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

                <div className="h-px bg-border/40" />

                {/* Collections */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground/70">
                    <FolderOpen className="size-4" />
                    Collections
                  </div>
                  <div className="space-y-1.5">
                    {bookCollections.isLoading && (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground/40" />
                        <span className="text-xs text-muted-foreground/40">
                          Loading...
                        </span>
                      </div>
                    )}
                    {(bookCollections.data ?? []).map((collection) => (
                      <div
                        key={collection.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors",
                          collection.assigned
                            ? "bg-primary/5 border border-primary/15"
                            : "bg-secondary/30 border border-border/30 hover:bg-secondary/50",
                        )}
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
                            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">
                              System
                            </p>
                          )}
                        </div>
                        <Button
                          variant={
                            collection.assigned ? "default" : "outline"
                          }
                          size="sm"
                          className={cn(
                            "h-7 text-xs shrink-0",
                          )}
                          onClick={() =>
                            void setCollectionAssigned(
                              collection.id,
                              !collection.assigned,
                            )
                          }
                        >
                          {collection.assigned ? "Included" : "Include"}
                        </Button>
                      </div>
                    ))}
                    {bookCollections.data?.length === 0 && (
                      <p className="text-xs text-muted-foreground/40 py-3 text-center">
                        No collections yet
                      </p>
                    )}
                  </div>
                </div>

                <div className="h-px bg-border/40" />

                {/* Download */}
                <Button
                  variant="outline"
                  className="w-full gap-2 h-10"
                  onClick={() => handleDownload(panelBook.id)}
                >
                  <Download className="size-4" />
                  Download {panelBook.fileExt.toUpperCase()}
                  <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
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
// Grid card
// ---------------------------------------------------------------------------

const GridCard: React.FC<{
  book: BookItem;
  index: number;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(
  ({
    book,
    index,
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
      <div
        className="group relative cursor-pointer animate-fade-up"
        style={{
          animationDelay: `${Math.min(index * 30, 300)}ms`,
          animationFillMode: "backwards",
        }}
        onClick={() => onSelect(book.id)}
      >
        {/* Cover */}
        <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted/20 shadow-sm transition-shadow duration-200 group-hover:shadow-md">
          <BookCover
            book={book}
            className="h-full w-full"
          />

          {/* Favorite */}
          <button
            className={cn(
              "absolute top-2 left-2 flex items-center justify-center size-7 rounded transition-all duration-150",
              book.isFavorite
                ? "bg-yellow-400/20 backdrop-blur-sm"
                : "bg-black/30 backdrop-blur-sm opacity-0 group-hover:opacity-100",
            )}
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
                "size-3.5 transition-all duration-200",
                book.isFavorite
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-white/80",
              )}
            />
          </button>

          {/* Format badge */}
          <Badge
            variant="secondary"
            className="absolute top-2 right-2 text-[9px] bg-black/30 text-white/90 backdrop-blur-sm border-0 tracking-wider uppercase"
          >
            {book.fileExt.toUpperCase()}
          </Badge>

          {/* Actions */}
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center size-7 rounded bg-black/30 backdrop-blur-sm hover:bg-black/50 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-3.5 text-white/90" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
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
                        status === s && "bg-accent",
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

          {/* Progress bar */}
          {status === "READING" && percent > 0 && (
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/20">
              <div
                className="h-full bg-status-processing transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>

        {/* Info below cover */}
        <div className="pt-2.5 pb-1 space-y-0.5">
          <h3 className="font-medium text-[13px] leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {book.title}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {book.author ?? "Unknown author"}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5">
            {status !== "UNREAD" && (
              <Badge
                variant={config.variant}
                className="text-[10px] gap-1 rounded-full px-2 py-0 h-5"
              >
                <config.icon className="size-2.5" />
                {config.label}
              </Badge>
            )}
            {status === "READING" && percent > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
                {percent}%
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
);
GridCard.displayName = "GridCard";

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

const ListRow: React.FC<{
  book: BookItem;
  index: number;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(
  ({
    book,
    index,
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
      <div
        className={cn(
          "group cursor-pointer rounded-md transition-colors",
          "hover:bg-accent/50",
        )}
        style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
        onClick={() => onSelect(book.id)}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          {/* Thumbnail */}
          <div className="h-14 w-10 shrink-0 overflow-hidden rounded shadow-sm">
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
            <p className="text-xs text-muted-foreground/55 truncate mt-0.5">
              {book.author ?? "Unknown author"}
              {book.series && (
                <span className="text-muted-foreground/35">
                  {" "}
                  &middot; {book.series}
                </span>
              )}
            </p>
            {status === "READING" && percent > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 max-w-24 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className="h-full bg-status-processing transition-all duration-500 rounded-full"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground/50 font-medium">
                  {percent}%
                </span>
              </div>
            )}
          </div>

          {/* Right metadata */}
          <div className="hidden sm:flex items-center gap-2.5">
            <button
              className={cn(
                "rounded p-1.5 transition-colors",
                book.isFavorite
                  ? "hover:bg-yellow-400/10"
                  : "hover:bg-muted/50",
              )}
              onClick={(e) => {
                e.stopPropagation();
                void onToggleFavorite(book.id, !book.isFavorite);
              }}
            >
              <Star
                className={cn(
                  "size-3.5 transition-all duration-200",
                  book.isFavorite
                    ? "fill-yellow-400 text-yellow-500"
                    : "text-muted-foreground/25 group-hover:text-muted-foreground/40",
                )}
              />
            </button>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">
              {book.fileExt}
            </span>
            <span className="text-[11px] text-muted-foreground/40 tabular-nums w-14 text-right">
              {formatSize(book.fileSize)}
            </span>
            <Badge
              variant={config.variant}
              className="text-[10px] gap-1 rounded-full px-2 h-5"
            >
              <config.icon className="size-2.5" />
              {config.label}
            </Badge>
          </div>

          {/* Actions */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center size-7 rounded hover:bg-muted/60 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4 text-muted-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
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
                        status === s && "bg-accent",
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
      </div>
    );
  },
);
ListRow.displayName = "ListRow";
