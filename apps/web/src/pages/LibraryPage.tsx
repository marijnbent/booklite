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
import { useNavigate } from "react-router-dom";
import { apiFetch, apiFetchRaw } from "@/lib/api";
import { toRenderableCoverSrc } from "@/lib/covers";
import type { MetadataCoverOption, MetadataSource } from "@/lib/metadata";
import { sourceLabel } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CoverOptionGrid } from "@/components/CoverOptionGrid";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertCircle,
  ArrowDownAZ,
  Book,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Download,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  Image as ImageIcon,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Star,
  Trash2,
  X,
  Minus,
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

interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
  slug?: string | null;
  is_system?: number;
  virtual?: number;
  book_count: number;
}

interface MetadataPreview {
  source: MetadataSource;
  coverPath?: string | null;
  coverOptions: MetadataCoverOption[];
}

interface PanelCoverOption extends MetadataCoverOption {
  label: string;
}

type StatusFilter = "ALL" | "UNREAD" | "READING" | "DONE";
type SortOption = "updated" | "title" | "author";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 50;
const UNCOLLECTED_COLLECTION_ID = -1;

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

function normalizeCoverPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/\\\//g, "/");
}

function buildPanelCoverOptions(
  currentCoverPath: string | null,
  previewOptions: MetadataCoverOption[] | undefined
): PanelCoverOption[] {
  const options: PanelCoverOption[] = [];
  const seen = new Set<string>();

  const pushOption = (coverPath: string | null | undefined, source: string | null, label: string) => {
    const normalized = normalizeCoverPath(coverPath);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    options.push({
      coverPath: coverPath!.trim(),
      source: (source ?? "OPEN_LIBRARY") as PanelCoverOption["source"],
      label
    });
  };

  pushOption(currentCoverPath, null, "Current cover");

  for (const option of previewOptions ?? []) {
    pushOption(option.coverPath, option.source, "Suggestion");
  }

  return options;
}

function isVirtualCollection(collection: CollectionItem | null | undefined): boolean {
  return Boolean(collection && (collection.virtual === 1 || collection.id === UNCOLLECTED_COLLECTION_ID));
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
  const renderableCoverSrc = toRenderableCoverSrc(book.coverPath);

  useEffect(() => {
    setImgError(false);
  }, [book.coverPath]);

  if (renderableCoverSrc && !imgError) {
    return (
      <img
        src={renderableCoverSrc}
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
            {collection.icon && <span className="text-lg">{collection.icon}</span>}
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

const BookMenuItems: React.FC<{
  book: BookItem;
  collections: CollectionItem[];
  activeCollectionId: number | null;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
  onAddToCollection: (bookId: number, collectionId: number) => void;
  onRemoveFromCollection: (bookId: number, collectionId: number) => void;
  onDelete: (id: number) => void;
  onToggleSelect: (id: number) => void;
  MenuItem: React.FC<React.ComponentPropsWithoutRef<"div"> & { onClick?: () => void }>;
  MenuSeparator: React.FC;
  MenuSub: React.FC<{ children: React.ReactNode }>;
  MenuSubTrigger: React.FC<{ children: React.ReactNode; className?: string }>;
  MenuSubContent: React.FC<{ children: React.ReactNode; className?: string }>;
}> = ({
  book,
  collections,
  activeCollectionId,
  onSelect,
  onToggleFavorite,
  onStatusChange,
  onRefreshMetadata,
  onDownload,
  onAddToCollection,
  onRemoveFromCollection,
  onDelete,
  onToggleSelect,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
}) => {
  const status = book.progress?.status ?? "UNREAD";
  const assignableCollections = collections.filter((collection) => !isVirtualCollection(collection));
  const canRemoveFromActiveCollection =
    activeCollectionId !== null &&
    assignableCollections.some((collection) => collection.id === activeCollectionId);

  return (
    <>
      <MenuItem onClick={() => onSelect(book.id)} className="gap-2 text-xs">
        <Book className="size-3.5" />
        View details
      </MenuItem>
      <MenuSeparator />

      {/* Collections submenu */}
      {assignableCollections.length > 0 && (
        <>
          <MenuSub>
            <MenuSubTrigger className="gap-2 text-xs">
              <FolderOpen className="size-3.5" />
              Collections
            </MenuSubTrigger>
            <MenuSubContent className="w-44">
              {assignableCollections.map((col) => (
                <MenuItem
                  key={col.id}
                  onClick={() => {
                    if (col.id !== activeCollectionId) onAddToCollection(book.id, col.id);
                  }}
                  className={cn("gap-2 text-xs", col.id === activeCollectionId && "bg-accent")}
                >
                  {col.icon ? <span className="text-sm leading-none">{col.icon}</span> : <FolderOpen className="size-3.5" />}
                  <span className="truncate">{col.name}</span>
                  {col.id === activeCollectionId ? (
                    <Check className="size-3 ml-auto text-primary" />
                  ) : (
                    <Plus className="size-3 ml-auto text-muted-foreground/50" />
                  )}
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
          {canRemoveFromActiveCollection && (
            <MenuItem
              onClick={() => onRemoveFromCollection(book.id, activeCollectionId)}
              className="gap-2 text-xs text-destructive focus:text-destructive"
            >
              <X className="size-3.5" />
              Remove from collection
            </MenuItem>
          )}
          <MenuSeparator />
        </>
      )}

      {/* Status */}
      <MenuSub>
        <MenuSubTrigger className="gap-2 text-xs">
          <BookOpen className="size-3.5" />
          Status
        </MenuSubTrigger>
        <MenuSubContent className="w-36">
          {(["UNREAD", "READING", "DONE"] as const).map((s) => {
            const sc = statusConfig[s];
            return (
              <MenuItem
                key={s}
                onClick={() => onStatusChange(book.id, s)}
                className={cn("gap-2 text-xs", status === s && "bg-accent")}
              >
                <sc.icon className="size-3.5" />
                {sc.label}
                {status === s && <Check className="size-3 ml-auto" />}
              </MenuItem>
            );
          })}
        </MenuSubContent>
      </MenuSub>

      <MenuItem
        onClick={() => onToggleFavorite(book.id, !book.isFavorite)}
        className="gap-2 text-xs"
      >
        <Star className={cn("size-3.5", book.isFavorite && "fill-yellow-400 text-yellow-500")} />
        {book.isFavorite ? "Unfavorite" : "Favorite"}
      </MenuItem>

      <MenuSeparator />

      <MenuItem onClick={() => onRefreshMetadata(book.id)} className="gap-2 text-xs">
        <RefreshCw className="size-3.5" />
        Refresh metadata
      </MenuItem>
      <MenuItem onClick={() => onDownload(book.id)} className="gap-2 text-xs">
        <Download className="size-3.5" />
        Download
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => onToggleSelect(book.id)} className="gap-2 text-xs">
        <CheckSquare className="size-3.5" />
        Select
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        onClick={() => {
          if (window.confirm(`Delete "${book.title}"? This cannot be undone.`))
            onDelete(book.id);
        }}
        className="gap-2 text-xs text-destructive focus:text-destructive"
      >
        <Trash2 className="size-3.5" />
        Delete
      </MenuItem>
    </>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sort, setSort] = useState<SortOption>("updated");
  const [view, setView] = useState<ViewMode>("grid");
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState({ title: "", author: "", series: "", description: "" });
  const [showPanelCoverImage, setShowPanelCoverImage] = useState(false);
  const [coverOptionsRequested, setCoverOptionsRequested] = useState(false);

  // Collection state
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionItem | null>(null);
  const [addBooksDialogOpen, setAddBooksDialogOpen] = useState(false);

  // Multi-select state
  const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const lastClickedIdRef = useRef<number | null>(null);
  const selectionActive = selectionMode || selectedBookIds.size > 0;

  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedBookIds(new Set());
    setSelectionMode(false);
  }, [selectedCollectionId, statusFilter, debouncedQuery]);

  // Close detail panel when multiple books selected
  useEffect(() => {
    if (selectedBookIds.size > 1) setSelectedBookId(null);
  }, [selectedBookIds.size]);

  // Escape key clears selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectionActive) {
        setSelectedBookIds(new Set());
        setSelectionMode(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectionActive]);

  // Collections
  const collectionsQuery = useQuery({
    queryKey: ["collections"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections?includeVirtual=true"),
  });

  const collections = collectionsQuery.data ?? [];

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
      selectedCollectionId !== null && selectedCollectionId !== UNCOLLECTED_COLLECTION_ID,
  });

  const uncollectedBooksQuery = useQuery({
    queryKey: ["collection-books", "uncollected"],
    queryFn: () => apiFetch<BookItem[]>("/api/v1/collections/uncollected/books"),
    enabled: selectedCollectionId === UNCOLLECTED_COLLECTION_ID,
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
    uncollectedBooksQuery.data,
    booksQuery.data,
    debouncedQuery,
  ]);

  const collectionBookIds = useMemo(
    () =>
      selectedCollectionId !== null && selectedCollectionId !== UNCOLLECTED_COLLECTION_ID
        ? new Set((collectionBooksQuery.data ?? []).map((b) => b.id))
        : new Set<number>(),
    [selectedCollectionId, collectionBooksQuery.data],
  );

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
    setShowPanelCoverImage(false);
    setCoverOptionsRequested(false);
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

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["books"] });
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-books"] });
  }, [queryClient]);

  const changeStatus = useCallback(
    async (bookId: number, status: string) => {
      await apiFetch(`/api/v1/books/${bookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      invalidateAll();
    },
    [invalidateAll],
  );

  const refreshMetadata = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}/metadata/fetch`, { method: "POST" });
      invalidateAll();
    },
    [invalidateAll],
  );

  const deleteBook = useCallback(
    async (bookId: number) => {
      await apiFetch(`/api/v1/books/${bookId}`, { method: "DELETE" });
      invalidateAll();
    },
    [invalidateAll],
  );

  const toggleFavorite = useCallback(
    async (bookId: number, favorite: boolean) => {
      await apiFetch(`/api/v1/books/${bookId}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      invalidateAll();
    },
    [invalidateAll],
  );

  const addToCollection = useCallback(
    async (bookId: number, collectionId: number) => {
      await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, { method: "POST" });
      invalidateAll();
    },
    [invalidateAll],
  );

  const removeFromCollection = useCallback(
    async (bookId: number, collectionId: number) => {
      await apiFetch(`/api/v1/collections/${collectionId}/books/${bookId}`, { method: "DELETE" });
      invalidateAll();
    },
    [invalidateAll],
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
      invalidateAll();
    },
    [selectedBookId, bookCollections.data, queryClient, invalidateAll],
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

  const openReader = useCallback(
    (bookId: number) => {
      window.open(`/library/${bookId}/read`, "_blank");
    },
    [],
  );

  const handleBookClick = useCallback(
    (bookId: number, event: React.MouseEvent) => {
      if (event.metaKey || event.ctrlKey) {
        // Toggle selection
        setSelectedBookIds((prev) => {
          const next = new Set(prev);
          if (next.has(bookId)) next.delete(bookId);
          else next.add(bookId);
          return next;
        });
        lastClickedIdRef.current = bookId;
      } else if (event.shiftKey && lastClickedIdRef.current !== null) {
        // Range select
        const ids = filteredAndSorted.map((b) => b.id);
        const from = ids.indexOf(lastClickedIdRef.current);
        const to = ids.indexOf(bookId);
        if (from !== -1 && to !== -1) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          setSelectedBookIds((prev) => {
            const next = new Set(prev);
            for (let i = lo; i <= hi; i++) next.add(ids[i]);
            return next;
          });
        }
      } else if (selectionActive) {
        // In selection mode, plain click toggles
        setSelectedBookIds((prev) => {
          const next = new Set(prev);
          if (next.has(bookId)) next.delete(bookId);
          else next.add(bookId);
          return next;
        });
        lastClickedIdRef.current = bookId;
      } else {
        // Plain click
        setSelectedBookIds(new Set());
        setSelectedBookId(bookId);
      }
    },
    [filteredAndSorted, selectionActive],
  );

  const handleToggleSelect = useCallback((bookId: number) => {
    setSelectedBookIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
    lastClickedIdRef.current = bookId;
  }, []);

  const isLoading = selectedCollectionId !== null
    ? selectedCollectionId === UNCOLLECTED_COLLECTION_ID
      ? uncollectedBooksQuery.isLoading
      : collectionBooksQuery.isLoading
    : booksQuery.isLoading;
  const isError = selectedCollectionId !== null
    ? selectedCollectionId === UNCOLLECTED_COLLECTION_ID
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
      onAddToCollection: (bookId: number, collectionId: number) => void addToCollection(bookId, collectionId),
      onRemoveFromCollection: (bookId: number, collectionId: number) => void removeFromCollection(bookId, collectionId),
      onDelete: (id: number) => void deleteBook(id),
      onBookClick: handleBookClick,
      onToggleSelect: handleToggleSelect,
    }),
    [collections, selectedCollectionId, toggleFavorite, changeStatus, refreshMetadata, handleDownload, addToCollection, removeFromCollection, deleteBook, handleBookClick, handleToggleSelect],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Library</h1>
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

          <Button
            variant={selectionActive ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => {
              if (selectionActive) {
                setSelectedBookIds(new Set());
                setSelectionMode(false);
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
                "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
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

      {/* Collection filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium mr-1">Collections</span>
        <button
          onClick={() => setSelectedCollectionId(null)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            selectedCollectionId === null
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          All
        </button>
        {collections.map((col) =>
          isVirtualCollection(col) ? (
            <button
              key={col.id}
              onClick={() => setSelectedCollectionId(selectedCollectionId === col.id ? null : col.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                selectedCollectionId === col.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {col.icon && <span className="text-sm leading-none">{col.icon}</span>}
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
                    "shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedCollectionId === col.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {col.icon && <span className="text-sm leading-none">{col.icon}</span>}
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
          className="shrink-0 flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground/40 hover:bg-accent hover:text-foreground transition-colors"
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
                ? selectedCollectionId === UNCOLLECTED_COLLECTION_ID
                  ? "No uncollected books"
                  : "This collection is empty"
                : "Your library is empty"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {debouncedQuery
              ? "Try a different search."
              : selectedCollectionId !== null
                ? selectedCollectionId === UNCOLLECTED_COLLECTION_ID
                  ? "Books disappear from this shelf as soon as they are added to a collection."
                  : "Add books using the button above or right-click a book."
                : "Upload some books to get started."}
          </p>
          {selectedCollectionId !== null && !debouncedQuery && selectedCollectionId !== UNCOLLECTED_COLLECTION_ID && (
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
          collections={collections}
          onAddToCollection={async (collectionId) => {
            await Promise.all([...selectedBookIds].map((id) => addToCollection(id, collectionId)));
            setSelectedBookIds(new Set());
          }}
          onSetStatus={async (status) => {
            await Promise.all([...selectedBookIds].map((id) => changeStatus(id, status)));
            setSelectedBookIds(new Set());
          }}
          onRefreshMetadata={async () => {
            await Promise.all([...selectedBookIds].map((id) => refreshMetadata(id)));
            setSelectedBookIds(new Set());
          }}
          onDownload={async () => {
            for (const id of selectedBookIds) await handleDownload(id);
            setSelectedBookIds(new Set());
          }}
          onDelete={async () => {
            const count = selectedBookIds.size;
            if (!window.confirm(`Delete ${count} book${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
            await Promise.all([...selectedBookIds].map((id) => deleteBook(id)));
            setSelectedBookIds(new Set());
            setSelectionMode(false);
          }}
          onClear={() => { setSelectedBookIds(new Set()); setSelectionMode(false); }}
        />
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
            /* Hide the built-in close button — the drawer has its own controls */
            "[&>button:last-child]:hidden",
          )}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{panelBook?.title ?? "Book details"}</DialogTitle>
            <DialogDescription>View and manage book details.</DialogDescription>
          </DialogHeader>

          {!panelBook && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
            </div>
          )}

          {panelBook && (
            <div className="flex flex-col min-h-0">
              {/* Hero cover area */}
              <div className="relative flex justify-center bg-secondary/30 py-6">
                <div className="w-36 aspect-[2/3] overflow-hidden rounded-lg shadow-md">
                  <BookCover
                    book={panelBook}
                    className="h-full w-full"
                    showTitle={false}
                  />
                </div>
                {/* Favorite overlay */}
                <button
                  className="absolute top-3 right-12"
                  onClick={() => void toggleFavorite(panelBook.id, !panelBook.isFavorite)}
                  title={panelBook.isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <Star className={cn("size-5", panelBook.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground/40 hover:text-muted-foreground")} />
                </button>
                {/* Overflow menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="absolute top-3 right-3 rounded-md p-1 hover:bg-secondary/60 text-muted-foreground/60 hover:text-foreground transition-colors">
                      <MoreHorizontal className="size-5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void refreshMetadata(panelBook.id)}>
                      <RefreshCw className="size-3.5 mr-2" />
                      Refresh metadata
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      if (!coverOptionsRequested) {
                        setCoverOptionsRequested(true);
                        setShowPanelCoverImage(true);
                      } else {
                        setCoverOptionsRequested(false);
                      }
                    }}>
                      <ImageIcon className="size-3.5 mr-2" />
                      Change cover
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditMode(!editMode)}>
                      <Pencil className="size-3.5 mr-2" />
                      Edit metadata
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Title + meta (centered) */}
              <div className="px-5 pt-4 pb-3 text-center">
                <h2 className="text-base font-semibold leading-snug line-clamp-3">{panelBook.title}</h2>
                {panelBook.author && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-1">{panelBook.author}</p>
                )}
                {panelBook.series && (
                  <p className="mt-0.5 text-xs text-muted-foreground/50 italic line-clamp-1">{panelBook.series}</p>
                )}
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                  <span className="font-medium uppercase bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground text-[11px]">{panelBook.fileExt.toUpperCase()}</span>
                  <span className="tabular-nums">{formatSize(panelBook.fileSize)}</span>
                  {panelBook.koboSyncable === 1 && <span className="flex items-center gap-0.5 font-medium bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground text-[11px]"><RefreshCw className="size-2.5" />Kobo</span>}
                </div>
              </div>

              {/* Status + Actions (single row) */}
              <div className="flex items-center gap-2 px-5 pb-3">
                <ToggleGroup
                  type="single"
                  value={panelBook.progress?.status ?? "UNREAD"}
                  onValueChange={(v) => { if (v) void changeStatus(panelBook.id, v); }}
                  className="flex-1 bg-secondary rounded-md p-0.5"
                >
                  {(["UNREAD", "READING", "DONE"] as const).map((s) => {
                    const c = statusConfig[s];
                    return (
                      <ToggleGroupItem
                        key={s}
                        value={s}
                        className="flex-1 gap-1 text-[11px] h-7 rounded data-[state=on]:bg-card data-[state=on]:shadow-sm"
                      >
                        <c.icon className="size-3" />
                        {c.label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
                {panelBook.fileExt.toLowerCase() === "epub" && (
                  <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => openReader(panelBook.id)} title="Read">
                    <BookOpen className="size-3.5" />
                  </Button>
                )}
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => handleDownload(panelBook.id)} title="Download">
                  <Download className="size-3.5" />
                </Button>
              </div>

              <div className="px-5 pb-5 space-y-3">
                {/* Progress (conditional, single line) */}
                {(panelBook.progress?.status === "READING" || (panelBook.progress?.progressPercent ?? 0) > 0) && (
                  <div className="flex items-center gap-2">
                    <Progress value={panelBook.progress?.progressPercent ?? 0} className="h-1 flex-1" />
                    <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      {panelBook.progress?.progressPercent ?? 0}%
                    </span>
                  </div>
                )}

                {/* Description */}
                {panelBook.description && !editMode && (
                  <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-4">
                    {panelBook.description}
                  </p>
                )}

                {/* Collections (no label, hidden when empty) */}
                {bookCollections.isLoading && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground/40" />
                  </div>
                )}
                {(bookCollections.data ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(bookCollections.data ?? []).map((collection) => (
                      <button
                        key={collection.id}
                        onClick={() => void setCollectionAssigned(collection.id, !collection.assigned)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
                          collection.assigned
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {collection.icon && <span className="text-xs">{collection.icon}</span>}
                        {collection.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Expandable: Change cover */}
                {coverOptionsRequested && (
                  <div className="animate-fade-in">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <ImageIcon className="size-3" />
                        Change cover
                        {(setBookCover.isPending || coverPreviewQuery.isLoading) && <Loader2 className="size-3 animate-spin" />}
                      </span>
                      <button onClick={() => setCoverOptionsRequested(false)} className="text-muted-foreground/50 hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <CoverOptionGrid
                      selectedCoverPath={panelBook.coverPath ?? ""}
                      options={
                        panelCoverOptions.map((option) => ({
                          ...option,
                          badgeLabel: option.label,
                          metaLabel:
                            option.label === "Current cover"
                              ? "Saved on this book"
                              : sourceLabel(option.source)
                        }))
                      }
                      onSelectCover={(coverPath) => {
                        setShowPanelCoverImage(true);
                        setBookCover.mutate(coverPath);
                      }}
                      onClearCover={() => {
                        setShowPanelCoverImage(false);
                        setBookCover.mutate(null);
                      }}
                      clearSelectedLabel="Using title card"
                      clearIdleLabel="Remove cover"
                      idleActionLabel="Click to use"
                      className="xl:grid-cols-2"
                      emptyState={
                        coverPreviewQuery.isLoading ? (
                          <div className="col-span-1 flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20">
                            <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2">
                            <ImageIcon className="size-4 text-muted-foreground shrink-0" />
                            <p className="text-xs text-muted-foreground">No cover suggestions found</p>
                          </div>
                        )
                      }
                    />
                  </div>
                )}

                {/* Expandable: Edit metadata */}
                {editMode && (
                  <div className="animate-fade-in">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Pencil className="size-3" />
                        Edit metadata
                      </span>
                      <button onClick={() => setEditMode(false)} className="text-muted-foreground/50 hover:text-foreground">
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2 rounded-md border border-border/40 bg-card p-3">
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">Title</Label>
                        <Input className="h-8" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">Author</Label>
                        <Input className="h-8" value={draft.author} onChange={(e) => setDraft((p) => ({ ...p, author: e.target.value }))} />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">Series</Label>
                        <Input className="h-8" value={draft.series} onChange={(e) => setDraft((p) => ({ ...p, series: e.target.value }))} />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[11px] text-muted-foreground">Description</Label>
                        <Textarea
                          rows={2}
                          value={draft.description}
                          onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                          className="resize-none"
                        />
                      </div>
                      <Button size="sm" onClick={() => saveMetadata.mutate()} disabled={saveMetadata.isPending} className="gap-1.5 h-8">
                        {saveMetadata.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        Save changes
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  );
};

// ---------------------------------------------------------------------------
// Selection toolbar
// ---------------------------------------------------------------------------

const SelectionToolbar: React.FC<{
  selectedCount: number;
  collections: CollectionItem[];
  onAddToCollection: (collectionId: number) => void;
  onSetStatus: (status: string) => void;
  onRefreshMetadata: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}> = ({ selectedCount, collections, onAddToCollection, onSetStatus, onRefreshMetadata, onDownload, onDelete, onClear }) => {
  const assignableCollections = collections.filter((c) => !isVirtualCollection(c));

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex items-center gap-1 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-3 py-2 animate-slide-up">
      <span className="text-sm font-medium whitespace-nowrap px-1">{selectedCount} selected</span>
      <div className="h-5 w-px bg-border/60 mx-0.5" />

      {assignableCollections.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" title="Add to collection">
              <FolderPlus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuLabel className="text-xs">Add to collection</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {assignableCollections.map((col) => (
              <DropdownMenuItem
                key={col.id}
                onClick={() => onAddToCollection(col.id)}
                className="gap-2 text-xs"
              >
                {col.icon ? <span className="text-sm leading-none">{col.icon}</span> : <FolderOpen className="size-3.5" />}
                <span className="truncate">{col.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" title="Set status">
            <BookOpen className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-36">
          {(["UNREAD", "READING", "DONE"] as const).map((s) => {
            const sc = statusConfig[s];
            return (
              <DropdownMenuItem key={s} onClick={() => onSetStatus(s)} className="gap-2 text-xs">
                <sc.icon className="size-3.5" />
                {sc.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" className="size-8" title="Refresh metadata" onClick={onRefreshMetadata}>
        <RefreshCw className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8" title="Download" onClick={onDownload}>
        <Download className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        title="Delete"
        onClick={onDelete}
      >
        <Trash2 className="size-4" />
      </Button>

      <div className="h-5 w-px bg-border/60 mx-0.5" />
      <Button variant="ghost" size="icon" className="size-7" onClick={onClear}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

type BookMenuProps = {
  collections: CollectionItem[];
  activeCollectionId: number | null;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, fav: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
  onAddToCollection: (bookId: number, collectionId: number) => void;
  onRemoveFromCollection: (bookId: number, collectionId: number) => void;
  onDelete: (id: number) => void;
  onBookClick: (id: number, event: React.MouseEvent) => void;
  onToggleSelect: (id: number) => void;
};

const GridCard: React.FC<{
  book: BookItem;
  menuProps: BookMenuProps;
  isSelected: boolean;
  selectionActive: boolean;
}> = React.memo(({ book, menuProps, isSelected, selectionActive }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group cursor-pointer" onClick={(e) => menuProps.onBookClick(book.id, e)}>
          <div className={cn(
            "relative aspect-[2/3] overflow-hidden rounded-md bg-muted/20 shadow-sm transition-all group-hover:shadow-md",
            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}>
            <BookCover book={book} className="h-full w-full" />

            {/* Selection checkbox / Favorite */}
            {selectionActive ? (
              <button
                className={cn(
                  "absolute top-1.5 left-1.5 flex items-center justify-center size-6 rounded-full border-2 transition-all",
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-black/25 border-white/60 backdrop-blur-sm",
                )}
                onClick={(e) => { e.stopPropagation(); menuProps.onToggleSelect(book.id); }}
              >
                {isSelected && <Check className="size-3 text-primary-foreground" />}
              </button>
            ) : (
              <button
                className={cn(
                  "absolute top-1.5 left-1.5 flex items-center justify-center size-6 rounded transition-all",
                  book.isFavorite
                    ? "bg-yellow-400/20 backdrop-blur-sm"
                    : "bg-black/25 backdrop-blur-sm opacity-0 group-hover:opacity-100",
                )}
                onClick={(e) => { e.stopPropagation(); void menuProps.onToggleFavorite(book.id, !book.isFavorite); }}
              >
                <Star className={cn("size-3", book.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-white/80")} />
              </button>
            )}

            {/* Format + Kobo */}
            {book.koboSyncable === 1 && (
              <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 text-[9px] font-medium bg-black/50 text-white backdrop-blur-sm px-1.5 py-0.5 rounded"><RefreshCw className="size-2" />Kobo</span>
            )}

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
                <DropdownMenuContent align="end" className="w-44">
                  <BookMenuItems
                    book={book}
                    {...menuProps}
                    MenuItem={DropdownMenuItem as any}
                    MenuSeparator={DropdownMenuSeparator}
                    MenuSub={DropdownMenuSub as any}
                    MenuSubTrigger={DropdownMenuSubTrigger as any}
                    MenuSubContent={DropdownMenuSubContent as any}
                  />
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
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <BookMenuItems
          book={book}
          {...menuProps}
          MenuItem={ContextMenuItem as any}
          MenuSeparator={ContextMenuSeparator}
          MenuSub={ContextMenuSub as any}
          MenuSubTrigger={ContextMenuSubTrigger as any}
          MenuSubContent={ContextMenuSubContent as any}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
});
GridCard.displayName = "GridCard";

// ---------------------------------------------------------------------------
// List row
// ---------------------------------------------------------------------------

const ListRow: React.FC<{
  book: BookItem;
  menuProps: BookMenuProps;
  isSelected: boolean;
  selectionActive: boolean;
}> = React.memo(({ book, menuProps, isSelected, selectionActive }) => {
  const status = book.progress?.status ?? "UNREAD";
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group cursor-pointer rounded-md transition-colors",
            isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/50",
          )}
          onClick={(e) => menuProps.onBookClick(book.id, e)}
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            {selectionActive && (
              <button
                className={cn(
                  "flex items-center justify-center size-5 shrink-0 rounded-full border-2 transition-all",
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-transparent border-muted-foreground/30",
                )}
                onClick={(e) => { e.stopPropagation(); menuProps.onToggleSelect(book.id); }}
              >
                {isSelected && <Check className="size-3 text-primary-foreground" />}
              </button>
            )}
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
              {!selectionActive && (
                <button
                  className="p-1 rounded hover:bg-muted/50"
                  onClick={(e) => { e.stopPropagation(); void menuProps.onToggleFavorite(book.id, !book.isFavorite); }}
                >
                  <Star className={cn("size-3.5", book.isFavorite ? "fill-yellow-400 text-yellow-500" : "text-muted-foreground/25")} />
                </button>
              )}
              {book.koboSyncable === 1 && <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-medium"><RefreshCw className="size-2.5" />Kobo</span>}
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
                <DropdownMenuContent align="end" className="w-44">
                  <BookMenuItems
                    book={book}
                    {...menuProps}
                    MenuItem={DropdownMenuItem as any}
                    MenuSeparator={DropdownMenuSeparator}
                    MenuSub={DropdownMenuSub as any}
                    MenuSubTrigger={DropdownMenuSubTrigger as any}
                    MenuSubContent={DropdownMenuSubContent as any}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <BookMenuItems
          book={book}
          {...menuProps}
          MenuItem={ContextMenuItem as any}
          MenuSeparator={ContextMenuSeparator}
          MenuSub={ContextMenuSub as any}
          MenuSubTrigger={ContextMenuSubTrigger as any}
          MenuSubContent={ContextMenuSubContent as any}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
});
ListRow.displayName = "ListRow";
