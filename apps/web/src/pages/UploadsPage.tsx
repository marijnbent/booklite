import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import { isUploadableBookName, toInitialBookTitle } from "@/lib/bookFormats";
import { toRenderableCoverSrc } from "@/lib/covers";
import type { MetadataCoverOption, MetadataSource } from "@/lib/metadata";
import { sourceLabel } from "@/lib/metadata";
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
  BookOpen,
  AlertTriangle,
  ChevronRight,
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
  slug?: string | null;
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

// Left-edge border color per draft state
const draftBorderColor = (draft: UploadDraft, isUploading: boolean): string => {
  if (isUploading) return "border-l-status-info";
  if (draft.error) return "border-l-destructive";
  if (draft.metadataState === "loading") return "border-l-muted";
  if (draft.metadataState === "none") return "border-l-status-queued";
  if (draft.metadataState === "error") return "border-l-destructive";
  // enriched or idle with no error
  return "border-l-status-completed";
};

// Left-edge border color per job status
const jobBorderColor = (status: UploadJob["status"]): string => {
  switch (status) {
    case "QUEUED": return "border-l-status-queued";
    case "PROCESSING": return "border-l-status-info";
    case "COMPLETED": return "border-l-status-completed";
    case "FAILED": return "border-l-destructive";
  }
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

// Sort drafts: error first, then no-match, then metadata-error, then rest
const sortDrafts = (drafts: UploadDraft[]): UploadDraft[] => {
  return [...drafts].sort((a, b) => {
    const priority = (d: UploadDraft): number => {
      if (d.error) return 0;
      if (d.metadataState === "none") return 1;
      if (d.metadataState === "error") return 2;
      return 3;
    };
    return priority(a) - priority(b);
  });
};

export const UploadsPage: React.FC = () => {
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [enteringDraftIds, setEnteringDraftIds] = useState<Set<string>>(new Set());
  const [enteringJobIds, setEnteringJobIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const dragCounterRef = useRef(0);
  const prevJobIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();

  const editingDraft = editingDraftId ? drafts.find((d) => d.id === editingDraftId) ?? null : null;

  const collections = useQuery({
    queryKey: ["collections", "uploads"],
    queryFn: () => apiFetch<CollectionItem[]>("/api/v1/collections")
  });

  const collectionItems = collections.data ?? [];
  const standardCollections = collectionItems.filter((collection) => collection.slug !== "favorites");

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

  // #10: Track newly added job IDs for entry animation
  useEffect(() => {
    const newIds = jobs.map((j) => j.id).filter((id) => !prevJobIdsRef.current.has(id));
    prevJobIdsRef.current = new Set(jobs.map((j) => j.id));
    if (newIds.length > 0) {
      setEnteringJobIds(new Set(newIds));
      const t = window.setTimeout(() => setEnteringJobIds(new Set()), 400);
      return () => window.clearTimeout(t);
    }
  }, [jobs]);

  const uploadingAny = uploadingIds.length > 0;
  const hasActiveJobs = jobs.some((j) => j.status === "QUEUED" || j.status === "PROCESSING");

  // #2: beforeunload protection while work is in progress
  useEffect(() => {
    if (!uploadingAny && !hasActiveJobs) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploadingAny, hasActiveJobs]);

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
      // #10: Mark new drafts as entering for animation
      const newIds = new Set(next.map((d) => d.id));
      setEnteringDraftIds(newIds);
      window.setTimeout(() => setEnteringDraftIds(new Set()), 400);
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
    dragCounterRef.current = 0;
    setDragOver(false);
    addFilesToDrafts(e.dataTransfer.files);
  }, []);

  // #9: Page-level drag handlers (used when hasAnyContent)
  const pageDragHandlers = {
    onDragEnter: () => { dragCounterRef.current++; setDragOver(true); },
    onDragLeave: () => { dragCounterRef.current--; if (dragCounterRef.current === 0) setDragOver(false); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDrop: handleDrop,
  };

  const selectedCount = drafts.filter((draft) => draft.selected && !uploadingIds.includes(draft.id)).length;
  const selectedLoadingMetadata = drafts.some(
    (draft) => draft.selected && draft.metadataState === "loading"
  );

  // #1: Completion state
  const allJobsDone = jobs.length > 0 && jobs.every((j) => j.status === "COMPLETED" || j.status === "FAILED") && drafts.length === 0 && !uploadingAny;
  const completedCount = jobs.filter((j) => j.status === "COMPLETED").length;
  const failedCount = jobs.filter((j) => j.status === "FAILED").length;

  // #3: Summary chip counts
  const readyCount = drafts.filter((d) => !d.error && (d.metadataState === "enriched" || d.metadataState === "idle") && !uploadingIds.includes(d.id)).length;
  const noMatchCount = drafts.filter((d) => d.metadataState === "none" && !d.error).length;
  const draftErrorCount = drafts.filter((d) => !!d.error || d.metadataState === "error").length;

  const hasAnyContent = drafts.length > 0 || jobs.length > 0;

  // Sorted drafts for rendering (#3)
  const sortedDrafts = sortDrafts(drafts);

  const dropZoneHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); },
    onDragLeave: () => setDragOver(false),
    onDrop: handleDrop,
    onClick: () => fileInputRef.current?.click(),
  };

  return (
    <div className="space-y-6" {...(hasAnyContent ? pageDragHandlers : {})}>
      {/* #9: Full-page drag overlay when files already exist */}
      {dragOver && hasAnyContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-3 text-primary">
            <FileUp className="size-12" />
            <p className="text-lg font-semibold">Drop to add books</p>
          </div>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add books to your library from EPUB, KEPUB, or PDF files.
        </p>
      </div>

      {/* #4: Drop zone — compact when files exist, tall when empty */}
      {!hasAnyContent ? (
        /* Tall drop zone */
        <div
          {...dropZoneHandlers}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-14 transition-all duration-200 cursor-pointer",
            dragOver
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border/70 hover:border-primary/40 hover:bg-accent/30"
          )}
        >
          <div className={cn(
            "flex size-14 items-center justify-center rounded-2xl transition-all duration-200",
            dragOver ? "bg-primary/12 ring-2 ring-primary/20" : "bg-muted/60"
          )}>
            <FileUp className={cn(
              "size-7 transition-colors duration-200",
              dragOver ? "text-primary" : "text-muted-foreground/50"
            )} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">{dragOver ? "Drop to add books" : "Drop EPUB, KEPUB, or PDF files here"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              or click to browse &mdash; metadata is looked up automatically
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
      ) : (
        /* #9: Hidden file input + FAB when files exist */
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
      )}

      {/* Status banner — importing or done */}
      {(uploadingAny || hasActiveJobs || allJobsDone) && (
        <div className={cn(
          "flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors duration-500",
          allJobsDone && failedCount > 0
            ? "border-destructive/20 bg-destructive/[0.04]"
            : allJobsDone
            ? "border-status-completed/25 bg-status-completed/[0.05]"
            : "border-status-queued/30 bg-status-queued/[0.06]"
        )}>
          <div className="flex items-center gap-2.5">
            {allJobsDone ? (
              <CheckCircle2 className={cn("size-4.5 shrink-0", failedCount > 0 ? "text-destructive" : "text-status-completed")} />
            ) : (
              <Loader2 className="size-4.5 shrink-0 animate-spin text-status-queued" />
            )}
            <span className="text-sm font-medium">
              {allJobsDone
                ? failedCount > 0
                  ? `${completedCount} ${completedCount === 1 ? "book" : "books"} added · ${failedCount} failed`
                  : `All ${completedCount} ${completedCount === 1 ? "book" : "books"} added to your library`
                : "Importing books — please stay on this page until complete."}
            </span>
          </div>
          {allJobsDone && (
            <div className="flex items-center gap-2 shrink-0">
              {!failedCount && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => addFilesToDrafts([])}>
                  Add more books
                </Button>
              )}
              <Button size="sm" className="gap-1" onClick={() => navigate("/")}>
                View Library
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* #5: Unified book list (drafts + jobs) */}
      {hasAnyContent && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* #3: Summary chip */}
              {drafts.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  {readyCount > 0 && (
                    <span className="text-status-completed font-medium">
                      {readyCount} ready
                    </span>
                  )}
                  {noMatchCount > 0 && (
                    <>
                      {readyCount > 0 && <span className="text-muted-foreground/40">·</span>}
                      <span className="text-status-queued font-medium">
                        {noMatchCount} no match
                      </span>
                    </>
                  )}
                  {draftErrorCount > 0 && (
                    <>
                      {(readyCount > 0 || noMatchCount > 0) && <span className="text-muted-foreground/40">·</span>}
                      <span className="text-destructive font-medium">
                        {draftErrorCount} error
                      </span>
                    </>
                  )}
                </div>
              )}
              {/* Job progress badge when jobs exist but not all done */}
              {jobs.length > 0 && !allJobsDone && (
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {jobs.filter((j) => j.status === "COMPLETED").length}/{jobs.length} imported
                </Badge>
              )}
            </div>
            {drafts.length > 0 && (
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
            )}
          </div>

          {/* #5/#6/#7: Unified row list */}
          <div className="space-y-1">
            {/* Draft rows */}
            {sortedDrafts.map((draft) => {
              const isUploading = uploadingIds.includes(draft.id);
              const isLoading = draft.metadataState === "loading";
              const isEnriched = draft.metadataState === "enriched";
              const isNoMatch = draft.metadataState === "none";
              const isMetaError = draft.metadataState === "error";

              return (
                <div
                  key={draft.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-r-lg border border-l-4 px-3 py-2 transition-all duration-300",
                    draftBorderColor(draft, isUploading),
                    draft.selected
                      ? "border-primary/20 bg-primary/[0.02]"
                      : "border-border/60",
                    isUploading && "opacity-60 pointer-events-none",
                    enteringDraftIds.has(draft.id) && "[animation:fade-up_0.35s_cubic-bezier(0.16,1,0.3,1)]",
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
                    className="relative shrink-0 overflow-hidden rounded border border-border/40 bg-muted/30 transition-colors hover:border-primary/40 group/cover"
                    style={{ width: 32, height: 48 }}
                  >
                    {draft.coverPath ? (
                      <>
                        <img
                          src={toRenderableCoverSrc(draft.coverPath) ?? draft.coverPath}
                          alt=""
                          className="size-full object-cover"
                        />
                        {isEnriched && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/cover:opacity-100 transition-opacity duration-150">
                            <span className="text-[8px] font-semibold text-white leading-tight text-center">swap</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground/30">
                        <FileUp className="size-3" />
                      </div>
                    )}
                  </button>

                  {/* Title + author — click to open edit modal */}
                  <button
                    type="button"
                    onClick={() => setEditingDraftId(draft.id)}
                    className="min-w-0 flex-1 flex items-baseline gap-2 text-left overflow-hidden"
                  >
                    <span className={cn("truncate text-sm font-medium", !draft.title && "text-muted-foreground/40")}>
                      {draft.title || "Untitled"}
                    </span>
                    {draft.author && (
                      <>
                        <span className="shrink-0 text-muted-foreground/30">—</span>
                        <span className="truncate text-sm text-muted-foreground">{draft.author}</span>
                      </>
                    )}
                  </button>

                  {/* Metadata status */}
                  <div className="shrink-0 w-28 text-right">
                    {isLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground inline-block" />}
                    {isEnriched && (
                      <button
                        type="button"
                        onClick={() => setEditingDraftId(draft.id)}
                        className="group/meta inline-flex flex-col items-end gap-0.5"
                      >
                        <span className="text-[11px] text-status-completed whitespace-nowrap leading-none">
                          {sourceLabel(draft.metadataSource)}
                        </span>
                        <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap leading-none group-hover/meta:text-muted-foreground/70 transition-colors duration-150">
                          edit details
                        </span>
                      </button>
                    )}
                    {isNoMatch && (
                      <span className="text-[11px] text-status-queued font-medium whitespace-nowrap">No match</span>
                    )}
                    {isMetaError && !draft.error && (
                      <span className="text-[11px] text-destructive whitespace-nowrap">Lookup error</span>
                    )}
                  </div>

                  {/* Upload error — tooltip on retry button, not inline */}
                  {draft.error && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive/70 hover:text-destructive"
                      onClick={() => void uploadDraft(draft)}
                      disabled={isUploading}
                      title={draft.error}
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

                  {/* Delete button — hover only */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground/0 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={() => removeDraft(draft.id)}
                    disabled={isUploading}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}

            {/* Job rows (inline in same list) */}
            {jobs.map((job) => {
              const display = statusDisplay[job.status];
              return (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center gap-3 rounded-r-lg border border-l-4 px-3 py-2 transition-all duration-500",
                    jobBorderColor(job.status),
                    "border-border/40",
                    enteringJobIds.has(job.id) && "[animation:fade-up_0.35s_cubic-bezier(0.16,1,0.3,1)]",
                  )}
                >
                  {/* Book icon placeholder (no cover for jobs) */}
                  <div
                    className="shrink-0 flex items-center justify-center rounded border border-border/30 bg-muted/20 text-muted-foreground/25"
                    style={{ width: 32, height: 48 }}
                  >
                    <BookOpen className="size-3.5" />
                  </div>

                  {/* Title */}
                  <p className="flex-1 min-w-0 text-sm font-medium truncate text-muted-foreground/80">
                    {job.title}
                  </p>

                  {/* Error text shown as tooltip on status badge area */}
                  {job.error && (
                    <span
                      className="shrink-0 max-w-36 truncate text-[11px] text-destructive/80 hidden sm:inline"
                      title={job.error}
                    >
                      {job.error}
                    </span>
                  )}

                  {/* Status badge */}
                  <Badge variant={display.variant} className="shrink-0 gap-1">
                    {display.icon}
                    {display.label}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Helper hint */}
          {drafts.length > 0 && (
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground/70">
              <Pencil className="size-3 shrink-0" />
              Click a row to edit details, change the cover, or pick a different metadata match.
            </p>
          )}
        </div>
      )}

      {/* #9: FAB — fixed bottom-right when files exist */}
      {hasAnyContent && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary pl-4 pr-5 py-3 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 hover:shadow-xl transition-all duration-200"
        >
          <Plus className="size-4" />
          Add files
        </button>
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
                  {standardCollections.map((collection) => {
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
                    aria-label={editingDraft.favorite ? "Remove from favorites" : "Add to favorites"}
                    title={editingDraft.favorite ? "Remove from favorites" : "Add to favorites"}
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-md transition-colors duration-150",
                      editingDraft.favorite
                        ? "text-status-queued"
                        : "text-muted-foreground/40 hover:text-muted-foreground"
                    )}
                  >
                    <Star className={cn("size-3.5", editingDraft.favorite && "fill-current")} />
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
    </div>
  );
};
