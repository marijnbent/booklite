export type Role = "OWNER" | "MEMBER";

export const READ_STATUSES = [
  "UNSET",
  "UNREAD",
  "READING",
  "RE_READING",
  "READ",
  "PARTIALLY_READ",
  "PAUSED",
  "ABANDONED",
  "WONT_READ"
] as const;

export type ReadStatus = (typeof READ_STATUSES)[number];

export interface ApiUser {
  id: number;
  email: string;
  username: string;
  role: Role;
  disabledAt: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface BookItem {
  id: number;
  ownerUserId: number;
  title: string;
  author: string | null;
  series: string | null;
  description: string | null;
  coverPath: string | null;
  filePath: string;
  fileExt: string;
  fileSize: number;
  koboSyncable: number;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  progress?: {
    status: ReadStatus;
    progressPercent: number;
    positionRef: string | null;
    updatedAt: string;
  } | null;
}

export interface CollectionItem {
  id: number;
  userId: number;
  name: string;
  icon: string | null;
  slug?: string | null;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
  bookCount?: number;
}

export interface KoboSettings {
  token: string;
  syncEnabled: boolean;
  syncAllBooks: boolean;
  twoWayProgressSync: boolean;
  markReadingThreshold: number;
  markFinishedThreshold: number;
  syncCollectionIds: number[];
}

export type MetadataProvider =
  | "open_library"
  | "amazon"
  | "bol"
  | "google"
  | "hardcover"
  | "goodreads"
  | "douban"
  | "none";

export type MetadataSource =
  | "OPEN_LIBRARY"
  | "AMAZON"
  | "BOL"
  | "GOOGLE"
  | "HARDCOVER"
  | "GOODREADS"
  | "DOUBAN"
  | "NONE";

export interface MetadataCoverOption {
  coverPath: string;
  source: Exclude<MetadataSource, "NONE">;
}

export interface MetadataResult {
  title?: string;
  author?: string;
  series?: string;
  description?: string;
  coverPath?: string;
  source: MetadataSource;
}

export interface MetadataPreviewResult extends MetadataResult {
  coverOptions: MetadataCoverOption[];
}

export interface MetadataProviderEnabled {
  open_library: boolean;
  amazon: boolean;
  bol: boolean;
  google: boolean;
  hardcover: boolean;
  goodreads: boolean;
  douban: boolean;
}

export interface AppSettings {
  metadataProviderEnabled: MetadataProviderEnabled;
  metadataAmazonDomain: "com" | "co.uk" | "de" | "fr" | "es" | "it" | "nl" | "ca" | "com.au";
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  koboDebugLogging: boolean;
  uploadLimitMb: number;
}

export type AdminActivityScope = "metadata" | "upload" | "kobo";

export type AdminActivityLevel = "ERROR" | "WARN" | "INFO";

export interface AdminActivityItem {
  id: number;
  scope: AdminActivityScope;
  event: string;
  level: AdminActivityLevel;
  message: string;
  details: unknown;
  actorUserId: number | null;
  targetUserId: number | null;
  bookId: number | null;
  jobId: string | null;
  createdAt: string;
}
