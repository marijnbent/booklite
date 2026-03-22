import React from "react";
import {
  dropdownMenuComponents,
} from "@/components/library/LibraryBookMenu";
import type { BookCollectionAssignment, BookItem } from "@/components/library/libraryShared";
import { isBrowserReadableBookExt } from "@/lib/bookFormats";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CoverOptionGrid } from "@/components/CoverOptionGrid";
import type { CoverGridOption } from "@/components/CoverOptionGrid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareBookDropdown, ShareBookMenuSub } from "@/components/library/BookShareControls";
import {
  BookMinus,
  BookOpen,
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";

type RefreshMetadataStatus = "idle" | "refreshing" | "done" | "error";

interface StatusOption {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface MetadataDraft {
  title: string;
  author: string;
  series: string;
  description: string;
}

interface RenderCollectionIconOptions {
  fallback?: boolean;
  svgClassName?: string;
  textClassName?: string;
}

interface BookCoverProps {
  book: Pick<BookItem, "id" | "title" | "coverPath">;
  className?: string;
  showTitle?: boolean;
}

export const BookDetailDrawer: React.FC<{
  open: boolean;
  panelBook: BookItem | null | undefined;
  onOpenChange: (open: boolean) => void;
  refreshMetadataStatus: RefreshMetadataStatus;
  onToggleFavorite: () => void;
  onRefreshMetadata: () => void;
  onDelete: () => void;
  onRemoveSharedBook: () => void;
  onMenuAction: () => void;
  coverOptionsRequested: boolean;
  onToggleCoverOptions: () => void;
  coverOptionsLoading: boolean;
  coverOptions: CoverGridOption[];
  onSelectCover: (coverPath: string) => void;
  onClearCover: () => void;
  setBookCoverPending: boolean;
  statusOptions: StatusOption[];
  statusValue: string;
  onStatusChange: (status: string) => void;
  onRead: () => void;
  onDownload: () => void;
  onShareCountChange: (bookId: number, delta: number) => void;
  fileSizeLabel: string;
  descriptionExpanded: boolean;
  setDescriptionExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  bookCollectionsLoading: boolean;
  bookCollections: BookCollectionAssignment[];
  onToggleCollectionAssigned: (collectionId: number, assigned: boolean) => void;
  renderCollectionIcon: (
    collection: BookCollectionAssignment,
    options?: RenderCollectionIconOptions,
  ) => React.ReactNode;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  draft: MetadataDraft;
  setDraft: React.Dispatch<React.SetStateAction<MetadataDraft>>;
  onSaveMetadata: () => void;
  saveMetadataPending: boolean;
  BookCover: React.ComponentType<BookCoverProps>;
}> = ({
  open,
  panelBook,
  onOpenChange,
  refreshMetadataStatus,
  onToggleFavorite,
  onRefreshMetadata,
  onDelete,
  onRemoveSharedBook,
  onMenuAction,
  coverOptionsRequested,
  onToggleCoverOptions,
  coverOptionsLoading,
  coverOptions,
  onSelectCover,
  onClearCover,
  setBookCoverPending,
  statusOptions,
  statusValue,
  onStatusChange,
  onRead,
  onDownload,
  onShareCountChange,
  fileSizeLabel,
  descriptionExpanded,
  setDescriptionExpanded,
  bookCollectionsLoading,
  bookCollections,
  onToggleCollectionAssigned,
  renderCollectionIcon,
  editMode,
  setEditMode,
  draft,
  setDraft,
  onSaveMetadata,
  saveMetadataPending,
  BookCover,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      className={cn(
        "fixed inset-y-0 right-0 left-auto h-full w-full max-w-[440px]",
        "translate-x-0 translate-y-0 rounded-none",
        "border-l border-border bg-background overflow-hidden p-0 gap-0",
        "data-[state=open]:animate-slide-in-right data-[state=open]:duration-200",
        "[&>button:last-child]:hidden",
      )}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>{panelBook?.title ?? "Book details"}</DialogTitle>
        <DialogDescription>View and manage book details.</DialogDescription>
      </DialogHeader>

      {!panelBook && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground/40" />
        </div>
      )}

      {panelBook && (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Close details">
                <X className="size-4" />
              </Button>
            </DialogClose>
            <div className="flex items-center gap-1">
              <button
                className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={onToggleFavorite}
                title={panelBook.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star className={cn("size-5", panelBook.isFavorite ? "fill-yellow-400 text-yellow-500" : "")} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                    <MoreHorizontal className="size-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!panelBook.isShared ? (
                    <>
                      <ShareBookMenuSub
                        bookId={panelBook.id}
                        onMenuAction={onMenuAction}
                        onShareCountChange={onShareCountChange}
                        MenuItem={dropdownMenuComponents.Item}
                        MenuSub={dropdownMenuComponents.Sub}
                        MenuSubTrigger={dropdownMenuComponents.SubTrigger}
                        MenuSubContent={dropdownMenuComponents.SubContent}
                      />
                      <DropdownMenuItem onSelect={onRefreshMetadata}>
                        <RefreshCw className="mr-2 size-3.5" />
                        Refresh metadata
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={onToggleCoverOptions}>
                        <ImageIcon className="mr-2 size-3.5" />
                        Change cover
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setEditMode((current) => !current)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit metadata
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={onDelete}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onSelect={onRemoveSharedBook}>
                      <BookMinus className="mr-2 size-3.5" />
                      Hide from library
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {refreshMetadataStatus !== "idle" && (
            <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2 text-xs text-muted-foreground">
              {refreshMetadataStatus === "refreshing" && <><Loader2 className="size-3 animate-spin" /> Refreshing metadata...</>}
              {refreshMetadataStatus === "done" && <><Check className="size-3 text-green-500" /> Metadata updated</>}
              {refreshMetadataStatus === "error" && <><X className="size-3 text-destructive" /> Failed to refresh metadata</>}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex justify-center border-b border-border bg-gradient-to-b from-secondary/30 to-secondary/10 px-5 py-8">
              <div className="aspect-[2/3] w-36 overflow-hidden rounded-lg shadow-md shadow-black/10">
                <BookCover book={panelBook} className="h-full w-full" showTitle={false} />
              </div>
            </div>

            {coverOptionsRequested && (
              <div className="animate-fade-in border-b border-border px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ImageIcon className="size-3" />
                    {coverOptionsLoading ? "Searching for covers..." : "Change cover"}
                    {(setBookCoverPending || coverOptionsLoading) && <Loader2 className="size-3 animate-spin" />}
                  </span>
                  <button onClick={onToggleCoverOptions} className="text-muted-foreground/50 hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>
                <CoverOptionGrid
                  selectedCoverPath={panelBook.coverPath ?? ""}
                  options={coverOptionsLoading ? [] : coverOptions}
                  onSelectCover={onSelectCover}
                  onClearCover={onClearCover}
                  clearSelectedLabel="Using title card"
                  clearIdleLabel="Remove cover"
                  idleActionLabel="Click to use"
                  className="xl:grid-cols-2"
                  loading={coverOptionsLoading}
                  emptyState={
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2">
                      <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">No cover suggestions found</p>
                    </div>
                  }
                />
              </div>
            )}

            <div className="space-y-4 px-5 py-5">
              <div className="space-y-1 text-center">
                <h2 className="text-base font-semibold leading-snug">{panelBook.title}</h2>
                {panelBook.author && (
                  <p className="text-sm text-muted-foreground">{panelBook.author}</p>
                )}
                {panelBook.isShared && panelBook.sharedByUsername && (
                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    Shared by {panelBook.sharedByUsername}
                  </p>
                )}
                {panelBook.series && (
                  <p className="text-xs text-muted-foreground/70">{panelBook.series}</p>
                )}
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground/70">
                  <span className="rounded-md bg-secondary px-2 py-1 font-medium uppercase text-secondary-foreground">
                    {panelBook.fileExt.toUpperCase()}
                  </span>
                  <span className="tabular-nums">{fileSizeLabel}</span>
                  {panelBook.koboSyncable === 1 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-medium text-secondary-foreground">
                      <RefreshCw className="size-3" />
                      Kobo
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <ToggleGroup
                  type="single"
                  value={statusValue}
                  onValueChange={(value) => {
                    if (value) onStatusChange(value);
                  }}
                  className="grid grid-cols-2 gap-2"
                >
                  {statusOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className="flex h-9 items-center justify-center gap-1 rounded-md border border-border bg-secondary text-[11px] data-[state=on]:border-foreground/15 data-[state=on]:bg-background"
                      >
                        <Icon className="size-3" />
                        {option.label}
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>

                <div
                  className={cn(
                    "grid gap-2",
                    isBrowserReadableBookExt(panelBook.fileExt)
                      ? panelBook.isShared
                        ? "grid-cols-2"
                        : "grid-cols-3"
                      : panelBook.isShared
                        ? "grid-cols-1"
                        : "grid-cols-2",
                  )}
                >
                  {isBrowserReadableBookExt(panelBook.fileExt) && (
                    <Button variant="outline" className="h-9 justify-center gap-2" onClick={onRead}>
                      <BookOpen className="size-3.5" />
                      Read
                    </Button>
                  )}
                  <Button variant="outline" className="h-9 justify-center gap-2" onClick={onDownload}>
                    <Download className="size-3.5" />
                    Download
                  </Button>
                  {!panelBook.isShared && (
                    <ShareBookDropdown
                      bookId={panelBook.id}
                      onShareCountChange={onShareCountChange}
                    />
                  )}
                </div>
              </div>

              {(panelBook.progress?.status === "READING" || (panelBook.progress?.progressPercent ?? 0) > 0) && (
                <div className="flex items-center gap-2">
                  <Progress value={panelBook.progress?.progressPercent ?? 0} className="h-1 flex-1" />
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {panelBook.progress?.progressPercent ?? 0}%
                  </span>
                </div>
              )}

              {panelBook.description && !editMode && (
                <div>
                  <p className={cn("text-[13px] leading-relaxed text-muted-foreground", !descriptionExpanded && "line-clamp-4")}>
                    {panelBook.description}
                  </p>
                  {panelBook.description.length > 200 && (
                    <button
                      onClick={() => setDescriptionExpanded((current) => !current)}
                      className="mt-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}

              {bookCollectionsLoading && (
                <div className="flex justify-center py-2">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground/40" />
                </div>
              )}
              {bookCollections.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {bookCollections.map((collection) => (
                    <button
                      key={collection.id}
                      onClick={() => onToggleCollectionAssigned(collection.id, !collection.assigned)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        collection.assigned
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {renderCollectionIcon(collection, { svgClassName: "size-3", textClassName: "text-xs leading-none" })}
                      {collection.name}
                    </button>
                  ))}
                </div>
              )}

              {editMode && (
                <div className="animate-fade-in">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
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
                      <Input className="h-8" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px] text-muted-foreground">Author</Label>
                      <Input className="h-8" value={draft.author} onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))} />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px] text-muted-foreground">Series</Label>
                      <Input className="h-8" value={draft.series} onChange={(event) => setDraft((current) => ({ ...current, series: event.target.value }))} />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[11px] text-muted-foreground">Description</Label>
                      <Textarea
                        rows={2}
                        value={draft.description}
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                        className="resize-none"
                      />
                    </div>
                    <Button size="sm" onClick={onSaveMetadata} disabled={saveMetadataPending} className="h-8 gap-1.5">
                      {saveMetadataPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save changes
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);
