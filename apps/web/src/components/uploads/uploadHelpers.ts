import type { UploadDraft, UploadJob } from "./UploadDraftTypes";

export const DEPLOYMENT_SAFE_UPLOAD_BATCH_BYTES = 8 * 1024 * 1024;
export const DEPLOYMENT_SAFE_UPLOAD_BATCH_FILES = 5;

export const createUploadBatches = (targets: UploadDraft[]): UploadDraft[][] => {
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

export const toErrorMessage = (error: unknown): string => {
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
export const sortDrafts = (drafts: UploadDraft[]): UploadDraft[] => {
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

// Left-edge border color per draft state
export const draftBorderColor = (draft: UploadDraft, isUploading: boolean): string => {
  if (isUploading) return "border-l-status-info";
  if (draft.error) return "border-l-destructive";
  if (draft.metadataState === "loading") return "border-l-muted";
  if (draft.metadataState === "none") return "border-l-status-queued";
  if (draft.metadataState === "error") return "border-l-destructive";
  // enriched or idle with no error
  return "border-l-status-completed";
};

// Left-edge border color per job status
export const jobBorderColor = (status: UploadJob["status"]): string => {
  switch (status) {
    case "QUEUED": return "border-l-status-queued";
    case "PROCESSING": return "border-l-status-info";
    case "COMPLETED": return "border-l-status-completed";
    case "FAILED": return "border-l-destructive";
  }
};
