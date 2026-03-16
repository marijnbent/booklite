import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { isUploadableBookName, toInitialBookTitle } from "@/lib/bookFormats";
import { toRenderableCoverSrc } from "@/lib/covers";
import type { MetadataCoverOption, MetadataSource } from "@booklite/shared";
import { sourceLabel } from "@booklite/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CoverOptionGrid } from "@/components/CoverOptionGrid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload,
  FileUp,
  CheckCircle2,
  Check,
  XCircle,
  Loader2,
  Clock,
  Plus,
  Trash2,
  Star,
  Pencil,
  RotateCw,
} from "lucide-react";

interface UploadJob {
  id: string;
  title: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  result?: { bookId?: number } | null;
}

interface UploadJobStatusResponse {
  jobs: Array<{
    id: string;
    status: UploadJob["status"];
    error?: string | null;
    result?: { bookId?: number } | null;
  }>;
}

interface BatchUploadResult {
  id: string;
  title: string;
  fileName: string;
  jobId?: string;
  status?: UploadJob["status"];
  error?: string;
}

interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
}

interface MetadataPreview {
  source: MetadataSource;
  queryTitle: string;
  queryAuthor?: string | null;
  querySeries?: string | null;
  title?: string | null;
  author?: string | null;
  series?: string | null;
  description?: string | null;
  coverPath?: string | null;
  coverOptions: MetadataCoverOption[];
}

interface UploadDraft {
  id: string;
  file: File;
  fileNameTitle: string;
  title: string;
  author: string;
  series: string;
  description: string;
  coverPath: string;
  coverOptions: MetadataCoverOption[];
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

const DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES = 8 * 1024 * 1024;
const DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES = 5;

const createUploadBatches = (targets: UploadDraft[]): UploadDraft[][] => {
  const batches: UploadDraft[][] = [];
  let currentBatch: UploadDraft[] = [];
  let currentBytes = 0;

  for (const draft of targets) {
    const exceedsFileCount = currentBatch.length >= DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES;
    const exceedsByteBudget =
      currentBatch.length > 0 &&
      currentBytes + draft.file.size > DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES;

    if (exceedsFileCount || exceedsByteBudget) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }

    currentBatch.push(draft);
    currentBytes += draft.file.size;

    if (currentBytes >= DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBytes = 0;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
};

const toErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error)) return "Upload failed";

  if (
    error.message.includes("413") ||
    error.message.toLowerCase().includes("request entity too large") ||
    /<title>\s*413\b/i.test(error.message)
  ) {
    return "Request too large for the deployed server. Retry fewer files at once.";
  }

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
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);
  const pollingRef = useRef(false);

  const editingDraft = editingDraftId ? drafts.find((d) => d.id === editingDraftId) ?? null : null;

  const collections = useQuery({
    queryKey: ["collections", "uploads"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections")
  });

  const pollJobs = async () => {
    const pendingIds = jobs
      .filter((job) => job.status === "QUEUED" || job.status === "PROCESSING")
      .map((job) => job.id);

    if (pendingIds.length === 0 || pollingRef.current) return;

    pollingRef.current = true;

    try {
      const response = await apiFetch<UploadJobStatusResponse>("/api/v1/import-jobs/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: pendingIds })
      });

      const updates = new Map(response.jobs.map((job) => [job.id, job]));
      setJobs((current) =>
        current.map((job) => {
          const update = updates.get(job.id);
          if (!update) return job;

          return {
            ...job,
            status: update.status,
            error: update.error,
            result: update.result
          };
        })
      );
    } catch {
      // Leave the current state intact and try again on the next interval.
    } finally {
      pollingRef.current = false;
    }
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
    if (editingDraftId === id) setEditingDraftId(null);
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
          fileName: target.file.name,
          title: target.titleTouched ? (target.title || undefined) : undefined,
          author: target.authorTouched ? (target.author || undefined) : undefined
        })
      });

      setDrafts((prev) =>
        prev.map((draft): UploadDraft => {
          if (draft.id !== target.id) return draft;

          if (preview.source === "NONE") {
            return {
              ...draft,
              title: draft.titleTouched ? draft.title : preview.queryTitle,
              author: draft.authorTouched ? draft.author : (preview.queryAuthor ?? draft.author),
              series:
                draft.series.trim().length > 0
                  ? draft.series
                  : (preview.querySeries ?? draft.series),
              coverPath: "",
              coverOptions: [],
              metadataState: "none",
              metadataSource: "NONE"
            };
          }

          const selectedCoverPath =
            preview.coverPath?.trim() ||
            preview.coverOptions[0]?.coverPath ||
            "";

          return {
            ...draft,
            title:
              draft.titleTouched
                ? draft.title
                : (preview.title ?? preview.queryTitle ?? draft.title),
            author:
              draft.authorTouched
                ? draft.author
                : (preview.author ?? preview.queryAuthor ?? draft.author),
            series:
              draft.series.trim().length > 0
                ? draft.series
                : (preview.series ?? preview.querySeries ?? draft.series),
            description: draft.descriptionTouched
              ? draft.description
              : (preview.description ?? draft.description),
            coverPath: selectedCoverPath,
            coverOptions: preview.coverOptions,
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
      if (!isUploadableBookName(file.name)) return;
      const fileNameTitle = toInitialBookTitle(file.name);
      next.push({
        id: crypto.randomUUID(),
        file,
        fileNameTitle,
        title: fileNameTitle,
        author: "",
        series: "",
        description: "",
        coverPath: "",
        coverOptions: [],
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

  const uploadDrafts = async (targets: UploadDraft[]): Promise<void> => {
    if (targets.length === 0) return;

    const targetIds = targets.map((draft) => draft.id);
    setUploadingIds((prev) => [...new Set([...prev, ...targetIds])]);
    setDrafts((prev) =>
      prev.map((draft) =>
        targetIds.includes(draft.id)
          ? { ...draft, error: undefined }
          : draft
      )
    );

    try {
      const batches = createUploadBatches(targets);

      for (const batch of batches) {
        const batchIds = batch.map((draft) => draft.id);
        const formData = new FormData();
        formData.append(
          "drafts",
          JSON.stringify(
            batch.map((draft) => ({
              id: draft.id,
              title: draft.title.trim() || undefined,
              author: draft.author.trim() || undefined,
              series: draft.series.trim() || undefined,
              description: draft.description.trim() || undefined,
              coverPath: draft.coverPath.trim() || undefined,
              favorite: draft.favorite,
              autoMetadata: true,
              collectionIds: draft.collectionIds
            }))
          )
        );

        batch.forEach((draft) => {
          formData.append(`file:${draft.id}`, draft.file, draft.file.name);
        });

        try {
          const payload = await apiFetch<{ results: BatchUploadResult[] }>("/api/v1/uploads", {
            method: "POST",
            body: formData
          });

          const resultMap = new Map(payload.results.map((result) => [result.id, result]));
          const queuedIds = new Set(
            payload.results
              .filter((result) => result.jobId && result.status)
              .map((result) => result.id)
          );

          const nextJobs = payload.results
            .filter((result): result is BatchUploadResult & { jobId: string; status: UploadJob["status"] } =>
              Boolean(result.jobId && result.status)
            )
            .map((result) => ({
              id: result.jobId,
              title: result.title,
              status: result.status
            }));

          if (nextJobs.length > 0) {
            setJobs((prev) => [...prev, ...nextJobs]);
          }

          setDrafts((prev) =>
            prev
              .filter((draft) => !queuedIds.has(draft.id))
              .map((draft) => {
                if (!batchIds.includes(draft.id)) return draft;
                const result = resultMap.get(draft.id);
                if (!result) {
                  return {
                    ...draft,
                    error: "Upload response was incomplete"
                  };
                }

                if (!result.error) return draft;
                return {
                  ...draft,
                  error: result.error
                };
              })
          );
        } catch (error) {
          const message = toErrorMessage(error);
          setDrafts((prev) =>
            prev.map((draft) =>
              batchIds.includes(draft.id)
                ? { ...draft, error: message }
                : draft
            )
          );
        }
      }
    } finally {
      setUploadingIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    }
  };

  const uploadDraft = async (draft: UploadDraft): Promise<void> => {
    await uploadDrafts([draft]);
  };

  const handleAddSelected = async () => {
    const selected = drafts.filter((draft) => draft.selected && !uploadingIds.includes(draft.id));
    await uploadDrafts(selected);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFilesToDrafts(e.dataTransfer.files);
  }, []);

  const uploadingAny = uploadingIds.length > 0;
  const selectedCount = drafts.filter((draft) => draft.selected && !uploadingIds.includes(draft.id)).length;
  const selectedLoadingMetadata = drafts.some(
    (draft) => draft.selected && draft.metadataState === "loading"
  );

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add books to your library from EPUB, KEPUB, or PDF files.
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
          <p className="text-sm font-medium">Drop EPUB, KEPUB, or PDF files here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            or click to browse -- metadata is looked up automatically
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.kepub,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFilesToDrafts(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {/* Draft rows */}
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

          {/* Compact draft list */}
          <div className="space-y-1">
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
                    "group flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-150",
                    draft.selected
                      ? "border-primary/30 bg-primary/[0.02]"
                      : "border-border/60",
                    isUploading && "opacity-60 pointer-events-none",
                    draft.error && "border-destructive/30",
                    (isNoMatch || isError) && "border-status-queued/40 bg-status-queued/[0.03]"
                  )}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => updateDraft(draft.id, { selected: !draft.selected })}
                    className={cn(
                      "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors duration-150",
                      draft.selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-muted-foreground/50"
                    )}
                  >
                    {draft.selected && <CheckCircle2 className="size-3" />}
                  </button>

                  {/* Cover thumbnail */}
                  <button
                    type="button"
                    onClick={() => setEditingDraftId(draft.id)}
                    className="shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30 transition-colors hover:border-primary/40"
                    style={{ width: 32, height: 48 }}
                  >
                    {draft.coverPath ? (
                      <img
                        src={toRenderableCoverSrc(draft.coverPath) ?? draft.coverPath}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground/30">
                        <FileUp className="size-3" />
                      </div>
                    )}
                  </button>

                  {/* Title */}
                  <input
                    value={draft.title}
                    onChange={(e) => updateDraft(draft.id, { title: e.target.value, titleTouched: true })}
                    placeholder="Title"
                    className="min-w-0 flex-[3] truncate border-0 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/40 focus:underline focus:decoration-primary/30 focus:underline-offset-4"
                  />

                  <span className="shrink-0 text-muted-foreground/30">—</span>

                  {/* Author */}
                  <input
                    value={draft.author}
                    onChange={(e) => updateDraft(draft.id, { author: e.target.value, authorTouched: true })}
                    placeholder="Author"
                    className="min-w-0 flex-[2] truncate border-0 bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:underline focus:decoration-primary/30 focus:underline-offset-4"
                  />

                  {/* Series — always rendered to keep alignment */}
                  <span className="hidden shrink-0 w-36 text-xs text-muted-foreground/50 lg:inline truncate text-right">
                    {draft.series || "\u00A0"}
                  </span>

                  {/* Metadata status — fixed width */}
                  <div className="shrink-0 w-20 text-right">
                    {isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground inline-block" />}
                    {isEnriched && (
                      <span className="text-[11px] text-status-completed whitespace-nowrap">
                        {sourceLabel(draft.metadataSource)}
                      </span>
                    )}
                    {isNoMatch && (
                      <span className="text-[11px] text-status-queued font-medium whitespace-nowrap">No match</span>
                    )}
                    {isError && (
                      <span className="text-[11px] text-destructive whitespace-nowrap">Error</span>
                    )}
                  </div>

                  {/* File badge — fixed width */}
                  <span className="hidden shrink-0 w-24 text-right text-[10px] text-muted-foreground/50 tabular-nums sm:inline whitespace-nowrap">
                    {fileExt} · {fileSizeMB} MB
                  </span>

                  {/* Upload error */}
                  {draft.error && (
                    <span className="shrink-0 max-w-48 truncate text-[11px] text-destructive" title={draft.error}>
                      {draft.error}
                    </span>
                  )}

                  {/* Retry button */}
                  {draft.error && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive/60 hover:text-destructive"
                      onClick={() => void uploadDraft(draft)}
                      disabled={isUploading}
                      title="Retry upload"
                    >
                      <RotateCw className="size-3.5" />
                    </Button>
                  )}

                  {/* Edit button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground/40 hover:text-foreground"
                    onClick={() => setEditingDraftId(draft.id)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground/40 hover:text-destructive"
                    onClick={() => removeDraft(draft.id)}
                    disabled={isUploading}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog
        open={editingDraft !== null}
        onOpenChange={(open) => { if (!open) setEditingDraftId(null); }}
      >
        {editingDraft && (
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Book Details</DialogTitle>
              <DialogDescription className="truncate">
                {editingDraft.file.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-1 overflow-y-auto min-h-0">
              {/* Top: selected cover + fields side by side */}
              <div className="flex gap-4">
                {/* Selected cover preview */}
                <div className="shrink-0 w-24">
                  {editingDraft.coverPath ? (
                    <img
                      src={toRenderableCoverSrc(editingDraft.coverPath) ?? editingDraft.coverPath}
                      alt=""
                      className="w-full rounded-lg border border-border/40 object-cover aspect-[2/3]"
                    />
                  ) : (
                    <div className="flex w-full aspect-[2/3] items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/30">
                      <FileUp className="size-5 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                {/* Fields */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Title</Label>
                    <Input
                      value={editingDraft.title}
                      onChange={(e) => updateDraft(editingDraft.id, { title: e.target.value, titleTouched: true })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Author</Label>
                      <Input
                        value={editingDraft.author}
                        onChange={(e) => updateDraft(editingDraft.id, { author: e.target.value, authorTouched: true })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">Series</Label>
                      <Input
                        value={editingDraft.series}
                        onChange={(e) => updateDraft(editingDraft.id, { series: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">Description</Label>
                    <Textarea
                      rows={2}
                      value={editingDraft.description}
                      onChange={(e) => updateDraft(editingDraft.id, { description: e.target.value, descriptionTouched: true })}
                      className="text-sm resize-none max-h-16"
                    />
                  </div>
                </div>
              </div>

              {/* Cover alternatives — horizontal strip */}
              {(editingDraft.coverOptions.length > 0 || editingDraft.coverPath) && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Cover options</Label>
                  <CoverOptionGrid
                    selectedCoverPath={editingDraft.coverPath}
                    options={editingDraft.coverOptions.map((option, index) => ({
                      ...option,
                      badgeLabel: index === 0 ? "Default" : "Option",
                      metaLabel: sourceLabel(option.source)
                    }))}
                    onSelectCover={(coverPath) => updateDraft(editingDraft.id, { coverPath })}
                    onClearCover={() => updateDraft(editingDraft.id, { coverPath: "" })}
                    clearSelectedLabel="Using title card"
                    clearIdleLabel="Remove cover"
                    compact
                    className="grid-cols-5 sm:grid-cols-6"
                  />
                </div>
              )}

              {/* Collections, favorite, done */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-3 flex-wrap">
                  {(collections.data ?? []).map((collection) => {
                    const selected = editingDraft.collectionIds.includes(collection.id);
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
                              ? editingDraft.collectionIds.filter((id) => id !== collection.id)
                              : [...editingDraft.collectionIds, collection.id];
                            updateDraft(editingDraft.id, { collectionIds: next });
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

                  <button
                    type="button"
                    onClick={() => updateDraft(editingDraft.id, { favorite: !editingDraft.favorite })}
                    className={cn(
                      "inline-flex items-center gap-1 text-[12px] transition-colors duration-150",
                      editingDraft.favorite
                        ? "text-status-queued"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    <Star className={cn("size-3.5", editingDraft.favorite && "fill-current")} />
                    Favorite
                  </button>
                </div>

                <Button
                  size="sm"
                  onClick={() => setEditingDraftId(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

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
                    <p className="text-sm font-medium truncate">{job.title}</p>
                    {job.error && (
                      <p className="text-xs text-destructive mt-0.5 truncate">{job.error}</p>
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
