import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Upload,
  FileUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileText,
} from "lucide-react";

interface UploadJob {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  result?: { bookId?: number } | null;
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

export const UploadsPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<number | null>(null);

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

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: {
          authorization: `Bearer ${JSON.parse(localStorage.getItem("booklite_tokens") || "{}").accessToken ?? ""}`
        },
        body: formData
      });

      if (!response.ok) {
        alert("Upload failed");
        return;
      }

      const payload = (await response.json()) as { jobId: string; status: UploadJob["status"] };
      setJobs((prev) => [{ id: payload.jobId, status: payload.status }, ...prev]);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".epub") || file.name.endsWith(".pdf"))) {
      setSelectedFile(file);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Uploads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import EPUB and PDF files into your library
        </p>
      </div>

      {/* Upload zone */}
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
              <p className="text-sm font-medium">
                {selectedFile ? selectedFile.name : "Drop a file here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports EPUB and PDF files
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {selectedFile && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </Badge>
              </div>
              <Button onClick={() => void handleUpload()} disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job list */}
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
