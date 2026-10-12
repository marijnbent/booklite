import React from "react";
import type { BookMenuProps } from "@/components/library/LibraryBookMenu";
import {
  BookMenuItems,
  contextMenuComponents,
  dropdownMenuComponents,
} from "@/components/library/LibraryBookMenu";
import type { BookItem, CollectionItem } from "@/components/library/libraryShared";
import {
  BookCover,
  BookShareBadge,
  formatSize,
  getDisplayStatus,
  getShareBadgeData,
  getStatusFilterBucket,
  isVirtualCollection,
  manualStatusOptions,
  renderCollectionIcon,
  statusConfig,
} from "@/components/library/libraryShared";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BookOpen,
  Check,
  Download,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const SelectionToolbar: React.FC<{
  selectedCount: number;
  selectedBooks: BookItem[];
  collections: CollectionItem[];
  onAddToCollection: (collectionId: number) => void;
  onSetStatus: (status: string) => void;
  onShare: () => void;
  onRefreshMetadata: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}> = ({
  selectedCount,
  selectedBooks,
  collections,
  onAddToCollection,
  onSetStatus,
  onShare,
  onRefreshMetadata,
  onDownload,
  onDelete,
  onClear,
}) => {
  const assignableCollections = collections.filter((collection) => !isVirtualCollection(collection));
  const allOwned = selectedBooks.length > 0 && selectedBooks.every((book) => !book.isShared);

  return (
    <div className="selection-toolbar animate-fade-in">
      <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Clear selection" onClick={onClear}>
        <X className="size-4" />
      </Button>
      <span className="whitespace-nowrap px-1 text-sm font-medium">{selectedCount}<span className="max-[379px]:sr-only"> selected</span></span>
      <div className="ml-auto flex items-center gap-0.5">

      {assignableCollections.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-auto px-2" title="Add to collection">
              <FolderPlus className="size-4" /><span className="hidden sm:inline">Collection</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuLabel className="text-xs">Add to collection</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {assignableCollections.map((collection) => (
              <DropdownMenuItem
                key={collection.id}
                onClick={() => onAddToCollection(collection.id)}
                className="gap-2 text-xs"
              >
                {renderCollectionIcon(collection, { fallback: true })}
                <span className="truncate">{collection.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-auto px-2" title="Set status">
            <BookOpen className="size-4" /><span className="hidden sm:inline">Status</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          {manualStatusOptions.map((status) => {
            const config = statusConfig[status];
            return (
              <DropdownMenuItem key={status} onClick={() => onSetStatus(status)} className="gap-2 text-xs">
                <config.icon className="size-3.5" />
                {config.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {allOwned && (
        <Button variant="ghost" size="icon" className="h-8 w-auto px-2" title="Share selected" onClick={onShare}>
          <Users className="size-4" /><span className="hidden sm:inline">Share</span>
        </Button>
      )}
      {allOwned && (
        <Button variant="ghost" size="icon" className="h-8 w-auto px-2" title="Refresh metadata" onClick={onRefreshMetadata}>
          <RefreshCw className="size-4" /><span className="hidden sm:inline">Metadata</span>
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-8 w-auto px-2" title="Download" onClick={onDownload}>
        <Download className="size-4" /><span className="hidden sm:inline">Download</span>
      </Button>
      {allOwned && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-auto px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 className="size-4" /><span className="hidden sm:inline">Delete</span>
        </Button>
      )}
      </div>
    </div>
  );
};

export const GridCard: React.FC<{
  book: BookItem;
  menuProps: BookMenuProps;
  isSelected: boolean;
  selectionActive: boolean;
}> = React.memo(({ book, menuProps, isSelected, selectionActive }) => {
  const status = getDisplayStatus(book.progress?.status);
  const statusBucket = getStatusFilterBucket(book.progress?.status);
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;
  const shareBadge = getShareBadgeData(book);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group cursor-pointer" onClick={(event) => menuProps.onBookClick(book.id, event)}>
          <div
            className={cn(
              "shelf-cover relative aspect-[2/3] overflow-hidden bg-muted/20",
              isSelected && "is-selected",
            )}
          >
            <BookCover book={book} className="h-full w-full" />

            <div className="absolute bottom-2 left-1.5 flex flex-col items-start gap-1">
              {book.koboSyncable === 1 && <span className="flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-white"><RefreshCw className="size-2" />Kobo</span>}
              {shareBadge && <BookShareBadge book={book} className="border-0 bg-black/70 text-white text-[9px]" />}
            </div>
            <button aria-label={`Select ${book.title}`} aria-pressed={isSelected}
              className={cn("cover-select absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white transition-opacity", !selectionActive && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
              onClick={(event) => { event.stopPropagation(); menuProps.onToggleSelect(book.id); }}>
              {isSelected && <Check className="size-3" />}
            </button>
            <button aria-label={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={cn("absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 transition-opacity", !book.isFavorite && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
              onClick={(event) => { event.stopPropagation(); void menuProps.onToggleFavorite(book.id, !book.isFavorite); }}>
              <Star className={cn("size-3", book.isFavorite ? "fill-cover-gold text-cover-gold" : "text-white")} />
            </button>

            <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Menu for ${book.title}`} className="flex size-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/40"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="size-3 text-white/80" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <BookMenuItems book={book} menuProps={menuProps} menuComponents={dropdownMenuComponents} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {statusBucket === "READING" && percent > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/15">
                <div className="h-full shelf-progress" style={{ width: `${percent}%` }} />
              </div>
            )}
          </div>

          <div className="space-y-0.5 pt-2.5">
            <h3 className="line-clamp-2 text-[13px] font-medium leading-snug transition-colors duration-200 group-hover:text-primary">
              {book.title}
            </h3>
            <p className="truncate text-xs text-muted-foreground">{book.author ?? "Unknown author"}</p>
            {status !== "UNREAD" && (
              <div className="flex items-center gap-1 pt-0.5">
                <span className="shelf-status" data-status={statusBucket}>{config.label}</span>
                {statusBucket === "READING" && percent > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{percent}%</span>
                )}
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <BookMenuItems book={book} menuProps={menuProps} menuComponents={contextMenuComponents} />
      </ContextMenuContent>
    </ContextMenu>
  );
});
GridCard.displayName = "GridCard";

export const ListRow: React.FC<{
  book: BookItem;
  menuProps: BookMenuProps;
  isSelected: boolean;
  selectionActive: boolean;
}> = React.memo(({ book, menuProps, isSelected, selectionActive }) => {
  const status = getDisplayStatus(book.progress?.status);
  const statusBucket = getStatusFilterBucket(book.progress?.status);
  const config = statusConfig[status];
  const percent = book.progress?.progressPercent ?? 0;
  const shareBadge = getShareBadgeData(book);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group cursor-pointer rounded-md transition-colors",
            isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-accent/50",
          )}
          onClick={(event) => menuProps.onBookClick(book.id, event)}
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            {(
              <button
                aria-label={`Select ${book.title}`} aria-pressed={isSelected}
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30 bg-transparent",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  menuProps.onToggleSelect(book.id);
                }}
              >
                {isSelected && <Check className="size-3 text-primary-foreground" />}
              </button>
            )}
            <div className="h-12 w-8 shrink-0 overflow-hidden rounded-md shadow-sm">
              <BookCover book={book} className="h-full w-full" showTitle={false} />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium transition-colors group-hover:text-primary">{book.title}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">{book.author ?? "Unknown author"}</span>
                {book.series && <span className="truncate text-muted-foreground/35">&middot; {book.series}</span>}
                {shareBadge && <BookShareBadge book={book} className="h-4 px-1.5" />}
              </div>
              {statusBucket === "READING" && percent > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 max-w-20 flex-1 overflow-hidden rounded-full bg-muted/60">
                    <div className="h-full rounded-full shelf-progress" style={{ width: `${percent}%` }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">{percent}%</span>
                </div>
              )}
            </div>

            <div className="hidden items-center gap-2 sm:flex">
              {!selectionActive && (
                <button
                  aria-label={book.isFavorite ? "Remove from favorites" : "Add to favorites"}
                  className="rounded-full p-1 hover:bg-muted/50"
                  onClick={(event) => {
                    event.stopPropagation();
                    void menuProps.onToggleFavorite(book.id, !book.isFavorite);
                  }}
                >
                  <Star className={cn("size-3.5", book.isFavorite ? "fill-gold text-gold" : "text-muted-foreground/25")} />
                </button>
              )}
              {book.koboSyncable === 1 && (
                <span className="flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <RefreshCw className="size-2.5" />
                  Kobo
                </span>
              )}
              <span className="w-28 text-right text-[11px] tabular-nums text-muted-foreground">{book.fileExt.toUpperCase()} · {formatSize(book.fileSize)}</span>
              <span className="shelf-status w-28" data-status={statusBucket}>{config.label}</span>
            </div>

            <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Menu for ${book.title}`} className="flex size-6 items-center justify-center rounded-full hover:bg-muted/60"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="size-3.5 text-muted-foreground/50" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <BookMenuItems book={book} menuProps={menuProps} menuComponents={dropdownMenuComponents} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <BookMenuItems book={book} menuProps={menuProps} menuComponents={contextMenuComponents} />
      </ContextMenuContent>
    </ContextMenu>
  );
});
ListRow.displayName = "ListRow";
