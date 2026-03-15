import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Contents as ReaderContents } from "epubjs";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { apiFetch, apiFetchRaw } from "@/lib/api";
import { isBrowserReadableBookExt } from "@/lib/bookFormats";
import {
  openReaderBook,
  renderReaderBook,
  type ReaderLocation,
  type ReaderRendition,
} from "@/lib/epub";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReaderBookItem {
  id: number;
  title: string;
  author: string | null;
  fileExt: string;
  progress: {
    status: "UNREAD" | "READING" | "DONE";
    progressPercent: number;
  } | null;
}

const SAVE_DEBOUNCE_MS = 1500;
const READER_SETTINGS_KEY = "booklite_reader_settings_v2";
const MIN_SPREAD_WIDTH = 950;

type FontSizeOption = "small" | "medium" | "large" | "xlarge" | "xxlarge";
type FontFamilyOption = "publisher" | "serif" | "sans";
type ThemeOption = "paper" | "sepia" | "night";

type ReaderSettings = {
  fontSize: FontSizeOption;
  fontFamily: FontFamilyOption;
  theme: ThemeOption;
};

const defaultReaderSettings: ReaderSettings = {
  fontSize: "medium",
  fontFamily: "serif",
  theme: "paper",
};

const fontSizeValues: FontSizeOption[] = ["small", "medium", "large", "xlarge", "xxlarge"];
const fontSizeMap: Record<FontSizeOption, string> = {
  small: "90%",
  medium: "100%",
  large: "110%",
  xlarge: "125%",
  xxlarge: "150%",
};

const fontSizeLabelMap: Record<FontSizeOption, string> = {
  small: "0.9",
  medium: "1.0",
  large: "1.1",
  xlarge: "1.25",
  xxlarge: "1.5",
};

const fontFamilyMap: Record<FontFamilyOption, string | null> = {
  publisher: null,
  serif: `Georgia, "Iowan Old Style", "Palatino Linotype", serif`,
  sans: `"Helvetica Neue", Arial, sans-serif`,
};

const themeStyles: Record<ThemeOption, { bg: string; text: string; surface: string }> = {
  paper: { bg: "bg-[#fffaf0]", text: "text-[#1f2937]", surface: "#fffaf0" },
  sepia: { bg: "bg-[#f3e6cd]", text: "text-[#433422]", surface: "#f3e6cd" },
  night: { bg: "bg-[#171923]", text: "text-[#e5e7eb]", surface: "#171923" },
};

const readStoredSettings = (): ReaderSettings => {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return defaultReaderSettings;
    return { ...defaultReaderSettings, ...(JSON.parse(raw) as Partial<ReaderSettings>) };
  } catch {
    return defaultReaderSettings;
  }
};

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

const getEventTargetElement = (target: EventTarget | null): HTMLElement | null => {
  if (!target || typeof target !== "object" || !("nodeType" in target)) return null;

  const node = target as Node;
  if (node.nodeType === 3) return node.parentElement;
  if (node.nodeType !== 1) return null;

  const element = node as HTMLElement;
  return typeof element.tagName === "string" ? element : null;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = getEventTargetElement(target);
  if (!element) return false;
  if (element.isContentEditable) return true;

  return element.closest(
    "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
  ) !== null;
};

export const ReaderPage: React.FC = () => {
  const params = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReaderRendition | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const initialRelocationHandledRef = useRef(false);
  const latestPercentRef = useRef(0);
  const lastSavedPercentRef = useRef(0);
  const mountedRef = useRef(true);

  const [progressPercent, setProgressPercent] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [hasSavedThisSession, setHasSavedThisSession] = useState(false);
  const [canGoPrev, setCanGoPrev] = useState(false);
  const [canGoNext, setCanGoNext] = useState(true);
  const [showControls, setShowControls] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pageNumber, setPageNumber] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [settingsReady, setSettingsReady] = useState(false);

  // Touch/swipe state
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const contentKeydownCleanupsRef = useRef<Array<() => void>>([]);

  const bookId = Number(params.bookId);
  const hasValidBookId = Number.isInteger(bookId) && bookId > 0;
  const theme = themeStyles[settings.theme];

  const bookQuery = useQuery({
    queryKey: ["books", "detail", bookId],
    queryFn: () => apiFetch<ReaderBookItem>(`/api/v1/books/${bookId}`),
    enabled: hasValidBookId,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    setSettings(readStoredSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, settingsReady]);

  useEffect(() => {
    const savedPercent = clampPercent(bookQuery.data?.progress?.progressPercent ?? 0);
    setProgressPercent(savedPercent);
    latestPercentRef.current = savedPercent;
    lastSavedPercentRef.current = savedPercent;
    initialRelocationHandledRef.current = false;
    setHasSavedThisSession(false);
    setSaveError(null);
  }, [bookId, bookQuery.data?.progress?.progressPercent]);

  const invalidateLibraryQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["books"] }),
      queryClient.invalidateQueries({ queryKey: ["collection-books"] }),
    ]);
  }, [queryClient]);

  const flushProgress = useCallback(async (options?: { suppressState?: boolean }) => {
    if (!hasValidBookId) return;
    const nextPercent = latestPercentRef.current;
    if (nextPercent === lastSavedPercentRef.current) return;

    try {
      if (mountedRef.current && !options?.suppressState) {
        setIsSaving(true);
        setSaveError(null);
      }
      await apiFetch(`/api/v1/books/${bookId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progressPercent: nextPercent }),
      });
      lastSavedPercentRef.current = nextPercent;
      if (mountedRef.current && !options?.suppressState) {
        setHasSavedThisSession(true);
      }
    } catch {
      if (mountedRef.current && !options?.suppressState) {
        setSaveError("Could not save progress.");
      }
    } finally {
      if (mountedRef.current && !options?.suppressState) {
        setIsSaving(false);
      }
    }
  }, [bookId, hasValidBookId]);

  const scheduleFlush = useCallback(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void flushProgress();
    }, SAVE_DEBOUNCE_MS);
  }, [flushProgress]);

  const handleRelocated = useCallback(
    (location: ReaderLocation) => {
      setCanGoPrev(!location.atStart);
      setCanGoNext(!location.atEnd);
      setPageNumber(location.start?.displayed?.page ?? location.end?.displayed?.page ?? null);
      setTotalPages(location.start?.displayed?.total ?? location.end?.displayed?.total ?? null);

      const rawPercent = location.start?.percentage ?? location.end?.percentage;
      if (typeof rawPercent !== "number" || Number.isNaN(rawPercent)) return;

      const nextPercent = clampPercent(rawPercent * 100);
      if (!initialRelocationHandledRef.current) {
        initialRelocationHandledRef.current = true;
        return;
      }

      latestPercentRef.current = nextPercent;
      setProgressPercent(nextPercent);
      setSaveError(null);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const handleReaderKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isEditableTarget(e.target)) return;

    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      void renditionRef.current?.prev();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
      e.preventDefault();
      void renditionRef.current?.next();
    } else if (e.key === "Escape") {
      setShowControls(false);
      setShowSettings(false);
    }
  }, []);

  const applyReaderSettings = useCallback((rendition: ReaderRendition) => {
    const palette =
      settings.theme === "night"
        ? { color: "#e5e7eb", background: "#171923" }
        : settings.theme === "sepia"
          ? { color: "#433422", background: "#f3e6cd" }
          : { color: "#1f2937", background: "#fffaf0" };

    rendition.themes.default({
      body: {
        "line-height": "1.7",
        "text-rendering": "optimizeLegibility",
        "padding": "0",
        "margin": "0",
        "color": palette.color,
        "background": palette.background,
      },
      p: { "widows": "3", "orphans": "3" },
      img: { "max-width": "100%", "height": "auto" },
    });

    rendition.themes.fontSize(fontSizeMap[settings.fontSize]);

    const fontFamily = fontFamilyMap[settings.fontFamily];
    if (fontFamily) {
      rendition.themes.font(fontFamily);
    } else {
      rendition.themes.override("font-family", "inherit", true);
    }

    rendition.themes.override("color", palette.color, true);
    rendition.themes.override("background-color", palette.background, true);
  }, [settings.fontFamily, settings.fontSize, settings.theme]);

  // Re-apply settings when they change
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !viewerRef.current) return;
    applyReaderSettings(rendition);
  }, [applyReaderSettings]);

  // Boot the reader
  useEffect(() => {
    if (!hasValidBookId || !bookQuery.data || !isBrowserReadableBookExt(bookQuery.data.fileExt)) {
      return;
    }
    if (!viewerRef.current) return;

    let cancelled = false;
    let localRendition: ReaderRendition | null = null;
    let localBook: Awaited<ReturnType<typeof openReaderBook>> | null = null;

    const bootReader = async () => {
      try {
        setIsReady(false);
        setRenderError(null);

        const response = await apiFetchRaw(`/api/v1/books/${bookId}/download`);
        const epubData = await response.arrayBuffer();
        if (cancelled) return;

        localBook = await openReaderBook(epubData);
        await localBook.ready;
        await localBook.locations.generate(1600);
        if (cancelled || !viewerRef.current) return;

        viewerRef.current.innerHTML = "";

        localRendition = renderReaderBook(localBook, viewerRef.current, {
          method: "blobUrl",
          flow: "paginated",
          spread: "auto",
          minSpreadWidth: MIN_SPREAD_WIDTH,
          width: "100%",
          height: "100%",
        });
        renditionRef.current = localRendition;
        applyReaderSettings(localRendition);

        const attachedDocuments = new WeakSet<Document>();
        const attachContentKeydownListener = (contents: ReaderContents) => {
          const contentDocument = contents.document;
          if (attachedDocuments.has(contentDocument)) return;

          attachedDocuments.add(contentDocument);
          contentDocument.addEventListener("keydown", handleReaderKeyDown, true);
          contentKeydownCleanupsRef.current.push(() => {
            contentDocument.removeEventListener("keydown", handleReaderKeyDown, true);
          });
        };

        localRendition.hooks.content.register((contents: ReaderContents) => {
          attachContentKeydownListener(contents);
        });

        localRendition.on("relocated", handleRelocated);
        await localRendition.display(
          lastSavedPercentRef.current > 0 ? lastSavedPercentRef.current / 100 : undefined
        );
        if (cancelled || !mountedRef.current) return;

        setIsReady(true);
      } catch {
        if (!cancelled && mountedRef.current) {
          setRenderError("Could not open this book in the browser.");
          setIsReady(false);
        }
      }
    };

    void bootReader();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") void flushProgress();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      contentKeydownCleanupsRef.current.splice(0).forEach((cleanup) => cleanup());
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void flushProgress({ suppressState: true });
      void invalidateLibraryQueries();
      if (localRendition) {
        localRendition.off("relocated", handleRelocated);
        localRendition.destroy();
      }
      renditionRef.current = null;
      if (localBook) localBook.destroy();
    };
  }, [
    applyReaderSettings,
    bookId,
    bookQuery.data,
    flushProgress,
    handleReaderKeyDown,
    handleRelocated,
    hasValidBookId,
    invalidateLibraryQueries,
  ]);

  // Resize observer
  useEffect(() => {
    if (!viewerRef.current) return;
    const observer = new ResizeObserver(() => {
      const rendition = renditionRef.current;
      const viewer = viewerRef.current;
      if (!rendition || !viewer) return;
      rendition.resize(viewer.clientWidth, viewer.clientHeight);
    });
    observer.observe(viewerRef.current);
    return () => observer.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    document.addEventListener("keydown", handleReaderKeyDown, true);
    return () => document.removeEventListener("keydown", handleReaderKeyDown, true);
  }, [handleReaderKeyDown]);

  // Touch/swipe handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start || e.changedTouches.length !== 1) return;
    touchStartRef.current = null;

    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    const dt = Date.now() - start.t;

    // Must be a quick, mostly-horizontal swipe
    if (dt > 500 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;

    if (dx < 0) {
      void renditionRef.current?.next();
    } else {
      void renditionRef.current?.prev();
    }
  }, []);

  // Tap zones: left 25% = prev, right 25% = next, center 50% = toggle controls
  const handleTapZone = useCallback((e: React.MouseEvent) => {
    // Ignore if it came from a button or interactive element
    if ((e.target as HTMLElement).closest("button, a, [role=button]")) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;

    if (x < 0.25) {
      void renditionRef.current?.prev();
    } else if (x > 0.75) {
      void renditionRef.current?.next();
    } else {
      setShowControls((v) => !v);
      if (showSettings) setShowSettings(false);
    }
  }, [showSettings]);

  const handleBack = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await flushProgress();
    await invalidateLibraryQueries();
    navigate("/library");
  }, [flushProgress, invalidateLibraryQueries, navigate]);

  const cycleTheme = useCallback(() => {
    const order: ThemeOption[] = ["paper", "sepia", "night"];
    setSettings((s) => {
      const idx = order.indexOf(s.theme);
      return { ...s, theme: order[(idx + 1) % order.length] };
    });
  }, []);

  const cycleFont = useCallback(() => {
    const order: FontFamilyOption[] = ["serif", "sans", "publisher"];
    setSettings((s) => {
      const idx = order.indexOf(s.fontFamily);
      return { ...s, fontFamily: order[(idx + 1) % order.length] };
    });
  }, []);

  const paginationLabel =
    pageNumber !== null && totalPages !== null
      ? `Page ${pageNumber} of ${totalPages}`
      : `${progressPercent}%`;

  // Status indicator
  const statusText = saveError
    ? saveError
    : isSaving
      ? "Saving..."
      : hasSavedThisSession
        ? "Saved"
        : null;

  // Error / loading states
  if (!hasValidBookId) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Invalid book</h1>
        <p className="text-sm text-muted-foreground">The reader URL is missing a valid book id.</p>
        <Button asChild><Link to="/library">Back to library</Link></Button>
      </div>
    );
  }

  if (bookQuery.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (bookQuery.isError || !bookQuery.data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Could not load this book</h1>
        <p className="text-sm text-muted-foreground">
          The reader needs book details before it can open the file.
        </p>
        <Button asChild><Link to="/library">Back to library</Link></Button>
      </div>
    );
  }

  if (!isBrowserReadableBookExt(bookQuery.data.fileExt)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Reader not available</h1>
        <p className="text-sm text-muted-foreground">
          Built-in reading is currently available for EPUB and KEPUB books.
        </p>
        <Button asChild><Link to="/library">Back to library</Link></Button>
      </div>
    );
  }

  return (
    <div
      className={cn("reader-root relative flex h-dvh flex-col overflow-hidden select-none", theme.bg, theme.text)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar - always visible, thin line at top */}
      <div className={cn(
        "absolute inset-x-0 top-0 z-30 h-[3px]",
        settings.theme === "night" ? "bg-white/10" : "bg-black/5"
      )}>
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main reading area with tap zones */}
      <div
        className="relative flex flex-1 min-h-0 cursor-default"
        onClick={handleTapZone}
      >
        {/* Epub viewer */}
        <div
          ref={viewerRef}
          className="reader-surface h-full w-full"
        />

        {/* Loading overlay */}
        {!isReady && !renderError && (
          <div className={cn(
            "absolute inset-0 z-20 flex items-center justify-center",
            theme.bg
          )}>
            <div className={cn(
              "flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm",
              settings.theme === "night"
                ? "bg-white/10 text-white/70"
                : "bg-black/5 text-black/50"
            )}>
              <Loader2 className="size-4 animate-spin" />
              Loading book...
            </div>
          </div>
        )}

        {/* Render error */}
        {renderError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <h2 className="text-lg font-semibold">Reader failed to load</h2>
            <p className="max-w-md text-sm opacity-60">{renderError}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Button size="sm" onClick={() => void handleBack()}>Back to library</Button>
            </div>
          </div>
        )}

        {/* Top-center appearance button - always visible when not in controls mode */}
        {isReady && !showControls && (
          <div className="absolute inset-x-0 top-0 z-20 flex justify-center pt-2 pointer-events-none">
            <button
              className={cn(
                "pointer-events-auto rounded-full p-2 opacity-0 transition-opacity duration-200 hover:opacity-100 focus:opacity-100 sm:opacity-40",
                settings.theme === "night"
                  ? "text-white/60 hover:bg-white/10"
                  : "text-black/30 hover:bg-black/5"
              )}
              onClick={(e) => { e.stopPropagation(); setShowSettings(true); setShowControls(true); }}
              title="Appearance settings"
            >
              <SlidersHorizontal className="size-5" />
            </button>
          </div>
        )}

        {isReady && (
          <div
            className={cn(
              "pointer-events-none absolute right-4 z-20 hidden items-center rounded-full px-3 py-1.5 text-xs font-medium tabular-nums backdrop-blur-md transition-all duration-200 md:flex",
              showControls ? "top-14" : "top-4",
              settings.theme === "night"
                ? "bg-white/10 text-white/70"
                : "bg-black/5 text-black/55"
            )}
          >
            {paginationLabel}
          </div>
        )}
      </div>

      {/* Controls overlay - slides up from bottom */}
      {showControls && isReady && (
        <div className="absolute inset-x-0 bottom-0 z-30 animate-slide-up-reader">
          {/* Top bar */}
          <div className={cn(
            "absolute inset-x-0 top-0 z-30 flex items-center gap-2 px-3 py-2 animate-fade-down-reader",
            settings.theme === "night"
              ? "bg-[#171923]/90 backdrop-blur-md"
              : settings.theme === "sepia"
                ? "bg-[#f3e6cd]/90 backdrop-blur-md"
                : "bg-[#fffaf0]/90 backdrop-blur-md"
          )} style={{ position: "fixed", top: 0, left: 0, right: 0 }}>
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1 text-xs", settings.theme === "night" ? "text-white/70 hover:text-white hover:bg-white/10" : "text-black/60 hover:text-black hover:bg-black/5")}
              onClick={() => void handleBack()}
            >
              <ArrowLeft className="size-3.5" />
              Library
            </Button>
            <div className="flex-1 min-w-0 text-center">
              <p className={cn("truncate text-xs font-medium", settings.theme === "night" ? "text-white/60" : "text-black/50")}>
                {bookQuery.data.title}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={cn("text-xs", settings.theme === "night" ? "text-white/70 hover:text-white hover:bg-white/10" : "text-black/60 hover:text-black hover:bg-black/5")}
              onClick={() => { setShowControls(false); setShowSettings(false); }}
            >
              <X className="size-3.5" />
            </Button>
          </div>

          {/* Bottom toolbar */}
          <div className={cn(
            "mx-auto w-full max-w-lg rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.15)]",
            settings.theme === "night"
              ? "bg-[#1e2030]/95 backdrop-blur-md"
              : settings.theme === "sepia"
                ? "bg-[#ede0c8]/95 backdrop-blur-md"
                : "bg-white/95 backdrop-blur-md"
          )}>
            {/* Page info + progress */}
            <div className="mb-3 flex items-center justify-between text-xs md:justify-end">
              <span className={cn("tabular-nums md:hidden", settings.theme === "night" ? "text-white/50" : "text-black/40")}>
                {paginationLabel}
              </span>
              <span className={cn("tabular-nums", settings.theme === "night" ? "text-white/50" : "text-black/40")}>
                {progressPercent}%
                {statusText && (
                  <span className={saveError ? " text-red-500" : ""}> · {statusText}</span>
                )}
              </span>
            </div>

            {/* Nav buttons */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 h-9",
                  settings.theme === "night" && "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                )}
                onClick={() => void renditionRef.current?.prev()}
                disabled={!canGoPrev}
              >
                <ChevronLeft className="size-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "flex-1 h-9",
                  settings.theme === "night" && "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                )}
                onClick={() => void renditionRef.current?.next()}
                disabled={!canGoNext}
              >
                Next
                <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>

            {/* Settings toggle */}
            {!showSettings ? (
              <button
                className={cn(
                  "w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs transition-colors",
                  settings.theme === "night"
                    ? "text-white/50 hover:text-white/70 hover:bg-white/5"
                    : "text-black/40 hover:text-black/60 hover:bg-black/5"
                )}
                onClick={() => setShowSettings(true)}
              >
                <SlidersHorizontal className="size-3.5" />
                Settings
              </button>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", settings.theme === "night" ? "text-white/70" : "text-black/60")}>
                    Reading settings
                  </span>
                  <button
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs transition-colors",
                      settings.theme === "night"
                        ? "bg-white/10 text-white/70 hover:bg-white/15"
                        : "bg-black/5 text-black/60 hover:bg-black/10"
                    )}
                    onClick={() => setShowSettings(false)}
                  >
                    Done
                  </button>
                </div>

                {/* Font size */}
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-xs", settings.theme === "night" ? "text-white/50" : "text-black/40")}>
                    Size
                  </span>
                  <div className="grid flex-1 grid-cols-5 gap-1.5">
                    {fontSizeValues.map((option) => (
                      <button
                        key={option}
                        className={cn(
                          "rounded-lg px-0 py-1.5 text-xs tabular-nums transition-colors",
                          settings.fontSize === option
                            ? "bg-primary text-primary-foreground"
                            : settings.theme === "night"
                              ? "bg-white/5 text-white/65 hover:bg-white/10"
                              : "bg-black/5 text-black/55 hover:bg-black/10"
                        )}
                        onClick={() => setSettings((s) => ({ ...s, fontSize: option }))}
                      >
                        {fontSizeLabelMap[option]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font family */}
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs", settings.theme === "night" ? "text-white/50" : "text-black/40")}>
                    Font
                  </span>
                  <button
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs transition-colors",
                      settings.theme === "night" ? "bg-white/10 text-white/70 hover:bg-white/15" : "bg-black/5 text-black/60 hover:bg-black/10"
                    )}
                    onClick={cycleFont}
                  >
                    {settings.fontFamily === "publisher" ? "Publisher" : settings.fontFamily === "serif" ? "Serif" : "Sans-serif"}
                  </button>
                </div>

                {/* Theme */}
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs", settings.theme === "night" ? "text-white/50" : "text-black/40")}>
                    Theme
                  </span>
                  <div className="flex gap-1.5">
                    {(["paper", "sepia", "night"] as ThemeOption[]).map((t) => (
                      <button
                        key={t}
                        className={cn(
                          "size-7 rounded-full border-2 transition-all",
                          t === "paper" && "bg-[#fffaf0]",
                          t === "sepia" && "bg-[#f3e6cd]",
                          t === "night" && "bg-[#171923]",
                          settings.theme === t
                            ? "border-primary scale-110"
                            : settings.theme === "night"
                              ? "border-white/20"
                              : "border-black/10"
                        )}
                        onClick={() => setSettings((s) => ({ ...s, theme: t }))}
                        title={t}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
