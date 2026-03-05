import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  source: "OPEN_LIBRARY" | "GOOGLE" | "NONE";
  title?: string | null;
  author?: string | null;
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
  autoMetadata: boolean;
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
    if (!target.autoMetadata) return;

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
          if (!draft.autoMetadata) return draft;

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
        autoMetadata: true,
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
      formData.append("autoMetadata", String(draft.autoMetadata));
      formData.append("collectionIds", JSON.stringify(draft.collectionIds));

      const response = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: {
          authorization: `Bearer ${JSON.parse(localStorage.getItem("booklite_tokens") || "{}").accessToken ?? ""}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        updateDraft(draft.id, { error: errorText || "Upload failed" });
        return false;
      }

      const payload = (await response.json()) as { jobId: string; status: UploadJob["status"] };
      setJobs((prev) => [{ id: payload.jobId, status: payload.status }, ...prev]);
      removeDraft(draft.id);
      return true;
    } catch (error) {
      updateDraft(draft.id, {
        error: error instanceof Error ? error.message : "Upload failed"
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Uploads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Files are enriched with metadata first, then you review and queue imports.
        </p>
      </div>

      <Card className="border-border/40">
        <CardContent className="pt-5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-all duration-200 cursor-pointer",
              dragOver
                ? "border-primary bg-primary/[0.04] shadow-inner"
                : "border-border/50 bg-muted/10 hover:border-primary/30 hover:bg-muted/20"
            )}
          >
            <div className={cn(
              "flex size-14 items-center justify-center rounded-2xl transition-colors duration-200",
              dragOver ? "bg-primary/15" : "bg-muted/50"
            )}>
              <FileUp className={cn(
                "size-7 transition-colors duration-200",
                dragOver ? "text-primary" : "text-muted-foreground/40"
              )} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports EPUB and PDF files, multiple at once
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
              <Plus className="size-4" />
              Add files
            </Button>
            <Button
              onClick={() => void handleAddSelected()}
              disabled={selectedCount === 0 || uploadingAny || selectedLoadingMetadata}
              size="sm"
            >
              {uploadingAny ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Add selected ({selectedCount})
            </Button>
            {selectedLoadingMetadata && (
              <Badge variant="info" className="text-[10px]">
                Waiting for metadata...
              </Badge>
            )}
            {drafts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const nextSelected = selectedCount !== drafts.length;
                  setDrafts((prev) => prev.map((draft) => ({ ...draft, selected: nextSelected })));
                }}
              >
                {selectedCount === drafts.length ? "Clear selection" : "Select all"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {drafts.length > 0 && (
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <FileText className="size-3.5 text-primary" />
              </div>
              Review Queue
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {drafts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {drafts.map((draft) => {
              const isUploading = uploadingIds.includes(draft.id);
              return (
                <div key={draft.id} className="rounded-xl border border-border/50 p-4 space-y-3 bg-muted/10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={(e) => updateDraft(draft.id, { selected: e.target.checked })}
                        />
                        <p className="text-sm font-semibold truncate">{draft.file.name}</p>
                        {draft.metadataState === "loading" && <Loader2 className="size-3.5 animate-spin text-primary" />}
                        {draft.metadataState === "enriched" && (
                          <Badge variant="success" className="text-[10px]">{draft.metadataSource ?? "Metadata"}</Badge>
                        )}
                        {draft.metadataState === "none" && (
                          <Badge variant="secondary" className="text-[10px]">No metadata match</Badge>
                        )}
                        {draft.metadataState === "error" && (
                          <Badge variant="destructive" className="text-[10px]">Metadata failed</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(draft.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant={draft.favorite ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateDraft(draft.id, { favorite: !draft.favorite })}
                      >
                        <Star className={cn("size-3.5", draft.favorite && "fill-current")} />
                        Favorite
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeDraft(draft.id)}
                        disabled={isUploading}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="Title"
                      value={draft.title}
                      onChange={(e) => updateDraft(draft.id, { title: e.target.value, titleTouched: true })}
                    />
                    <Input
                      placeholder="Author"
                      value={draft.author}
                      onChange={(e) => updateDraft(draft.id, { author: e.target.value, authorTouched: true })}
                    />
                    <Input
                      placeholder="Series"
                      value={draft.series}
                      onChange={(e) => updateDraft(draft.id, { series: e.target.value })}
                    />
                    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Sparkles className="size-3.5" />
                        Auto metadata
                      </div>
                      <Switch
                        checked={draft.autoMetadata}
                        onCheckedChange={(checked) => {
                          updateDraft(draft.id, { autoMetadata: checked });
                          if (checked) void runMetadataPreview({ ...draft, autoMetadata: true });
                        }}
                      />
                    </div>
                  </div>

                  <Textarea
                    rows={3}
                    placeholder="Description"
                    value={draft.description}
                    onChange={(e) => updateDraft(draft.id, { description: e.target.value, descriptionTouched: true })}
                  />

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Collections</p>
                    <div className="flex flex-wrap gap-2">
                      {(collections.data ?? []).map((collection) => {
                        const selected = draft.collectionIds.includes(collection.id);
                        return (
                          <Button
                            key={collection.id}
                            type="button"
                            size="sm"
                            variant={selected ? "default" : "outline"}
                            onClick={() => {
                              const next = selected
                                ? draft.collectionIds.filter((id) => id !== collection.id)
                                : [...draft.collectionIds, collection.id];
                              updateDraft(draft.id, { collectionIds: next });
                            }}
                          >
                            {collection.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {draft.error && (
                    <p className="text-xs text-destructive">{draft.error}</p>
                  )}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => void uploadDraft(draft)}
                      disabled={isUploading || draft.metadataState === "loading"}
                    >
                      {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                      Quick add
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <Card className="border-border/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <Upload className="size-3.5 text-primary" />
              </div>
              Upload Jobs
              <Badge variant="secondary" className="ml-auto text-[10px]">
                {jobs.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job, i) => {
              const display = statusDisplay[job.status];
              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/10 p-3 animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      job.status === "COMPLETED" && "bg-status-completed/10",
                      job.status === "FAILED" && "bg-destructive/10",
                      job.status === "PROCESSING" && "bg-status-processing/10",
                      job.status === "QUEUED" && "bg-status-queued/10"
                    )}>
                      {display.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">Job {job.id.slice(0, 8)}</p>
                      {job.error && (
                        <p className="text-xs text-destructive mt-0.5 truncate">{job.error}</p>
                      )}
                      {job.result?.bookId && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Book ID: {job.result.bookId}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={display.variant} className="shrink-0 gap-1">
                    {display.label}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
