import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Plus,
  Trash2,
  Star,
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

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add books to your library from EPUB or PDF files.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12 transition-colors duration-200 cursor-pointer",
          dragOver
            ? "border-primary bg-accent/50"
            : "border-border hover:border-muted-foreground/30"
        )}
      >
        <FileUp className={cn(
          "size-8 transition-colors duration-200",
          dragOver ? "text-primary" : "text-muted-foreground/40"
        )} />
        <div className="text-center">
          <p className="text-sm font-medium">Drop EPUB or PDF files here</p>
          <p className="mt-1 text-xs text-muted-foreground">
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
              <h2 className="text-lg font-semibold tracking-tight">Review & Edit</h2>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {drafts.length} {drafts.length === 1 ? "file" : "files"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {drafts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
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
          <div className="space-y-3">
            {drafts.map((draft) => {
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
                    "rounded-lg border bg-card transition-colors duration-200",
                    draft.selected
                      ? "border-primary/30"
                      : "border-border/60",
                    isUploading && "opacity-60 pointer-events-none"
                  )}
                >
                  <div className="p-5">
                    {/* Top row: checkbox, file info, metadata status */}
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => updateDraft(draft.id, { selected: !draft.selected })}
                          className={cn(
                            "flex size-4.5 items-center justify-center rounded border transition-colors duration-150",
                            draft.selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-muted-foreground/50"
                          )}
                        >
                          {draft.selected && <CheckCircle2 className="size-3" />}
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-4">
                        {/* File info row */}
                        <div className="flex items-center gap-2.5">
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {fileExt}
                          </span>
                          <p className="text-sm font-medium truncate">{draft.file.name}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground/50 tabular-nums">{fileSizeMB} MB</span>

                          {/* Metadata status */}
                          <div className="ml-auto shrink-0 flex items-center gap-2">
                            {isLoading && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Loader2 className="size-3 animate-spin" />
                                <span className="text-[11px]">Looking up metadata...</span>
                              </div>
                            )}
                            {isEnriched && (
                              <span className="text-[11px] text-status-completed">
                                {sourceLabel(draft.metadataSource)}
                              </span>
                            )}
                            {isNoMatch && (
                              <span className="text-[11px] text-muted-foreground/50">
                                No metadata found
                              </span>
                            )}
                            {isError && (
                              <span className="text-[11px] text-destructive">
                                Lookup failed
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Loading state */}
                        {isLoading && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {["Title", "Author", "Series"].map((label) => (
                              <div key={label} className="space-y-1.5">
                                <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wide">{label}</span>
                                <div className="h-9 rounded-md bg-muted/50 flex items-center justify-center">
                                  <span className="text-xs text-muted-foreground/40">Loading...</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Metadata fields */}
                        {!isLoading && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">
                                  Title
                                  {isEnriched && !draft.titleTouched && draft.title && (
                                    <span className="ml-1 text-muted-foreground/50">(auto)</span>
                                  )}
                                </Label>
                                <Input
                                  value={draft.title}
                                  onChange={(e) => updateDraft(draft.id, { title: e.target.value, titleTouched: true })}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">
                                  Author
                                  {isEnriched && !draft.authorTouched && draft.author && (
                                    <span className="ml-1 text-muted-foreground/50">(auto)</span>
                                  )}
                                </Label>
                                <Input
                                  value={draft.author}
                                  onChange={(e) => updateDraft(draft.id, { author: e.target.value, authorTouched: true })}
                                  className="h-9"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">Series</Label>
                                <Input
                                  value={draft.series}
                                  onChange={(e) => updateDraft(draft.id, { series: e.target.value })}
                                  className="h-9"
                                />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">
                                Description
                                {isEnriched && !draft.descriptionTouched && draft.description && (
                                  <span className="ml-1 text-muted-foreground/50">(auto)</span>
                                )}
                              </Label>
                              <Textarea
                                rows={2}
                                value={draft.description}
                                onChange={(e) => updateDraft(draft.id, { description: e.target.value, descriptionTouched: true })}
                                className="text-sm resize-none"
                              />
                            </div>

                            {/* Bottom row: collections, favorite, actions */}
                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40">
                              <div className="flex items-center gap-3 flex-wrap">
                                {/* Collections as checkboxes */}
                                {(collections.data ?? []).length > 0 && (
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {(collections.data ?? []).map((collection) => {
                                      const selected = draft.collectionIds.includes(collection.id);
                                      return (
                                        <label
                                          key={collection.id}
                                          className="flex items-center gap-1.5 text-[12px] cursor-pointer select-none"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => {
                                              const next = selected
                                                ? draft.collectionIds.filter((id) => id !== collection.id)
                                                : [...draft.collectionIds, collection.id];
                                              updateDraft(draft.id, { collectionIds: next });
                                            }}
                                            className="rounded border-border accent-primary size-3.5"
                                          />
                                          <span className="text-muted-foreground">
                                            {collection.icon && <span className="mr-0.5">{collection.icon}</span>}
                                            {collection.name}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Favorite toggle */}
                                <button
                                  type="button"
                                  onClick={() => updateDraft(draft.id, { favorite: !draft.favorite })}
                                  className={cn(
                                    "inline-flex items-center gap-1 text-[12px] transition-colors duration-150",
                                    draft.favorite
                                      ? "text-status-queued"
                                      : "text-muted-foreground/40 hover:text-muted-foreground"
                                  )}
                                >
                                  <Star className={cn("size-3.5", draft.favorite && "fill-current")} />
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
                                  variant="secondary"
                                  onClick={() => void uploadDraft(draft)}
                                  disabled={isUploading || isLoading}
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
                          <div className="flex items-center gap-2 rounded-md bg-destructive/5 px-3 py-2.5 mt-1">
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

      {/* Import progress */}
      {jobs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Import Progress</h2>
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {jobs.filter((j) => j.status === "COMPLETED").length}/{jobs.length} done
            </Badge>
          </div>

          <div className="space-y-1.5">
            {jobs.map((job) => {
              const display = statusDisplay[job.status];
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-md border border-border/40 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {job.status === "COMPLETED" ? "Book imported" : `Job ${job.id.slice(0, 8)}`}
                    </p>
                    {job.error && (
                      <p className="text-xs text-destructive mt-0.5 truncate">{job.error}</p>
                    )}
                    {job.result?.bookId && (
                      <p className="text-xs text-muted-foreground mt-0.5">
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
