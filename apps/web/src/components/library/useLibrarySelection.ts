import React, { useCallback, useEffect, useRef, useState } from "react";

export function useLibrarySelection({
  filteredBookIds,
  resetKey,
  onOpenBook,
  onSelectionInactive,
  onMultipleSelected,
}: {
  filteredBookIds: number[];
  resetKey: string;
  onOpenBook: (bookId: number) => void;
  onSelectionInactive?: () => void;
  onMultipleSelected?: () => void;
}) {
  const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const lastClickedIdRef = useRef<number | null>(null);
  const selectionActive = selectionMode || selectedBookIds.size > 0;

  const clearSelection = useCallback(() => {
    setSelectedBookIds(new Set());
    setSelectionMode(false);
  }, []);

  useEffect(() => {
    if (!selectionActive) {
      onSelectionInactive?.();
    }
  }, [onSelectionInactive, selectionActive]);

  useEffect(() => {
    clearSelection();
  }, [clearSelection, resetKey]);

  useEffect(() => {
    if (selectedBookIds.size > 1) {
      onMultipleSelected?.();
    }
  }, [onMultipleSelected, selectedBookIds.size]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectionActive) {
        clearSelection();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [clearSelection, selectionActive]);

  const handleToggleSelect = useCallback((bookId: number) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
    lastClickedIdRef.current = bookId;
  }, []);

  const handleBookClick = useCallback(
    (
      bookId: number,
      event: React.MouseEvent,
      suppressNextBookClickRef?: React.MutableRefObject<boolean>,
    ) => {
      if (suppressNextBookClickRef?.current) {
        suppressNextBookClickRef.current = false;
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        handleToggleSelect(bookId);
        return;
      }

      if (event.shiftKey && lastClickedIdRef.current !== null) {
        const from = filteredBookIds.indexOf(lastClickedIdRef.current);
        const to = filteredBookIds.indexOf(bookId);
        if (from !== -1 && to !== -1) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          setSelectedBookIds((current) => {
            const next = new Set(current);
            for (let index = lo; index <= hi; index += 1) {
              next.add(filteredBookIds[index]);
            }
            return next;
          });
        }
        return;
      }

      if (selectionActive) {
        handleToggleSelect(bookId);
        return;
      }

      setSelectedBookIds(new Set());
      onOpenBook(bookId);
    },
    [filteredBookIds, handleToggleSelect, onOpenBook, selectionActive],
  );

  return {
    selectedBookIds,
    setSelectedBookIds,
    selectionMode,
    setSelectionMode,
    selectionActive,
    clearSelection,
    handleBookClick,
    handleToggleSelect,
  };
}
