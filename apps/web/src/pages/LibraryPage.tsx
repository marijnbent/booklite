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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

const statusConfig = {
  UNREAD: { label: "Unread", icon: Book, variant: "secondary" as const },
  READING: { label: "Reading", icon: BookOpen, variant: "info" as const },
  DONE: { label: "Done", icon: CheckCircle2, variant: "success" as const },
};

function coverHue(id: number): number {
  return (((id * 137.508) % 360) + 360) % 360;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortBooks(a: BookItem, b: BookItem, sort: SortOption): number {
  if (sort === "title")
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  if (sort === "author")
    return (a.author ?? "").localeCompare(b.author ?? "", undefined, { sensitivity: "base" });
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

// ---------------------------------------------------------------------------
// Book cover
// ---------------------------------------------------------------------------

const BookCover: React.FC<{
  book: Pick<BookItem, "id" | "title" | "coverPath">;
  className?: string;
  showTitle?: boolean;
}> = ({ book, className, showTitle = true }) => {
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
      className={cn("flex flex-col items-center justify-center gap-2 p-4", className)}
      style={{
        background: `linear-gradient(145deg, oklch(0.38 0.09 ${hue}) 0%, oklch(0.20 0.06 ${hue + 40}) 100%)`,
      }}
    >
      <Book className="size-8 text-white/15" />
      {showTitle && (
        <span className="text-[10px] font-medium text-white/35 text-center leading-tight line-clamp-3 max-w-[80%]">
          {book.title}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
    {Array.from({ length: 12 }).map((_, i) => (
      <div key={i} className="space-y-2">
        <div className="aspect-[2/3] rounded-md bg-muted/40 animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-3 w-3/4 rounded bg-muted/40 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded bg-muted/30 animate-pulse" />
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
// Main
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({ title: "", author: "", series: "", description: "" });

  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Data fetching
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
  });

  // Infinite scroll
  useEffect(() => {
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
  }, [booksQuery.hasNextPage, booksQuery.isFetchingNextPage, booksQuery.fetchNextPage]);

  const allBooks = useMemo(() => booksQuery.data?.pages.flat() ?? [], [booksQuery.data]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: 0, UNREAD: 0, READING: 0, DONE: 0 };
    for (const book of allBooks) {
      counts[book.progress?.status ?? "UNREAD"]++;
      counts.ALL++;
    }
    return counts;
  }, [allBooks]);

  const filteredAndSorted = useMemo(() => {
    let result = allBooks;
    if (statusFilter !== "ALL") {
      result = result.filter((b) => (b.progress?.status ?? "UNREAD") === statusFilter);
    }
    return [...result].sort((a, b) => sortBooks(a, b, sort));
  }, [allBooks, statusFilter, sort]);

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
      await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, { method: "POST" });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
    [queryClient],
  );

  const refreshAllMetadata = useMutation({
    mutationFn: async () =>
      apiFetch<{ ok: boolean }>("/api/v1/books/metadata/fetch-all", { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["books"] }),
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
      const currentIds = bookCollections.data.filter((c) => c.assigned).map((c) => c.id);
      const nextIds = assigned
        ? [...currentIds, collectionId]
        : currentIds.filter((id) => id !== collectionId);

      await apiFetch(`/api/v1/books/${selectedBookId}/collections`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collectionIds: [...new Set(nextIds)] }),
      });
      void queryClient.invalidateQueries({ queryKey: ["books", selectedBookId, "collections"] });
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
    [selectedBookId, bookCollections.data, queryClient],
  );

  const handleDownload = useCallback(async (bookId: number) => {
    const response = await apiFetchRaw(`/api/v1/books/${bookId}/download`);
    const blob = await response.blob();
    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] ?? `book-${bookId}.epub`;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }, []);

  const isLoading = booksQuery.isLoading;
  const isError = booksQuery.isError;
  const isEmpty = !isLoading && allBooks.length === 0;
  const hasResults = !isLoading && filteredAndSorted.length > 0;
  const noFilterResults = !isLoading && allBooks.length > 0 && filteredAndSorted.length === 0;
  const panelBook = selectedBook.data;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusCounts.ALL} books{statusCounts.READING > 0 && ` \u00b7 ${statusCounts.READING} reading`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start sm:self-auto"
          onClick={() => refreshAllMetadata.mutate()}
          disabled={refreshAllMetadata.isPending}
        >
          {refreshAllMetadata.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh metadata
        </Button>
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
            <SelectTrigger className="h-9 w-[150px] text-xs">
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
        </div>
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {(["ALL", "UNREAD", "READING", "DONE"] as const).map((status) => {
          const active = statusFilter === status;
          const count = statusCounts[status];
          const config = status === "ALL" ? null : statusConfig[status as keyof typeof statusConfig];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {config && <config.icon className="size-3" />}
              {status === "ALL" ? "All" : config?.label}
              <span className="text-[10px] tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading && (view === "grid" ? <GridSkeleton /> : <ListSkeleton />)}

      {isError && (
        <div className="flex flex-col items-center py-20">
          <AlertCircle className="mb-3 size-6 text-destructive/40" />
          <p className="text-sm font-medium">Could not load library</p>
          <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => void booksQuery.refetch()}>
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center py-20">
          <BookMarked className="mb-3 size-8 text-muted-foreground/20" />
          <p className="text-sm font-medium">
            {debouncedQuery ? "No results" : "Your library is empty"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {debouncedQuery ? "Try a different search." : "Upload some books to get started."}
          </p>
        </div>
      )}

      {noFilterResults && (
        <div className="flex flex-col items-center py-16">
          <p className="text-sm text-muted-foreground">
            No {statusFilter.toLowerCase()} books{debouncedQuery && ` matching "${debouncedQuery}"`}.
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
              onSelect={setSelectedBookId}
              onToggleFavorite={toggleFavorite}
              onStatusChange={changeStatus}
              onRefreshMetadata={refreshMetadata}
              onDownload={handleDownload}
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
              onSelect={setSelectedBookId}
              onToggleFavorite={toggleFavorite}
              onStatusChange={changeStatus}
              onRefreshMetadata={refreshMetadata}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-px" />
      {booksQuery.isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      )}

      {/* Detail drawer */}
      <Dialog
        open={selectedBookId !== null}
        onOpenChange={(open) => {
          if (!open) { setSelectedBookId(null); setEditMode(false); }
        }}
      >
        <DialogContent
          className={cn(
            "fixed inset-y-0 right-0 left-auto h-full w-full max-w-[440px]",
            "translate-x-0 translate-y-0 rounded-none",
            "border-l border-border bg-background overflow-y-auto p-0 gap-0",
            "data-[state=open]:animate-slide-in-right data-[state=open]:duration-200",
          )}
        >
          {!panelBook && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
            </div>
          )}

          {panelBook && (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>{panelBook.title}</DialogTitle>
                <DialogDescription>Book details</DialogDescription>
              </DialogHeader>

              {/* Cover hero */}
              <div className="relative bg-muted/30 flex items-center justify-center py-10 px-6">
                <div className="w-36 aspect-[2/3] overflow-hidden rounded-md shadow-lg">
                  <BookCover book={panelBook} className="h-full w-full" showTitle={false} />
                </div>
                <button
                  className={cn(
                    "absolute top-4 right-4 p-2 rounded-full transition-colors",
                    panelBook.isFavorite
                      ? "bg-yellow-400/15 hover:bg-yellow-400/25"
                      : "bg-background/60 hover:bg-background/80 backdrop-blur-sm",
                  )}
                  onClick={() => void toggleFavorite(panelBook.id, !panelBook.isFavorite)}
                >
                  <Star className={cn("size-4", panelBook.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground/50")} />
                </button>
              </div>

              {/* Book info */}
              <div className="px-6 pt-5 pb-2">
                <h2 className="text-xl font-semibold leading-snug">{panelBook.title}</h2>
                {panelBook.author && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{panelBook.author}</p>
                )}
                {panelBook.series && (
                  <p className="mt-1 text-xs text-muted-foreground/50 italic">{panelBook.series}</p>
                )}
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/60">
                  <span className="font-medium uppercase bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">{panelBook.fileExt.toUpperCase()}</span>
                  <span className="tabular-nums">{formatSize(panelBook.fileSize)}</span>
                  {panelBook.koboSyncable === 1 && <Badge variant="default" className="text-[10px] px-1.5 py-0">Kobo</Badge>}
                </div>
              </div>

              <div className="px-6 py-4 space-y-5">
                {/* Status */}
                <ToggleGroup
                  type="single"
                  value={panelBook.progress?.status ?? "UNREAD"}
                  onValueChange={(v) => { if (v) void changeStatus(panelBook.id, v); }}
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

                {/* Progress */}
                {(panelBook.progress?.status === "READING" || (panelBook.progress?.progressPercent ?? 0) > 0) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Progress</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {panelBook.progress?.progressPercent ?? 0}%
                      </span>
                    </div>
                    <Progress value={panelBook.progress?.progressPercent ?? 0} className="h-1.5" />
                  </div>
                )}

                {/* Description */}
                {panelBook.description && !editMode && (
                  <div className="rounded-md bg-card border border-border/40 p-4">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {panelBook.description}
                    </p>
                  </div>
                )}

                {/* Actions row */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-2" onClick={() => handleDownload(panelBook.id)}>
                    <Download className="size-4" />
                    Download
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void refreshMetadata(panelBook.id)}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>

                <div className="h-px bg-border/40" />

                {/* Edit metadata */}
                <div>
                  <button
                    onClick={() => setEditMode(!editMode)}
                    className={cn(
                      "flex items-center gap-2 w-full text-sm font-medium py-1 transition-colors",
                      editMode ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Save className="size-4" />
                    Edit metadata
                    <ChevronDown className={cn("size-3.5 ml-auto transition-transform", editMode && "rotate-180")} />
                  </button>

                  {editMode && (
                    <div className="mt-3 space-y-3 rounded-md border border-border/40 bg-card p-4 animate-fade-in">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Title</Label>
                        <Input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Author</Label>
                        <Input value={draft.author} onChange={(e) => setDraft((p) => ({ ...p, author: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Series</Label>
                        <Input value={draft.series} onChange={(e) => setDraft((p) => ({ ...p, series: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Textarea
                          rows={3}
                          value={draft.description}
                          onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                          className="resize-none"
                        />
                      </div>
                      <Button size="sm" onClick={() => saveMetadata.mutate()} disabled={saveMetadata.isPending} className="gap-1.5">
                        {saveMetadata.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        Save changes
                      </Button>
                    </div>
                  )}
                </div>

                <div className="h-px bg-border/40" />

                {/* Collections */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Collections</span>
                  {bookCollections.isLoading && (
                    <div className="flex justify-center py-2">
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground/40" />
                    </div>
                  )}
                  {(bookCollections.data ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(bookCollections.data ?? []).map((collection) => (
                        <button
                          key={collection.id}
                          onClick={() => void setCollectionAssigned(collection.id, !collection.assigned)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            collection.assigned
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {collection.icon && <span className="text-sm">{collection.icon}</span>}
                          {collection.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {bookCollections.data?.length === 0 && (
                    <p className="text-xs text-muted-foreground/50">No collections</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

const GridCard: React.FC<{
  book: BookItem;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(({ book, onSelect, onToggleFavorite, onStatusChange, onRefreshMetadata, onDownload }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;

  return (
    <div className="group cursor-pointer" onClick={() => onSelect(book.id)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted/20 shadow-sm transition-shadow group-hover:shadow-md">
        <BookCover book={book} className="h-full w-full" />

        {/* Favorite */}
        <button
          className={cn(
            "absolute top-1.5 left-1.5 flex items-center justify-center size-6 rounded transition-all",
            book.isFavorite
              ? "bg-yellow-400/20 backdrop-blur-sm"
              : "bg-black/25 backdrop-blur-sm opacity-0 group-hover:opacity-100",
          )}
          onClick={(e) => { e.stopPropagation(); void onToggleFavorite(book.id, !book.isFavorite); }}
        >
          <Star className={cn("size-3", book.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-white/80")} />
        </button>

        {/* Format */}
        <span className="absolute top-1.5 right-1.5 text-[9px] font-medium bg-black/25 text-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded uppercase">
          {book.fileExt}
        </span>

        {/* Actions */}
        <div className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-center size-6 rounded bg-black/25 backdrop-blur-sm hover:bg-black/40"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-3 text-white/80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</DropdownMenuLabel>
              {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                const sc = statusConfig[s];
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={(e) => { e.stopPropagation(); void onStatusChange(book.id, s); }}
                    className={cn("gap-2 text-xs", status === s && "bg-accent")}
                  >
                    <sc.icon className="size-3.5" />
                    {sc.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void onRefreshMetadata(book.id); }} className="gap-2 text-xs">
                <RefreshCw className="size-3.5" />
                Refresh metadata
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(book.id); }} className="gap-2 text-xs">
                <Download className="size-3.5" />
                Download
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progress bar */}
        {status === "READING" && percent > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-0.5 bg-black/20">
            <div className="h-full bg-status-processing" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      <div className="pt-2 space-y-0.5">
        <h3 className="text-[13px] font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {book.title}
        </h3>
        <p className="text-xs text-muted-foreground truncate">{book.author ?? "Unknown author"}</p>
        {status !== "UNREAD" && (
          <div className="flex items-center gap-1 pt-0.5">
            <Badge variant={config.variant} className="text-[10px] gap-0.5 px-1.5 py-0 h-4">
              <config.icon className="size-2.5" />
              {config.label}
            </Badge>
            {status === "READING" && percent > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/50">{percent}%</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
GridCard.displayName = "GridCard";

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

const ListRow: React.FC<{
  book: BookItem;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
}> = React.memo(({ book, onSelect, onToggleFavorite, onStatusChange, onRefreshMetadata, onDownload }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;

  return (
    <div
      className="group cursor-pointer rounded-md hover:bg-accent/50 transition-colors"
      onClick={() => onSelect(book.id)}
    >
      <div className="flex items-center gap-3 px-2.5 py-2">
        <div className="h-12 w-8 shrink-0 overflow-hidden rounded shadow-sm">
          <BookCover book={book} className="h-full w-full" showTitle={false} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate group-hover:text-primary transition-colors">{book.title}</h3>
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
            {book.author ?? "Unknown author"}
            {book.series && <span className="text-muted-foreground/35"> &middot; {book.series}</span>}
          </p>
          {status === "READING" && percent > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 max-w-20 rounded-full bg-muted/60 overflow-hidden">
                <div className="h-full bg-status-processing rounded-full" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground/50">{percent}%</span>
            </div>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-muted/50"
            onClick={(e) => { e.stopPropagation(); void onToggleFavorite(book.id, !book.isFavorite); }}
          >
            <Star className={cn("size-3.5", book.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground/25")} />
          </button>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-medium uppercase">{book.fileExt}</span>
          <span className="text-[11px] text-muted-foreground/40 tabular-nums w-14 text-right">{formatSize(book.fileSize)}</span>
          <Badge variant={config.variant} className="text-[10px] gap-0.5 px-1.5 h-4">
            <config.icon className="size-2.5" />
            {config.label}
          </Badge>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="size-6 flex items-center justify-center rounded hover:bg-muted/60" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-3.5 text-muted-foreground/50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</DropdownMenuLabel>
              {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                const sc = statusConfig[s];
                return (
                  <DropdownMenuItem
                    key={s}
                    onClick={(e) => { e.stopPropagation(); void onStatusChange(book.id, s); }}
                    className={cn("gap-2 text-xs", status === s && "bg-accent")}
                  >
                    <sc.icon className="size-3.5" />
                    {sc.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); void onRefreshMetadata(book.id); }} className="gap-2 text-xs">
                <RefreshCw className="size-3.5" />
                Refresh metadata
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(book.id); }} className="gap-2 text-xs">
                <Download className="size-3.5" />
                Download
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
});
ListRow.displayName = "ListRow";
