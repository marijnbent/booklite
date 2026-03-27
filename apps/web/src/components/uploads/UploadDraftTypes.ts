import type { MetadataCoverOption, MetadataSource } from "@/lib/metadata";

export interface UploadJob {
  id: string;
  title: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  error?: string | null;
  result?: { bookId?: number } | null;
}

export interface UploadJobStatusResponse {
  jobs: Array<{
    id: string;
    status: UploadJob["status"];
    error?: string | null;
    result?: { bookId?: number } | null;
  }>;
}

export interface BatchUploadResult {
  id: string;
  title: string;
  fileName: string;
  jobId?: string;
  status?: UploadJob["status"];
  error?: string;
}

export interface CollectionItem {
  id: number;
  name: string;
  icon: string | null;
  slug?: string | null;
}

export interface MetadataPreview {
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

export interface UploadDraft {
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
