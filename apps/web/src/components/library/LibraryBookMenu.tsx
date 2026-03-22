import React, { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShareBookMenuSub } from "@/components/library/BookShareControls";
import type {
  BookCollectionAssignment,
  BookItem,
  CollectionItem,
} from "@/components/library/libraryShared";
import {
  getStatusFilterBucket,
  isVirtualCollection,
  manualStatusOptions,
  renderCollectionIcon,
  statusConfig,
} from "@/components/library/libraryShared";
import { apiFetch } from "@/lib/api";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Book,
  BookMinus,
  BookOpen,
  Check,
  CheckSquare,
  Download,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type LibraryMenuItemProps = {
  children?: React.ReactNode;
  className?: string;
  onSelect?: (event: Event) => void;
};

export type LibraryMenuComponents = {
  Item: React.ComponentType<LibraryMenuItemProps>;
  Separator: React.ComponentType;
  Sub: React.ComponentType<{ children: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  SubContent: React.ComponentType<{ children: React.ReactNode; className?: string }>;
};

export const dropdownMenuComponents: LibraryMenuComponents = {
  Item: (props) => <DropdownMenuItem {...props} />,
  Separator: () => <DropdownMenuSeparator />,
  Sub: ({ children }) => <DropdownMenuSub>{children}</DropdownMenuSub>,
  SubTrigger: (props) => <DropdownMenuSubTrigger {...props} />,
  SubContent: (props) => <DropdownMenuSubContent {...props} />,
};

export const contextMenuComponents: LibraryMenuComponents = {
  Item: (props) => <ContextMenuItem {...props} />,
  Separator: () => <ContextMenuSeparator />,
  Sub: ({ children }) => <ContextMenuSub>{children}</ContextMenuSub>,
  SubTrigger: (props) => <ContextMenuSubTrigger {...props} />,
  SubContent: (props) => <ContextMenuSubContent {...props} />,
};

export type BookMenuProps = {
  collections: CollectionItem[];
  activeCollectionId: number | null;
  onSelect: (id: number) => void;
  onToggleFavorite: (id: number, favorite: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  onRefreshMetadata: (id: number) => void;
  onDownload: (id: number) => void;
  onShareCountChange: (bookId: number, delta: number) => void;
  onRemoveShare: (id: number) => void;
  onAddToCollection: (bookId: number, collectionId: number) => void;
  onRemoveFromCollection: (bookId: number, collectionId: number) => void;
  onDelete: (id: number) => void;
  onMenuAction: () => void;
  onBookClick: (id: number, event: React.MouseEvent) => void;
  onToggleSelect: (id: number) => void;
};

export const BookMenuItems: React.FC<{
  book: BookItem;
  menuProps: BookMenuProps;
  menuComponents: LibraryMenuComponents;
}> = ({ book, menuProps, menuComponents }) => {
  const {
    collections,
    activeCollectionId,
    onSelect,
    onToggleFavorite,
    onStatusChange,
    onRefreshMetadata,
    onDownload,
    onShareCountChange,
    onRemoveShare,
    onAddToCollection,
    onRemoveFromCollection,
    onDelete,
    onMenuAction,
    onToggleSelect,
  } = menuProps;
  const { Item, Separator, Sub, SubTrigger, SubContent } = menuComponents;

  const status = getStatusFilterBucket(book.progress?.status);
  const assignableCollections = collections.filter((collection) => !isVirtualCollection(collection));
  const bookCollectionsQuery = useQuery({
    queryKey: ["books", book.id, "collections"],
    queryFn: () => apiFetch<BookCollectionAssignment[]>(`/api/v1/books/${book.id}/collections`),
    enabled: assignableCollections.length > 0,
    staleTime: 30_000,
  });
  const assignedCollectionIds = useMemo(() => {
    const ids = new Set(
      (bookCollectionsQuery.data ?? [])
        .filter((collection) => collection.assigned)
        .map((collection) => collection.id),
    );

    if (
      bookCollectionsQuery.data === undefined &&
      activeCollectionId !== null &&
      assignableCollections.some((collection) => collection.id === activeCollectionId)
    ) {
      ids.add(activeCollectionId);
    }

    return ids;
  }, [bookCollectionsQuery.data, activeCollectionId, assignableCollections]);
  const canRemoveFromActiveCollection =
    activeCollectionId !== null && assignedCollectionIds.has(activeCollectionId);

  const runMenuAction = useCallback(
    (action: () => void) => (event: Event) => {
      event.stopPropagation();
      onMenuAction();
      action();
    },
    [onMenuAction],
  );

  return (
    <>
      <Item onSelect={runMenuAction(() => onSelect(book.id))} className="gap-2 text-xs">
        <Book className="size-3.5" />
        View details
      </Item>
      <Separator />

      {assignableCollections.length > 0 && (
        <>
          <Sub>
            <SubTrigger className="gap-2 text-xs">
              <FolderOpen className="size-3.5" />
              Collections
            </SubTrigger>
            <SubContent className="w-44">
              {assignableCollections.map((collection) => {
                const isAssigned = assignedCollectionIds.has(collection.id);

                return (
                  <Item
                    key={collection.id}
                    onSelect={runMenuAction(() => {
                      if (isAssigned) {
                        onRemoveFromCollection(book.id, collection.id);
                        return;
                      }

                      onAddToCollection(book.id, collection.id);
                    })}
                    className={cn("gap-2 text-xs", isAssigned && "bg-accent")}
                  >
                    {renderCollectionIcon(collection, { fallback: true })}
                    <span className="truncate">{collection.name}</span>
                    {isAssigned ? (
                      <Check className="ml-auto size-3 text-primary" />
                    ) : bookCollectionsQuery.isLoading ? (
                      <Loader2 className="ml-auto size-3 animate-spin text-muted-foreground/50" />
                    ) : (
                      <Plus className="ml-auto size-3 text-muted-foreground/50" />
                    )}
                  </Item>
                );
              })}
            </SubContent>
          </Sub>
          {canRemoveFromActiveCollection && (
            <Item
              onSelect={runMenuAction(() => onRemoveFromCollection(book.id, activeCollectionId!))}
              className="gap-2 text-xs text-destructive focus:text-destructive"
            >
              <X className="size-3.5" />
              Remove from collection
            </Item>
          )}
          <Separator />
        </>
      )}

      <Sub>
        <SubTrigger className="gap-2 text-xs">
          <BookOpen className="size-3.5" />
          Status
        </SubTrigger>
        <SubContent className="w-44">
          {manualStatusOptions.map((value) => {
            const config = statusConfig[value];
            return (
              <Item
                key={value}
                onSelect={runMenuAction(() => onStatusChange(book.id, value))}
                className={cn("gap-2 text-xs", status === value && "bg-accent")}
              >
                <config.icon className="size-3.5" />
                {config.label}
                {status === value && <Check className="ml-auto size-3" />}
              </Item>
            );
          })}
        </SubContent>
      </Sub>

      <Item
        onSelect={runMenuAction(() => onToggleFavorite(book.id, !book.isFavorite))}
        className="gap-2 text-xs"
      >
        <Star className={cn("size-3.5", book.isFavorite && "fill-yellow-400 text-yellow-500")} />
        {book.isFavorite ? "Unfavorite" : "Favorite"}
      </Item>

      <Separator />

      {!book.isShared ? (
        <ShareBookMenuSub
          bookId={book.id}
          onMenuAction={onMenuAction}
          onShareCountChange={onShareCountChange}
          MenuItem={Item}
          MenuSub={Sub}
          MenuSubTrigger={SubTrigger}
          MenuSubContent={SubContent}
        />
      ) : (
        <Item
          onSelect={runMenuAction(() => onRemoveShare(book.id))}
          className="gap-2 text-xs text-muted-foreground focus:text-foreground"
        >
          <BookMinus className="size-3.5" />
          Hide from library
        </Item>
      )}
      {!book.isShared && (
        <Item onSelect={runMenuAction(() => onRefreshMetadata(book.id))} className="gap-2 text-xs">
          <RefreshCw className="size-3.5" />
          Refresh metadata
        </Item>
      )}
      <Item onSelect={runMenuAction(() => onDownload(book.id))} className="gap-2 text-xs">
        <Download className="size-3.5" />
        Download
      </Item>
      <Separator />
      <Item onSelect={runMenuAction(() => onToggleSelect(book.id))} className="gap-2 text-xs">
        <CheckSquare className="size-3.5" />
        Select
      </Item>
      {!book.isShared && (
        <>
          <Separator />
          <Item
            onSelect={runMenuAction(() => {
              if (window.confirm(`Delete "${book.title}"? This cannot be undone.`)) {
                onDelete(book.id);
              }
            })}
            className="gap-2 text-xs text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Item>
        </>
      )}
    </>
  );
};
