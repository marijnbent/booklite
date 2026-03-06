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
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-completed/80 select-none">
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
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Books</h1>
        <p className="mt-1.5 text-sm text-muted-foreground/70">
          Drop your files, review the auto-filled details, and add to your library.
        </p>
      </div>

      {/* Step indicators -- subtle horizontal flow */}
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em]">
        <span className={cn(
          "flex items-center gap-1.5 transition-colors duration-200",
          currentStep === 1 ? "text-primary" : "text-muted-foreground/50"
        )}>
          <span className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-200",
            currentStep === 1
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : drafts.length > 0
                ? "bg-status-completed/15 text-status-completed"
                : "bg-muted text-muted-foreground/60"
          )}>
            {drafts.length > 0 ? <CheckCircle2 className="size-3" /> : "1"}
          </span>
          Select files
        </span>
        <ArrowRight className="size-3 text-muted-foreground/30" />
        <span className={cn(
          "flex items-center gap-1.5 transition-colors duration-200",
          currentStep === 2 ? "text-primary" : "text-muted-foreground/40"
        )}>
          <span className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-200",
            currentStep === 2
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
              : "bg-muted text-muted-foreground/60"
          )}>
            2
          </span>
          Review metadata
        </span>
        <ArrowRight className="size-3 text-muted-foreground/30" />
        <span className="flex items-center gap-1.5 text-muted-foreground/40">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground/60">
            3
          </span>
          Add to library
        </span>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "group relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 transition-all duration-300 cursor-pointer overflow-hidden",
          dragOver
            ? "border-primary bg-primary/[0.06] shadow-[inset_0_2px_20px_-4px] shadow-primary/10"
            : "border-border/40 bg-gradient-to-b from-muted/20 to-transparent hover:border-primary/30 hover:from-primary/[0.03]"
        )}
      >
        {/* Decorative background glow on drag */}
        <div className={cn(
          "pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-500",
          dragOver ? "opacity-100" : "opacity-0"
        )} style={{
          background: "radial-gradient(circle at 50% 50%, oklch(0.55 0.14 55 / 0.08), transparent 70%)"
        }} />

        <div className={cn(
          "relative flex size-16 items-center justify-center rounded-2xl transition-all duration-300",
          dragOver
            ? "bg-primary/15 scale-110"
            : "bg-muted/40 group-hover:bg-primary/10 group-hover:scale-105"
        )}>
          <FileUp className={cn(
            "size-8 transition-all duration-300",
            dragOver ? "text-primary -translate-y-1" : "text-muted-foreground/35 group-hover:text-primary/60"
          )} />
        </div>
        <div className="relative text-center">
          <p className="text-sm font-semibold">Drop EPUB or PDF files here</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
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
        <div className="space-y-5">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <BookOpen className="size-3.5 text-primary" />
              </div>
              <h2 className="text-base font-semibold">Review & Edit</h2>
              <Badge variant="secondary" className="text-[10px]">
                {drafts.length} {drafts.length === 1 ? "file" : "files"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {drafts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
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
                className="shadow-sm shadow-primary/20"
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
                <Card
                  key={draft.id}
                  className={cn(
                    "border-border/40 transition-all duration-300 animate-fade-up overflow-hidden",
                    draft.selected && "ring-1 ring-primary/20 border-primary/30",
                    isUploading && "opacity-70 pointer-events-none"
                  )}
                  style={{ animationDelay: `${i * 60}ms`, animationFillMode: "backwards" }}
                >
                  {/* Loading shimmer bar at top of card */}
                  {isLoading && (
                    <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent animate-shimmer" style={{ backgroundSize: "200% 100%" }} />
                  )}

                  <CardContent className="p-5">
                    {/* Top row: file info + metadata status + actions */}
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => updateDraft(draft.id, { selected: !draft.selected })}
                          className={cn(
                            "flex size-5 items-center justify-center rounded-md border-2 transition-all duration-200",
                            draft.selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/60 hover:border-primary/40"
                          )}
                        >
                          {draft.selected && <CheckCircle2 className="size-3" />}
                        </button>
                      </div>

                      {/* File type badge + name */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={cn(
                              "shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider",
                              fileExt === "EPUB"
                                ? "bg-status-processing/12 text-status-processing"
                                : "bg-status-queued/15 text-status-queued"
                            )}>
                              {fileExt}
                            </span>
                            <p className="text-sm font-semibold truncate">{draft.file.name}</p>
                            <span className="shrink-0 text-[11px] text-muted-foreground/50">{fileSizeMB} MB</span>
                          </div>

                          {/* Metadata status indicator */}
                          <div className="ml-auto shrink-0 flex items-center gap-2">
                            {isLoading && (
                              <div className="flex items-center gap-1.5 text-primary animate-pulse-soft">
                                <Search className="size-3.5" />
                                <span className="text-[11px] font-medium">Looking up metadata...</span>
                              </div>
                            )}
                            {isEnriched && (
                              <Badge variant="success" className="gap-1 text-[10px]">
                                <Sparkles className="size-2.5" />
                                {sourceLabel(draft.metadataSource)}
                              </Badge>
                            )}
                            {isNoMatch && (
                              <div className="flex items-center gap-1.5 text-muted-foreground/60">
                                <AlertCircle className="size-3.5" />
                                <span className="text-[11px] font-medium">No metadata found -- fill in manually</span>
                              </div>
                            )}
                            {isError && (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <XCircle className="size-2.5" />
                                Lookup failed
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Metadata loading skeleton */}
                        {isLoading && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {["Title", "Author", "Series"].map((label) => (
                              <div key={label} className="space-y-1.5">
                                <span className="text-[11px] font-medium text-muted-foreground/50">{label}</span>
                                <div className="h-9 rounded-lg bg-muted/40 animate-shimmer" style={{ backgroundSize: "200% 100%", backgroundImage: "linear-gradient(90deg, transparent 0%, oklch(0.55 0.14 55 / 0.06) 50%, transparent 100%)" }} />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Metadata fields -- shown once loading is done */}
                        {!isLoading && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] font-medium text-muted-foreground/70">Title</Label>
                                  <AutoFilledHint visible={isEnriched && !draft.titleTouched && !!draft.title} />
                                </div>
                                <Input
                                  value={draft.title}
                                  onChange={(e) => updateDraft(draft.id, { title: e.target.value, titleTouched: true })}
                                  className={cn(
                                    "h-9",
                                    isEnriched && !draft.titleTouched && draft.title && "border-status-completed/25 bg-status-completed/[0.04]"
                                  )}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] font-medium text-muted-foreground/70">Author</Label>
                                  <AutoFilledHint visible={isEnriched && !draft.authorTouched && !!draft.author} />
                                </div>
                                <Input
                                  value={draft.author}
                                  onChange={(e) => updateDraft(draft.id, { author: e.target.value, authorTouched: true })}
                                  className={cn(
                                    "h-9",
                                    isEnriched && !draft.authorTouched && draft.author && "border-status-completed/25 bg-status-completed/[0.04]"
                                  )}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] font-medium text-muted-foreground/70">Series</Label>
                                <Input
                                  value={draft.series}
                                  onChange={(e) => updateDraft(draft.id, { series: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px] font-medium text-muted-foreground/70">Description</Label>
                                <AutoFilledHint visible={isEnriched && !draft.descriptionTouched && !!draft.description} />
                              </div>
                              <Textarea
                                rows={2}
                                value={draft.description}
                                onChange={(e) => updateDraft(draft.id, { description: e.target.value, descriptionTouched: true })}
                                className={cn(
                                  "text-sm resize-none",
                                  isEnriched && !draft.descriptionTouched && draft.description && "border-status-completed/25 bg-status-completed/[0.04]"
                                )}
                              />
                            </div>

                            {/* Bottom row: collections, favorite, quick add */}
                            <div className="flex items-center justify-between gap-3 pt-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Collections */}
                                {(collections.data ?? []).length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground/50 mr-0.5">
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
                                            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-200 border",
                                            selected
                                              ? "bg-primary/10 text-primary border-primary/25"
                                              : "bg-transparent text-muted-foreground/60 border-border/40 hover:border-primary/30 hover:text-foreground/80"
                                          )}
                                        >
                                          {collection.icon && <span className="mr-1">{collection.icon}</span>}
                                          {collection.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Favorite toggle */}
                                <button
                                  type="button"
                                  onClick={() => updateDraft(draft.id, { favorite: !draft.favorite })}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-200 border",
                                    draft.favorite
                                      ? "bg-status-queued/15 text-status-queued border-status-queued/25"
                                      : "bg-transparent text-muted-foreground/50 border-border/40 hover:border-status-queued/30 hover:text-status-queued/70"
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
                                  className="size-8 text-muted-foreground/40 hover:text-destructive"
                                  onClick={() => removeDraft(draft.id)}
                                  disabled={isUploading}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => void uploadDraft(draft)}
                                  disabled={isUploading || isLoading}
                                  className="shadow-sm shadow-primary/20"
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
                          <div className="flex items-center gap-2 rounded-lg bg-destructive/8 border border-destructive/15 px-3 py-2 mt-2">
                            <XCircle className="size-3.5 text-destructive shrink-0" />
                            <p className="text-xs text-destructive">{draft.error}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload jobs */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
              <Upload className="size-3.5 text-primary" />
            </div>
            <h2 className="text-base font-semibold">Import Progress</h2>
            <Badge variant="secondary" className="text-[10px]">
              {jobs.filter((j) => j.status === "COMPLETED").length}/{jobs.length} done
            </Badge>
          </div>

          <div className="grid gap-2">
            {jobs.map((job, i) => {
              const display = statusDisplay[job.status];
              return (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200 animate-fade-up",
                    job.status === "COMPLETED" && "border-status-completed/20 bg-status-completed/[0.04]",
                    job.status === "FAILED" && "border-destructive/20 bg-destructive/[0.04]",
                    job.status === "PROCESSING" && "border-status-processing/20 bg-status-processing/[0.04]",
                    job.status === "QUEUED" && "border-border/40 bg-muted/10"
                  )}
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
                >
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    job.status === "COMPLETED" && "bg-status-completed/15 text-status-completed",
                    job.status === "FAILED" && "bg-destructive/15 text-destructive",
                    job.status === "PROCESSING" && "bg-status-processing/15 text-status-processing",
                    job.status === "QUEUED" && "bg-status-queued/15 text-status-queued"
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
                      <p className="text-xs text-muted-foreground/60 mt-0.5">
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
      )}
    </div>
  );
};
