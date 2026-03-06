import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileText,
  Plus,
  Trash2,
  Star,
  Sparkles,
  AlertCircle,
  BookOpen,
  Search,
  ArrowRight,
} from "lucide-react";

interface UploadJob {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  result?: { bookId?: number } | null;
}

interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
}

interface MetadataPreview {
  source:
    | "OPEN_LIBRARY"
    | "AMAZON"
    | "GOOGLE"
    | "HARDCOVER"
    | "GOODREADS"
    | "DOUBAN"
    | "NONE";
  title?: string | null;
  author?: string | null;
  series?: string | null;
  description?: string | null;
}

interface UploadDraft {
  id: string;
  file: File;
  fileNameTitle: string;
  title: string;
  author: string;
  series: string;
  description: string;
  favorite: boolean;
  collectionIds: number[];
  selected: boolean;
  metadataState: "idle" | "loading" | "enriched" | "none" | "error";
  metadataSource: string | null;
  titleTouched: boolean;
  authorTouched: boolean;
  descriptionTouched: boolean;
  error?: string;
}

const statusDisplay: Record<
  UploadJob["status"],
  { label: string; variant: "warning" | "info" | "success" | "destructive"; icon: React.ReactNode }
> = {
  QUEUED: { label: "Queued", variant: "warning", icon: <Clock className="size-3.5" /> },
  PROCESSING: { label: "Processing", variant: "info", icon: <Loader2 className="size-3.5 animate-spin" /> },
  COMPLETED: { label: "Completed", variant: "success", icon: <CheckCircle2 className="size-3.5" /> },
  FAILED: { label: "Failed", variant: "destructive", icon: <XCircle className="size-3.5" /> },
};

const extAllowed = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.endsWith(".epub") || lower.endsWith(".pdf");
};

const toInitialTitle = (name: string): string => name.replace(/\.[^.]+$/, "");

const sourceLabel = (source: string | null): string => {
  if (source === "OPEN_LIBRARY") return "Open Library";
  if (source === "GOOGLE") return "Google Books";
  return "Metadata";
};

const toErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return "Upload failed";

  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    // Ignore JSON parse errors and return the raw error message.
  }

  return error.message || "Upload failed";
};

/** Small indicator shown next to auto-filled fields */
const AutoFilledHint: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-status-completed/8 px-2 py-0.5 text-[10px] font-medium text-status-completed/90 select-none">
      <Sparkles className="size-2.5" />
      auto-filled
    </span>
  );
};

export const UploadsPage: React.FC = () => {
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);

  const collections = useQuery({
    queryKey: ["collections", "uploads"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections")
  });

  const pollJobs = async () => {
    const pending = jobs.filter((job) => job.status === "QUEUED" || job.status === "PROCESSING");
    if (pending.length === 0) return;

    const updated = await Promise.all(
      jobs.map(async (job) => {
        if (job.status !== "QUEUED" && job.status !== "PROCESSING") return job;
        const response = await apiFetch<any>(`/api/v1/import-jobs/${job.id}`);
        return {
          id: response.id,
          status: response.status,
          error: response.error,
          result: response.result
        } as UploadJob;
      })
    );

    setJobs(updated);
  };

  useEffect(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (jobs.some((job) => job.status === "QUEUED" || job.status === "PROCESSING")) {
      intervalRef.current = window.setInterval(() => {
        void pollJobs();
      }, 1800);
    }

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [jobs]);

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== id));
  };

  const runMetadataPreview = async (target: UploadDraft): Promise<void> => {
    setDrafts((prev) =>
      prev.map((draft): UploadDraft =>
        draft.id === target.id
          ? {
              ...draft,
              metadataState: "loading",
              metadataSource: null
            }
          : draft
      )
    );

    try {
      const preview = await apiFetch<MetadataPreview>("/api/v1/metadata/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: target.title || target.fileNameTitle,
          author: target.author || undefined
        })
      });

      setDrafts((prev) =>
        prev.map((draft): UploadDraft => {
          if (draft.id !== target.id) return draft;

          if (preview.source === "NONE") {
            return {
              ...draft,
              metadataState: "none",
              metadataSource: "NONE"
            };
          }

          return {
            ...draft,
            title: draft.titleTouched ? draft.title : (preview.title ?? draft.title),
            author: draft.authorTouched ? draft.author : (preview.author ?? draft.author),
            series: draft.series.trim().length > 0 ? draft.series : (preview.series ?? draft.series),
            description: draft.descriptionTouched
              ? draft.description
              : (preview.description ?? draft.description),
            metadataState: "enriched",
            metadataSource: preview.source
          };
        })
      );
    } catch {
      setDrafts((prev) =>
        prev.map((draft): UploadDraft =>
          draft.id === target.id
            ? { ...draft, metadataState: "error", metadataSource: null }
            : draft
        )
      );
    }
  };

  const updateDraft = (id: string, patch: Partial<UploadDraft>) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const addFilesToDrafts = (files: FileList | File[]) => {
    const next: UploadDraft[] = [];
    Array.from(files).forEach((file) => {
      if (!extAllowed(file.name)) return;
      const fileNameTitle = toInitialTitle(file.name);
      next.push({
        id: crypto.randomUUID(),
        file,
        fileNameTitle,
        title: fileNameTitle,
        author: "",
        series: "",
        description: "",
        favorite: false,
        collectionIds: [],
        selected: true,
        metadataState: "idle",
        metadataSource: null,
        titleTouched: false,
        authorTouched: false,
        descriptionTouched: false
      });
    });

    if (next.length > 0) {
      setDrafts((prev) => [...next, ...prev]);
      for (const draft of next) {
        void runMetadataPreview(draft);
      }
    }
  };

  const uploadDraft = async (draft: UploadDraft): Promise<boolean> => {
    setUploadingIds((prev) => [...prev, draft.id]);
    updateDraft(draft.id, { error: undefined });

    try {
      const formData = new FormData();
      formData.append("file", draft.file);

      if (draft.title.trim()) formData.append("title", draft.title.trim());
      if (draft.author.trim()) formData.append("author", draft.author.trim());
      if (draft.series.trim()) formData.append("series", draft.series.trim());
      if (draft.description.trim()) formData.append("description", draft.description.trim());

      formData.append("favorite", String(draft.favorite));
      formData.append("autoMetadata", "true");
      formData.append("collectionIds", JSON.stringify(draft.collectionIds));

      const payload = await apiFetch<{ jobId: string; status: UploadJob["status"] }>("/api/v1/uploads", {
        method: "POST",
        body: formData
      });

      setJobs((prev) => [{ id: payload.jobId, status: payload.status }, ...prev]);
      removeDraft(draft.id);
      return true;
    } catch (error) {
      updateDraft(draft.id, {
        error: toErrorMessage(error)
      });
      return false;
    } finally {
      setUploadingIds((prev) => prev.filter((id) => id !== draft.id));
    }
  };

  const handleAddSelected = async () => {
    const selected = drafts.filter((draft) => draft.selected);
    for (const draft of selected) {
      await uploadDraft(draft);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFilesToDrafts(e.dataTransfer.files);
  }, []);

  const uploadingAny = uploadingIds.length > 0;
  const selectedCount = drafts.filter((draft) => draft.selected).length;
  const selectedLoadingMetadata = drafts.some(
    (draft) => draft.selected && draft.metadataState === "loading"
  );

  // Determine which "step" the user is on for visual guidance
  const currentStep = drafts.length === 0 ? 1 : 2;

  return (
    <div className="space-y-10">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Books</h1>
        <p className="mt-2 text-[13px] text-muted-foreground/70 leading-relaxed max-w-md">
          Drop your files, review the auto-filled details, and add to your library.
        </p>
      </div>

      {/* Step indicators -- connected line design */}
      <div className="flex items-center gap-0">
        {/* Step 1 */}
        <div className={cn(
          "flex items-center gap-2 transition-colors duration-200",
          currentStep === 1 ? "text-primary" : "text-muted-foreground/50"
        )}>
          <span className={cn(
            "flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
            currentStep === 1
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : drafts.length > 0
                ? "bg-status-completed/15 text-status-completed ring-2 ring-status-completed/10"
                : "bg-muted text-muted-foreground/60"
          )}>
            {drafts.length > 0 ? <CheckCircle2 className="size-3.5" /> : "1"}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Select files</span>
        </div>

        {/* Connector line */}
        <div className={cn(
          "mx-3 h-px flex-1 max-w-16 transition-colors duration-300",
          drafts.length > 0 ? "bg-status-completed/30" : "bg-border/50"
        )} />

        {/* Step 2 */}
        <div className={cn(
          "flex items-center gap-2 transition-colors duration-200",
          currentStep === 2 ? "text-primary" : "text-muted-foreground/40"
        )}>
          <span className={cn(
            "flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300",
            currentStep === 2
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "bg-muted text-muted-foreground/60"
          )}>
            2
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Review metadata</span>
        </div>

        {/* Connector line */}
        <div className="mx-3 h-px flex-1 max-w-16 bg-border/50" />

        {/* Step 3 */}
        <div className="flex items-center gap-2 text-muted-foreground/40">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground/60">
            3
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">Add to library</span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-16 transition-all duration-300 cursor-pointer overflow-hidden",
          dragOver
            ? "border-primary/60 bg-primary/[0.06] shadow-[inset_0_0_60px_-12px] shadow-primary/10 scale-[1.005]"
            : "border-border/40 bg-gradient-to-b from-muted/30 via-transparent to-transparent hover:border-primary/30 hover:from-primary/[0.03]"
        )}
      >
        {/* Decorative background glow on drag -- multiple layers for richness */}
        <div className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500",
          dragOver ? "opacity-100" : "opacity-0"
        )} style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, oklch(0.52 0.15 50 / 0.1), transparent 70%)"
        }} />
        <div className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-700",
          dragOver ? "opacity-100" : "opacity-0"
        )} style={{
          background: "radial-gradient(circle at 30% 40%, oklch(0.60 0.18 148 / 0.04), transparent 50%), radial-gradient(circle at 70% 60%, oklch(0.62 0.16 250 / 0.04), transparent 50%)"
        }} />

        <div className={cn(
          "relative flex size-20 items-center justify-center rounded-[1.25rem] transition-all duration-300",
          dragOver
            ? "bg-primary/15 scale-110 shadow-lg shadow-primary/10"
            : "bg-muted/30 group-hover:bg-primary/8 group-hover:scale-105"
        )}>
          <FileUp className={cn(
            "size-9 transition-all duration-300",
            dragOver ? "text-primary -translate-y-1.5" : "text-muted-foreground/30 group-hover:text-primary/50"
          )} />
        </div>
        <div className="relative text-center space-y-1.5">
          <p className="text-sm font-semibold tracking-tight">Drop EPUB or PDF files here</p>
          <p className="text-xs text-muted-foreground/50">
            or click to browse -- metadata is looked up automatically
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFilesToDrafts(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {/* Draft cards */}
      {drafts.length > 0 && (
        <div className="space-y-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <BookOpen className="size-3.5 text-primary" />
              </div>
              <h2 className="text-base font-semibold tracking-tight">Review & Edit</h2>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {drafts.length} {drafts.length === 1 ? "file" : "files"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {drafts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    const nextSelected = selectedCount !== drafts.length;
                    setDrafts((prev) => prev.map((draft) => ({ ...draft, selected: nextSelected })));
                  }}
                >
                  {selectedCount === drafts.length ? "Deselect all" : "Select all"}
                </Button>
              )}
              <Button
                onClick={() => void handleAddSelected()}
                disabled={selectedCount === 0 || uploadingAny || selectedLoadingMetadata}
                size="sm"
                className="shadow-sm shadow-primary/20 active:scale-[0.97] transition-all duration-200"
              >
                {uploadingAny ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Add {selectedCount > 0 ? `${selectedCount} to library` : "to library"}
              </Button>
            </div>
          </div>

          {/* Draft list */}
          <div className="space-y-4">
            {drafts.map((draft, i) => {
              const isUploading = uploadingIds.includes(draft.id);
              const isLoading = draft.metadataState === "loading";
              const isEnriched = draft.metadataState === "enriched";
              const isNoMatch = draft.metadataState === "none";
              const isError = draft.metadataState === "error";
              const fileExt = draft.file.name.split(".").pop()?.toUpperCase() ?? "FILE";
              const fileSizeMB = (draft.file.size / 1024 / 1024).toFixed(1);

              return (
                <div
                  key={draft.id}
                  className={cn(
                    "group/card relative rounded-2xl border bg-card transition-all duration-300 animate-fade-up overflow-hidden",
                    draft.selected
                      ? "border-primary/25 shadow-sm shadow-primary/[0.04] ring-1 ring-primary/10"
                      : "border-border/40 hover:border-border/60",
                    isUploading && "opacity-60 pointer-events-none"
                  )}
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
                >
                  {/* Loading shimmer bar at top of card -- refined gradient */}
                  {isLoading && (
                    <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
                  )}

                  <div className="p-6">
                    {/* Top row: file info + metadata status + actions */}
                    <div className="flex items-start gap-4">
                      {/* Checkbox -- refined with subtle animation */}
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => updateDraft(draft.id, { selected: !draft.selected })}
                          className={cn(
                            "flex size-5 items-center justify-center rounded-md border-2 transition-all duration-200",
                            draft.selected
                              ? "border-primary bg-primary text-primary-foreground scale-100"
                              : "border-border/60 hover:border-primary/40 hover:scale-105"
                          )}
                        >
                          {draft.selected && <CheckCircle2 className="size-3" />}
                        </button>
                      </div>

                      {/* File type badge + name */}
                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                              "shrink-0 inline-flex items-center rounded-lg px-2 py-1 text-[10px] font-bold tracking-wider",
                              fileExt === "EPUB"
                                ? "bg-status-processing/10 text-status-processing"
                                : "bg-status-queued/12 text-status-queued"
                            )}>
                              {fileExt}
                            </span>
                            <p className="text-sm font-semibold truncate">{draft.file.name}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground/40 tabular-nums">{fileSizeMB} MB</span>
                          </div>

                          {/* Metadata status indicator */}
                          <div className="ml-auto shrink-0 flex items-center gap-2">
                            {isLoading && (
                              <div className="flex items-center gap-1.5 text-primary/80 animate-pulse-soft">
                                <Search className="size-3.5" />
                                <span className="text-[11px] font-medium">Looking up metadata...</span>
                              </div>
                            )}
                            {isEnriched && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-status-completed/8 px-2.5 py-1 text-[10px] font-semibold text-status-completed">
                                <Sparkles className="size-2.5" />
                                {sourceLabel(draft.metadataSource)}
                              </span>
                            )}
                            {isNoMatch && (
                              <div className="flex items-center gap-1.5 text-muted-foreground/50">
                                <AlertCircle className="size-3.5" />
                                <span className="text-[11px] font-medium">No metadata found</span>
                              </div>
                            )}
                            {isError && (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/8 px-2.5 py-1 text-[10px] font-semibold text-destructive">
                                <XCircle className="size-2.5" />
                                Lookup failed
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Metadata loading skeleton -- refined with better shimmer */}
                        {isLoading && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {["Title", "Author", "Series"].map((label) => (
                              <div key={label} className="space-y-2">
                                <span className="text-[11px] font-medium text-muted-foreground/40 uppercase tracking-[0.06em]">{label}</span>
                                <div className="h-9 rounded-xl bg-muted/30 animate-shimmer" style={{ backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, transparent 0%, oklch(0.52 0.15 50 / 0.05) 50%, transparent 100%)" }} />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Metadata fields -- shown once loading is done */}
                        {!isLoading && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">Title</Label>
                                  <AutoFilledHint visible={isEnriched && !draft.titleTouched && !!draft.title} />
                                </div>
                                <Input
                                  value={draft.title}
                                  onChange={(e) => updateDraft(draft.id, { title: e.target.value, titleTouched: true })}
                                  className={cn(
                                    "h-9 rounded-xl",
                                    isEnriched && !draft.titleTouched && draft.title && "border-status-completed/20 bg-status-completed/[0.03]"
                                  )}
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">Author</Label>
                                  <AutoFilledHint visible={isEnriched && !draft.authorTouched && !!draft.author} />
                                </div>
                                <Input
                                  value={draft.author}
                                  onChange={(e) => updateDraft(draft.id, { author: e.target.value, authorTouched: true })}
                                  className={cn(
                                    "h-9 rounded-xl",
                                    isEnriched && !draft.authorTouched && draft.author && "border-status-completed/20 bg-status-completed/[0.03]"
                                  )}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">Series</Label>
                                <Input
                                  value={draft.series}
                                  onChange={(e) => updateDraft(draft.id, { series: e.target.value })}
                                  className="h-9 rounded-xl"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-[0.06em]">Description</Label>
                                <AutoFilledHint visible={isEnriched && !draft.descriptionTouched && !!draft.description} />
                              </div>
                              <Textarea
                                rows={2}
                                value={draft.description}
                                onChange={(e) => updateDraft(draft.id, { description: e.target.value, descriptionTouched: true })}
                                className={cn(
                                  "text-sm resize-none rounded-xl",
                                  isEnriched && !draft.descriptionTouched && draft.description && "border-status-completed/20 bg-status-completed/[0.03]"
                                )}
                              />
                            </div>

                            {/* Bottom row: collections, favorite, quick add */}
                            <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/20">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Collections as pill-shaped tags */}
                                {(collections.data ?? []).length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/40 mr-1">
                                      Collections
                                    </span>
                                    {(collections.data ?? []).map((collection) => {
                                      const selected = draft.collectionIds.includes(collection.id);
                                      return (
                                        <button
                                          key={collection.id}
                                          type="button"
                                          onClick={() => {
                                            const next = selected
                                              ? draft.collectionIds.filter((id) => id !== collection.id)
                                              : [...draft.collectionIds, collection.id];
                                            updateDraft(draft.id, { collectionIds: next });
                                          }}
                                          className={cn(
                                            "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                                            selected
                                              ? "bg-primary/12 text-primary ring-1 ring-primary/20"
                                              : "bg-muted/30 text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground/70"
                                          )}
                                        >
                                          {collection.icon && <span className="mr-1">{collection.icon}</span>}
                                          {collection.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Favorite toggle -- pill-shaped */}
                                <button
                                  type="button"
                                  onClick={() => updateDraft(draft.id, { favorite: !draft.favorite })}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                                    draft.favorite
                                      ? "bg-status-queued/12 text-status-queued ring-1 ring-status-queued/20"
                                      : "bg-muted/30 text-muted-foreground/40 hover:bg-muted/50 hover:text-status-queued/60"
                                  )}
                                >
                                  <Star className={cn("size-3", draft.favorite && "fill-current")} />
                                  Favorite
                                </button>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-muted-foreground/30 hover:text-destructive transition-colors duration-200"
                                  onClick={() => removeDraft(draft.id)}
                                  disabled={isUploading}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => void uploadDraft(draft)}
                                  disabled={isUploading || isLoading}
                                  className="shadow-sm shadow-primary/15 active:scale-[0.97] transition-all duration-200"
                                >
                                  {isUploading ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="size-3.5" />
                                  )}
                                  Add to library
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Error message */}
                        {draft.error && (
                          <div className="flex items-center gap-2 rounded-xl bg-destructive/6 border border-destructive/12 px-4 py-3 mt-2">
                            <XCircle className="size-3.5 text-destructive shrink-0" />
                            <p className="text-xs text-destructive">{draft.error}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload jobs -- timeline-style feed */}
      {jobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Upload className="size-3.5 text-primary" />
            </div>
            <h2 className="text-base font-semibold tracking-tight">Import Progress</h2>
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {jobs.filter((j) => j.status === "COMPLETED").length}/{jobs.length} done
            </Badge>
          </div>

          {/* Timeline container with vertical line */}
          <div className="relative pl-4">
            {/* Vertical connector line */}
            <div className="absolute left-[1.1rem] top-2 bottom-2 w-px bg-border/40" />

            <div className="space-y-2">
              {jobs.map((job, i) => {
                const display = statusDisplay[job.status];
                return (
                  <div
                    key={job.id}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl border px-4 py-3 ml-4 transition-all duration-200 animate-fade-up",
                      job.status === "COMPLETED" && "border-status-completed/15 bg-status-completed/[0.03]",
                      job.status === "FAILED" && "border-destructive/15 bg-destructive/[0.03]",
                      job.status === "PROCESSING" && "border-status-processing/15 bg-status-processing/[0.03]",
                      job.status === "QUEUED" && "border-border/30 bg-muted/5"
                    )}
                    style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
                  >
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute -left-[1.65rem] flex size-3 items-center justify-center rounded-full ring-2 ring-background",
                      job.status === "COMPLETED" && "bg-status-completed",
                      job.status === "FAILED" && "bg-destructive",
                      job.status === "PROCESSING" && "bg-status-processing",
                      job.status === "QUEUED" && "bg-muted-foreground/30"
                    )} />

                    <div className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      job.status === "COMPLETED" && "bg-status-completed/10 text-status-completed",
                      job.status === "FAILED" && "bg-destructive/10 text-destructive",
                      job.status === "PROCESSING" && "bg-status-processing/10 text-status-processing",
                      job.status === "QUEUED" && "bg-status-queued/10 text-status-queued"
                    )}>
                      {display.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {job.status === "COMPLETED" ? "Book imported" : `Job ${job.id.slice(0, 8)}`}
                      </p>
                      {job.error && (
                        <p className="text-xs text-destructive mt-0.5 truncate">{job.error}</p>
                      )}
                      {job.result?.bookId && (
                        <p className="text-xs text-muted-foreground/50 mt-0.5">
                          Book #{job.result.bookId}
                        </p>
                      )}
                    </div>
                    <Badge variant={display.variant} className="shrink-0 gap-1">
                      {display.icon}
                      {display.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
