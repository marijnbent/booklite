export type Role = "OWNER" | "MEMBER";

export type ReadStatus = "UNREAD" | "READING" | "DONE";

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
  twoWayProgressSync: boolean;
  markReadingThreshold: number;
  markFinishedThreshold: number;
  syncCollectionIds: number[];
}

export interface AppSettings {
  metadataProviderPrimary:
    | "open_library"
    | "amazon"
    | "google"
    | "hardcover"
    | "goodreads"
    | "douban"
    | "none";
  metadataProviderSecondary:
    | "open_library"
    | "amazon"
    | "google"
    | "hardcover"
    | "goodreads"
    | "douban"
    | "none";
  metadataProviderTertiary:
    | "open_library"
    | "amazon"
    | "google"
    | "hardcover"
    | "goodreads"
    | "douban"
    | "none";
  metadataAmazonDomain: "com" | "co.uk" | "de" | "fr" | "es" | "it" | "nl" | "ca" | "com.au";
  metadataAmazonCookie: string;
  metadataGoogleLanguage: string;
  metadataGoogleApiKey: string;
  metadataHardcoverApiKey: string;
  metadataProviderFallback?: "google" | "none";
  uploadLimitMb: number;
}
