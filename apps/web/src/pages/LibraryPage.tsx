import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  useMutation,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Book,
  Grid3X3,
  List,
  Search,
  RefreshCw,
  BookOpen,
  CheckCircle2,
  BookMarked,
  MoreHorizontal,
  Download,
  Loader2,
  SortAsc,
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
  createdAt: string;
  updatedAt: string;
  progress: {
    status: "UNREAD" | "READING" | "DONE";
    progressPercent: number;
  } | null;
}

type StatusFilter = "ALL" | "UNREAD" | "READING" | "DONE";
type SortKey = "updated" | "title" | "author";

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Status config
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

const statusFilters: { value: StatusFilter; label: string; icon: React.ElementType }[] = [
  { value: "ALL", label: "All", icon: BookMarked },
  { value: "UNREAD", label: "Unread", icon: Book },
  { value: "READING", label: "Reading", icon: BookOpen },
  { value: "DONE", label: "Done", icon: CheckCircle2 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortBooks(books: BookItem[], key: SortKey): BookItem[] {
  const sorted = [...books];
  switch (key) {
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "author":
      return sorted.sort((a, b) =>
        (a.author ?? "").localeCompare(b.author ?? "")
      );
    case "updated":
    default:
      return sorted.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }
}

// ---------------------------------------------------------------------------
// Book cover component
// ---------------------------------------------------------------------------

const BookCover: React.FC<{
  book: BookItem;
  className?: string;
  size?: "sm" | "md" | "lg";
}> = ({ book, className, size = "md" }) => {
  const [imgError, setImgError] = useState(false);
  const showFallback = !book.coverPath || imgError;

  /* Deterministic gradient from book id */
  const hue = (book.id * 137) % 360;

  const sizeClasses = {
    sm: "w-10 h-14",
    md: "w-full aspect-[2/3]",
    lg: "w-full aspect-[2/3]",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg",
        sizeClasses[size],
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
          <Book
            className={cn(
              "text-white/20",
              size === "sm" ? "size-4" : "size-8"
            )}
          />
          {size !== "sm" && (
            <div className="absolute inset-x-0 bottom-0 p-3">
              <p className="text-[10px] font-semibold text-white/70 leading-tight line-clamp-3">
                {book.title}
              </p>
            </div>
          )}
        </div>
      ) : (
        <img
          src={book.coverPath!}
          alt={book.title}
          loading="lazy"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grid book card
// ---------------------------------------------------------------------------

const GridBookCard: React.FC<{
  book: BookItem;
  onStatusChange: (id: number, status: string) => void;
  onRefresh: (id: number) => void;
  onDownload: (id: number) => void;
}> = ({ book, onStatusChange, onRefresh, onDownload }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const progressPercent = book.progress?.progressPercent ?? 0;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl",
        "bg-card border border-border/50 shadow-sm",
        "hover:shadow-md hover:shadow-primary/[0.06] hover:border-border/80",
        "transition-all duration-200"
      )}
    >
      {/* Cover */}
      <div className="relative">
        <BookCover book={book} size="md" />

        {/* File type pill -- top right of cover */}
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur-sm border-border/30 shadow-sm"
        >
          {book.fileExt.toUpperCase()}
        </Badge>

        {/* Actions menu -- top left, visible on hover */}
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <BookActionsMenu
            book={book}
            onStatusChange={onStatusChange}
            onRefresh={onRefresh}
            onDownload={onDownload}
          />
        </div>

        {/* Reading progress bar at bottom of cover */}
        {status === "READING" && progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-status-processing transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3 flex-1">
        <h3 className="font-semibold text-[13px] leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-150">
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground/80 truncate">
          {book.author ?? "Unknown author"}
        </p>

        <div className="mt-auto pt-2 flex items-center gap-1.5">
          <Badge variant={config.variant} className="text-[10px] gap-1 py-0">
            <config.icon className="size-2.5" />
            {config.label}
          </Badge>
          {status === "READING" && progressPercent > 0 && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto tabular-nums">
              {progressPercent}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// List book row
// ---------------------------------------------------------------------------

const ListBookRow: React.FC<{
  book: BookItem;
  onStatusChange: (id: number, status: string) => void;
  onRefresh: (id: number) => void;
  onDownload: (id: number) => void;
}> = ({ book, onStatusChange, onRefresh, onDownload }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const progressPercent = book.progress?.progressPercent ?? 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-4 py-3",
        "rounded-xl border border-transparent",
        "hover:bg-card hover:border-border/40 hover:shadow-sm",
        "transition-all duration-150"
      )}
    >
      {/* Cover thumbnail */}
      <BookCover book={book} size="sm" className="shrink-0 shadow-sm" />

      {/* Title + author */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors duration-150">
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
          {book.author ?? "Unknown author"}
          {book.series && (
            <span className="text-muted-foreground/40"> &middot; {book.series}</span>
          )}
        </p>
      </div>

      {/* Format */}
      <Badge
        variant="secondary"
        className="hidden sm:inline-flex text-[10px] shrink-0"
      >
        {book.fileExt.toUpperCase()}
      </Badge>

      {/* File size */}
      <span className="hidden lg:inline text-[11px] text-muted-foreground/50 tabular-nums w-16 text-right shrink-0">
        {formatFileSize(book.fileSize)}
      </span>

      {/* Status */}
      <Badge
        variant={config.variant}
        className="hidden sm:inline-flex text-[10px] gap-1 shrink-0"
      >
        <config.icon className="size-2.5" />
        {config.label}
      </Badge>

      {/* Progress */}
      <div className="hidden md:flex w-20 shrink-0 items-center gap-2">
        {status === "READING" && progressPercent > 0 ? (
          <>
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-status-processing transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {progressPercent}%
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/30">&mdash;</span>
        )}
      </div>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
        <BookActionsMenu
          book={book}
          onStatusChange={onStatusChange}
          onRefresh={onRefresh}
          onDownload={onDownload}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Book actions dropdown
// ---------------------------------------------------------------------------

const BookActionsMenu: React.FC<{
  book: BookItem;
  onStatusChange: (id: number, status: string) => void;
  onRefresh: (id: number) => void;
  onDownload: (id: number) => void;
}> = ({ book, onStatusChange, onRefresh, onDownload }) => {
  const currentStatus = book.progress?.status ?? "UNREAD";

  return (
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
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Status
        </DropdownMenuLabel>
        {(["UNREAD", "READING", "DONE"] as const).map((s) => {
          const cfg = statusConfig[s];
          const Icon = cfg.icon;
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => onStatusChange(book.id, s)}
              className={cn(
                currentStatus === s && "bg-accent font-medium"
              )}
            >
              <Icon className={cn("size-3.5 mr-1", cfg.color)} />
              {cfg.label}
              {currentStatus === s && (
                <CheckCircle2 className="size-3 ml-auto text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDownload(book.id)}>
          <Download className="size-3.5 mr-1" />
          Download
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRefresh(book.id)}>
          <RefreshCw className="size-3.5 mr-1" />
          Refresh metadata
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="rounded-xl bg-card border border-border/30 overflow-hidden">
        <div className="aspect-[2/3] bg-muted/40 animate-pulse" />
        <div className="p-3 space-y-2">
          <div className="h-3 bg-muted/40 rounded animate-pulse w-3/4" />
          <div className="h-2.5 bg-muted/30 rounded animate-pulse w-1/2" />
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
        className="flex items-center gap-4 px-4 py-3 rounded-xl"
      >
        <div className="w-10 h-14 rounded-lg bg-muted/40 animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted/40 rounded animate-pulse w-2/5" />
          <div className="h-2.5 bg-muted/30 rounded animate-pulse w-1/4" />
        </div>
        <div className="h-5 w-12 bg-muted/30 rounded animate-pulse hidden sm:block" />
        <div className="h-5 w-16 bg-muted/30 rounded animate-pulse hidden sm:block" />
      </div>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Infinite query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["books", debouncedSearch],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(pageParam));
      if (debouncedSearch) params.set("q", debouncedSearch);
      return apiFetch<BookItem[]>(`/api/v1/books?${params.toString()}`);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.flat().length;
    },
  });

  // Flatten pages
  const allBooks = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Client-side filter + sort
  const filteredBooks = useMemo(() => {
    let items = allBooks;
    if (statusFilter !== "ALL") {
      items = items.filter(
        (b) => (b.progress?.status ?? "UNREAD") === statusFilter
      );
    }
    return sortBooks(items, sortKey);
  }, [allBooks, statusFilter, sortKey]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mutations
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiFetch(`/api/v1/books/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/api/v1/books/${id}/metadata/fetch`, { method: "POST" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const handleStatusChange = useCallback(
    (id: number, status: string) => statusMutation.mutate({ id, status }),
    [statusMutation]
  );

  const handleRefresh = useCallback(
    (id: number) => refreshMutation.mutate(id),
    [refreshMutation]
  );

  const handleDownload = useCallback((id: number) => {
    window.open(`/api/v1/books/${id}/download`, "_blank");
  }, []);

  // Count per status from loaded data
  const statusCounts = useMemo(() => {
    const counts = { ALL: allBooks.length, UNREAD: 0, READING: 0, DONE: 0 };
    for (const b of allBooks) {
      const s = b.progress?.status ?? "UNREAD";
      counts[s]++;
    }
    return counts;
  }, [allBooks]);

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: "updated", label: "Recently updated" },
    { value: "title", label: "Title A-Z" },
    { value: "author", label: "Author A-Z" },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-6 animate-fade-in">
        {/* ---------------------------------------------------------------- */}
        {/* Page header                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {allBooks.length > 0 ? (
              <>
                <span className="tabular-nums font-medium text-foreground/80">
                  {filteredBooks.length}
                </span>
                {statusFilter !== "ALL" && (
                  <span className="text-muted-foreground/50">
                    {" "}of {allBooks.length}
                  </span>
                )}
                {" "}book{filteredBooks.length !== 1 ? "s" : ""}
              </>
            ) : isLoading ? (
              "Loading your collection..."
            ) : (
              "Your personal book collection"
            )}
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Toolbar                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-3">
          {/* Search + view toggle + sort */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/40" />
              <Input
                placeholder="Search by title, author..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 h-9"
              />
              {debouncedSearch && (
                <button
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedSearch("");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {/* Sort dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-9">
                    <SortAsc className="size-3.5" />
                    <span className="hidden sm:inline">
                      {sortOptions.find((o) => o.value === sortKey)?.label}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {sortOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => setSortKey(opt.value)}
                      className={cn(sortKey === opt.value && "bg-accent font-medium")}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* View toggle */}
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => {
                  if (v) setView(v as "grid" | "list");
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

          {/* Status filter tabs */}
          <div className="flex items-center gap-1">
            {statusFilters.map((f) => {
              const Icon = f.icon;
              const isActive = statusFilter === f.value;
              const count = statusCounts[f.value];
              return (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="size-3.5" />
                  {f.label}
                  {count > 0 && (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums ml-0.5",
                        isActive
                          ? "text-primary/70"
                          : "text-muted-foreground/50"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Content                                                          */}
        {/* ---------------------------------------------------------------- */}

        {/* Loading skeleton */}
        {isLoading && (view === "grid" ? <GridSkeleton /> : <ListSkeleton />)}

        {/* Error state */}
        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 mb-4">
              <BookMarked className="size-8 text-destructive/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground/80">
              Something went wrong
            </h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs text-center">
              Failed to load your library. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: ["books"] })
              }
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && filteredBooks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex size-20 items-center justify-center rounded-3xl bg-muted/50 mb-4">
              <BookMarked className="size-10 text-muted-foreground/25" />
            </div>
            <h3 className="text-lg font-semibold text-foreground/80">
              {debouncedSearch
                ? "No matches"
                : statusFilter !== "ALL"
                  ? `No ${statusFilter.toLowerCase()} books`
                  : "No books yet"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground/60 max-w-xs text-center">
              {debouncedSearch
                ? "Try a different search term or clear your filters."
                : statusFilter !== "ALL"
                  ? "Books with this status will appear here."
                  : "Upload your first book to get started."}
            </p>
          </div>
        )}

        {/* Grid view */}
        {!isLoading && filteredBooks.length > 0 && view === "grid" && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
            {filteredBooks.map((book) => (
              <GridBookCard
                key={book.id}
                book={book}
                onStatusChange={handleStatusChange}
                onRefresh={handleRefresh}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* List view */}
        {!isLoading && filteredBooks.length > 0 && view === "list" && (
          <div className="space-y-0.5">
            {/* List header */}
            <div className="flex items-center gap-4 px-4 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground/50">
              <div className="w-10 shrink-0" /> {/* cover space */}
              <div className="flex-1">Title</div>
              <div className="hidden sm:block w-12">Format</div>
              <div className="hidden lg:block w-16 text-right">Size</div>
              <div className="hidden sm:block w-16">Status</div>
              <div className="hidden md:block w-20">Progress</div>
              <div className="w-7" /> {/* actions space */}
            </div>
            {filteredBooks.map((book) => (
              <ListBookRow
                key={book.id}
                book={book}
                onStatusChange={handleStatusChange}
                onRefresh={handleRefresh}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-px" />

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground/60">
            <Loader2 className="size-4 animate-spin" />
            Loading more books...
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
