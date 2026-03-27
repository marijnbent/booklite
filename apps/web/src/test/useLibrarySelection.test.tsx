import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLibrarySelection } from "../components/library/useLibrarySelection";
import React from "react";

function makeMouseEvent(overrides: Partial<React.MouseEvent> = {}): React.MouseEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides,
  } as React.MouseEvent;
}

const defaultProps = {
  filteredBookIds: [1, 2, 3, 4, 5],
  resetKey: "initial",
  onOpenBook: vi.fn(),
};

describe("useLibrarySelection", () => {
  it("starts with empty selection and selectionActive=false", () => {
    const { result } = renderHook(() => useLibrarySelection(defaultProps));
    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.selectionActive).toBe(false);
  });

  it("handleToggleSelect selects a book and sets selectionActive=true", () => {
    const { result } = renderHook(() => useLibrarySelection(defaultProps));
    act(() => {
      result.current.handleToggleSelect(1);
    });
    expect(result.current.selectedBookIds.has(1)).toBe(true);
    expect(result.current.selectionActive).toBe(true);
  });

  it("handleToggleSelect deselects a book when toggled again", () => {
    const { result } = renderHook(() => useLibrarySelection(defaultProps));
    act(() => {
      result.current.handleToggleSelect(1);
    });
    act(() => {
      result.current.handleToggleSelect(1);
    });
    expect(result.current.selectedBookIds.has(1)).toBe(false);
  });

  it("clearSelection empties the selection and sets selectionActive=false", () => {
    const { result } = renderHook(() => useLibrarySelection(defaultProps));
    act(() => {
      result.current.handleToggleSelect(1);
    });
    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.selectionActive).toBe(false);
  });

  it("handleBookClick with no modifier and selectionActive=false calls onOpenBook", () => {
    const onOpenBook = vi.fn();
    const { result } = renderHook(() =>
      useLibrarySelection({ ...defaultProps, onOpenBook })
    );
    act(() => {
      result.current.handleBookClick(1, makeMouseEvent());
    });
    expect(onOpenBook).toHaveBeenCalledWith(1);
    expect(result.current.selectedBookIds.size).toBe(0);
  });

  it("handleBookClick with metaKey selects the book instead of opening it", () => {
    const onOpenBook = vi.fn();
    const { result } = renderHook(() =>
      useLibrarySelection({ ...defaultProps, onOpenBook })
    );
    act(() => {
      result.current.handleBookClick(2, makeMouseEvent({ metaKey: true }));
    });
    expect(onOpenBook).not.toHaveBeenCalled();
    expect(result.current.selectedBookIds.has(2)).toBe(true);
  });

  it("handleBookClick with ctrlKey selects the book instead of opening it", () => {
    const onOpenBook = vi.fn();
    const { result } = renderHook(() =>
      useLibrarySelection({ ...defaultProps, onOpenBook })
    );
    act(() => {
      result.current.handleBookClick(3, makeMouseEvent({ ctrlKey: true }));
    });
    expect(onOpenBook).not.toHaveBeenCalled();
    expect(result.current.selectedBookIds.has(3)).toBe(true);
  });

  it("handleBookClick with shiftKey range-selects books from last click", () => {
    const { result } = renderHook(() =>
      useLibrarySelection({ filteredBookIds: [1, 2, 3, 4, 5], resetKey: "r", onOpenBook: vi.fn() })
    );
    // First click book id=1 (index 0)
    act(() => {
      result.current.handleBookClick(1, makeMouseEvent({ metaKey: true }));
    });
    // Shift-click book id=3 (index 2) → should select 1, 2, 3
    act(() => {
      result.current.handleBookClick(3, makeMouseEvent({ shiftKey: true }));
    });
    expect(result.current.selectedBookIds.has(1)).toBe(true);
    expect(result.current.selectedBookIds.has(2)).toBe(true);
    expect(result.current.selectedBookIds.has(3)).toBe(true);
    expect(result.current.selectedBookIds.has(4)).toBe(false);
  });

  it("pressing Escape clears selection when selectionActive=true", () => {
    const { result } = renderHook(() => useLibrarySelection(defaultProps));
    act(() => {
      result.current.handleToggleSelect(1);
    });
    expect(result.current.selectionActive).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.selectionActive).toBe(false);
  });

  it("resetKey change clears the selection", () => {
    let resetKey = "key1";
    const { result, rerender } = renderHook(
      (props: { resetKey: string }) =>
        useLibrarySelection({ ...defaultProps, resetKey: props.resetKey }),
      { initialProps: { resetKey } }
    );

    act(() => {
      result.current.handleToggleSelect(1);
    });
    expect(result.current.selectedBookIds.size).toBe(1);

    resetKey = "key2";
    rerender({ resetKey });

    expect(result.current.selectedBookIds.size).toBe(0);
    expect(result.current.selectionActive).toBe(false);
  });
});
