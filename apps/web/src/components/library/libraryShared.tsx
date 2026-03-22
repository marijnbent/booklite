import React, { useEffect, useState } from "react";
import type { ReadStatus } from "@booklite/shared";
import type { MetadataCoverOption, MetadataSource } from "@/lib/metadata";
import { toRenderableCoverSrc } from "@/lib/covers";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Book,
  BookMarked,
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Minus,
  RefreshCw,
  RotateCcw,
  Star,
  Users,
  X,
} from "lucide-react";

export interface BookItem {
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
  isShared?: boolean;
  shareCount?: number;
  sharedByUsername?: string | null;
  createdAt: string;
  updatedAt: string;
  progress: {
    status: ReadStatus;
    progressPercent: number;
  } | null;
}

export interface BookCollectionAssignment {
  id: number;
  name: string;
  icon: string | null;
  slug: string | null;
  isSystem: boolean;
  assigned: boolean;
}

export interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
  slug?: string | null;
  is_system?: number;
  virtual?: number;
  book_count: number;
}

export interface MetadataPreview {
  source: MetadataSource;
  coverPath?: string | null;
  coverOptions: MetadataCoverOption[];
}

export interface PanelCoverOption extends MetadataCoverOption {
  label: string;
}

export type StatusFilter = "ALL" | "UNREAD" | "READING" | "READ" | "ABANDONED";
export type SortOption = "created" | "updated" | "title" | "author";
export type ViewMode = "grid" | "list";
export type DisplayStatus = Exclude<ReadStatus, "UNSET">;
export type StatusBadgeVariant = "secondary" | "info" | "success" | "warning" | "destructive" | "outline";

export type BookPages = {
  pages: BookItem[][];
  pageParams: unknown[];
};

export const PAGE_SIZE = 50;
export const SHARED_WITH_ME_COLLECTION_ID = -2;
export const UNCOLLECTED_COLLECTION_ID = -1;

export const manualStatusOptions = ["UNREAD", "READING", "READ", "ABANDONED"] as const;
export const statusFilterOptions = ["ALL", ...manualStatusOptions] as const;
export const statusFilterLabels: Record<StatusFilter, string> = {
  ALL: "All",
  UNREAD: "Unread",
  READING: "Reading",
  READ: "Done",
  ABANDONED: "Did not finish",
};

export const statusConfig: Record<
  DisplayStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: StatusBadgeVariant }
> = {
  UNREAD: { label: "Unread", icon: Book, variant: "secondary" },
  READING: { label: "Reading", icon: BookOpen, variant: "info" },
  RE_READING: { label: "Re-reading", icon: RotateCcw, variant: "info" },
  READ: { label: "Done", icon: CheckCircle2, variant: "success" },
  PARTIALLY_READ: { label: "Partially read", icon: BookMarked, variant: "warning" },
  PAUSED: { label: "Paused", icon: Minus, variant: "warning" },
  ABANDONED: { label: "Did not finish", icon: X, variant: "destructive" },
  WONT_READ: { label: "Won't read", icon: X, variant: "outline" },
};

export const detailStatusOptions = manualStatusOptions.map((status) => ({
  value: status,
  label: statusConfig[status].label,
  icon: statusConfig[status].icon,
}));

export const getDisplayStatus = (status: ReadStatus | null | undefined): DisplayStatus =>
  status && status !== "UNSET" ? status : "UNREAD";

export const getStatusFilterBucket = (status: ReadStatus | null | undefined): Exclude<StatusFilter, "ALL"> => {
  const displayStatus = getDisplayStatus(status);
  if (
    displayStatus === "READING" ||
    displayStatus === "RE_READING" ||
    displayStatus === "PARTIALLY_READ" ||
    displayStatus === "PAUSED"
  ) {
    return "READING";
  }
  if (displayStatus === "READ") return "READ";
  if (displayStatus === "ABANDONED") return "ABANDONED";
  return "UNREAD";
};

function coverHue(id: number): number {
  return (((id * 137.508) % 360) + 360) % 360;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getShareBadgeData(
  book: Pick<BookItem, "isShared" | "shareCount" | "sharedByUsername">
): { label: string; title: string; truncate?: boolean } | null {
  if (book.isShared && book.sharedByUsername) {
    return {
      label: book.sharedByUsername,
      title: `Shared by ${book.sharedByUsername}`,
      truncate: true,
    };
  }

  const shareCount = book.shareCount ?? 0;
  if (!book.isShared && shareCount > 0) {
    return {
      label: String(shareCount),
      title: `Shared with ${shareCount} ${shareCount === 1 ? "person" : "people"}`,
    };
  }

  return null;
}

export const BookShareBadge: React.FC<{
  book: Pick<BookItem, "isShared" | "shareCount" | "sharedByUsername">;
  className?: string;
}> = ({ book, className }) => {
  const badge = getShareBadgeData(book);

  if (!badge) return null;

  return (
    <Badge
      variant="outline"
      title={badge.title}
      className={cn(
        "gap-1 border-border/60 bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm",
        className
      )}
    >
      <Users className="size-2.5" />
      <span className={badge.truncate ? "max-w-[84px] truncate" : "tabular-nums"}>{badge.label}</span>
    </Badge>
  );
};

export function updateBookInData<T>(
  data: T,
  bookId: number,
  updater: (book: BookItem) => BookItem
): T {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === "object" && item !== null && "id" in item && (item as BookItem).id === bookId
        ? updater(item as BookItem)
        : item
    ) as T;
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "pages" in data &&
    Array.isArray((data as unknown as BookPages).pages)
  ) {
    const pages = (data as unknown as BookPages).pages.map((page) =>
      page.map((book) => (book.id === bookId ? updater(book) : book))
    );
    return { ...(data as unknown as BookPages), pages } as T;
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    (data as unknown as BookItem).id === bookId
  ) {
    return updater(data as unknown as BookItem) as T;
  }

  return data;
}

export function sortBooks(a: BookItem, b: BookItem, sort: SortOption): number {
  if (sort === "created") {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }
  if (sort === "title") {
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  }
  if (sort === "author") {
    return (a.author ?? "").localeCompare(b.author ?? "", undefined, { sensitivity: "base" });
  }
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function normalizeCoverPath(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/\\\//g, "/");
}

export function buildPanelCoverOptions(
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
      label,
    });
  };

  pushOption(currentCoverPath, null, "Current cover");

  for (const option of previewOptions ?? []) {
    pushOption(option.coverPath, option.source, "Suggestion");
  }

  return options;
}

export function isVirtualCollection(collection: CollectionItem | null | undefined): boolean {
  return Boolean(
    collection &&
      (collection.virtual === 1 ||
        collection.id === SHARED_WITH_ME_COLLECTION_ID ||
        collection.id === UNCOLLECTED_COLLECTION_ID)
  );
}

export type CollectionIconLike = {
  icon: string | null;
  slug?: string | null;
};

export function renderCollectionIcon(
  collection: CollectionIconLike,
  options?: {
    fallback?: boolean;
    svgClassName?: string;
    textClassName?: string;
  }
): React.ReactNode {
  if (collection.slug === "favorites") {
    return <Star className={cn(options?.svgClassName ?? "size-3.5", "fill-current")} />;
  }

  if (collection.slug === "uncollected") {
    return <FolderOpen className={options?.svgClassName ?? "size-3.5"} />;
  }

  if (collection.slug === "shared-with-me") {
    return <Users className={options?.svgClassName ?? "size-3.5"} />;
  }

  if (collection.icon) {
    return <span className={options?.textClassName ?? "text-sm leading-none"}>{collection.icon}</span>;
  }

  if (options?.fallback) {
    return <FolderOpen className={options.svgClassName ?? "size-3.5"} />;
  }

  return null;
}

export const BookCover: React.FC<{
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
