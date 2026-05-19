import { sql } from "drizzle-orm";
import { db, getSetting } from "../db/client";
import { config } from "../config";
import {
  defaultMetadataProviderEnabled,
  toMetadataProviderEnabled
} from "../utils/metadataProviders";
import {
  listAdminActivity,
  type AdminActivityLevel,
  type AdminActivityScope
} from "./adminActivityLog";
import { nowIso } from "../utils/time";

type DiagnosticsUserRow = {
  id: number;
  email: string | null;
  username: string;
  role: "OWNER" | "MEMBER";
  created_at: string;
  disabled_at: string | null;
  owned_book_count: number;
  shared_in_count: number;
  shared_out_count: number;
  collection_count: number;
  progress_count: number;
  reading_count: number;
  read_count: number;
  queued_job_count: number;
  processing_job_count: number;
  completed_job_count: number;
  failed_job_count: number;
  kobo_sync_enabled: number | null;
  kobo_sync_all_books: number | null;
  kobo_two_way_progress_sync: number | null;
  kobo_sync_collection_count: number;
  kobo_reading_state_count: number;
  kobo_pending_redelivery_count: number;
  kobo_snapshot_count: number;
};

const hasConfiguredValue = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const getDiagnosticsSettings = async () => ({
  metadataProviderEnabled: toMetadataProviderEnabled(
    await getSetting<unknown>("metadata_provider_enabled", defaultMetadataProviderEnabled),
    defaultMetadataProviderEnabled
  ),
  metadataAmazonDomain: await getSetting<string>(
    "metadata_amazon_domain",
    config.amazonBooksDomain
  ),
  metadataAmazonCookieConfigured: hasConfiguredValue(
    await getSetting<string>("metadata_amazon_cookie", config.amazonBooksCookie)
  ),
  metadataGoogleLanguage: await getSetting<string>(
    "metadata_google_language",
    config.googleBooksLanguage
  ),
  metadataGoogleApiKeyConfigured: hasConfiguredValue(
    await getSetting<string>("metadata_google_api_key", config.googleBooksApiKey)
  ),
  metadataHardcoverApiKeyConfigured: hasConfiguredValue(
    await getSetting<string>("metadata_hardcover_api_key", config.hardcoverApiKey)
  ),
  metadataOpenrouterEnabled: await getSetting<boolean>(
    "metadata_openrouter_enabled",
    false
  ),
  metadataOpenrouterModel: await getSetting<string>("metadata_openrouter_model", ""),
  metadataOpenrouterApiKeyConfigured: hasConfiguredValue(
    await getSetting<string>("metadata_openrouter_api_key", config.openrouterApiKey ?? "")
  ),
  koboDebugLogging: await getSetting<boolean>("kobo_debug_logging", false),
  uploadLimitMb: await getSetting<number>("upload_limit_mb", config.uploadLimitMb),
  ebookDownloadUrlConfigured: hasConfiguredValue(
    await getSetting<string>("ebook_download_url", "")
  )
});

const getDiagnosticsUsers = async () => {
  const rows = await db.all<DiagnosticsUserRow>(sql`
    SELECT
      u.id,
      u.email,
      u.username,
      u.role,
      u.created_at,
      u.disabled_at,
      (SELECT COUNT(*) FROM books b WHERE b.owner_user_id = u.id) AS owned_book_count,
      (
        SELECT COUNT(*)
        FROM book_shares bs
        WHERE bs.recipient_user_id = u.id
          AND bs.removed_at IS NULL
      ) AS shared_in_count,
      (
        SELECT COUNT(*)
        FROM book_shares bs
        WHERE bs.owner_user_id = u.id
          AND bs.removed_at IS NULL
      ) AS shared_out_count,
      (SELECT COUNT(*) FROM collections c WHERE c.user_id = u.id) AS collection_count,
      (SELECT COUNT(*) FROM book_progress bp WHERE bp.user_id = u.id) AS progress_count,
      (
        SELECT COUNT(*)
        FROM book_progress bp
        WHERE bp.user_id = u.id
          AND bp.status = 'READING'
      ) AS reading_count,
      (
        SELECT COUNT(*)
        FROM book_progress bp
        WHERE bp.user_id = u.id
          AND bp.status = 'READ'
      ) AS read_count,
      (
        SELECT COUNT(*)
        FROM import_jobs ij
        WHERE ij.user_id = u.id
          AND ij.status = 'QUEUED'
      ) AS queued_job_count,
      (
        SELECT COUNT(*)
        FROM import_jobs ij
        WHERE ij.user_id = u.id
          AND ij.status = 'PROCESSING'
      ) AS processing_job_count,
      (
        SELECT COUNT(*)
        FROM import_jobs ij
        WHERE ij.user_id = u.id
          AND ij.status = 'COMPLETED'
      ) AS completed_job_count,
      (
        SELECT COUNT(*)
        FROM import_jobs ij
        WHERE ij.user_id = u.id
          AND ij.status = 'FAILED'
      ) AS failed_job_count,
      kus.sync_enabled AS kobo_sync_enabled,
      kus.sync_all_books AS kobo_sync_all_books,
      kus.two_way_progress_sync AS kobo_two_way_progress_sync,
      (
        SELECT COUNT(*)
        FROM kobo_sync_collections ksc
        WHERE ksc.user_id = u.id
      ) AS kobo_sync_collection_count,
      (
        SELECT COUNT(*)
        FROM kobo_reading_state krs
        WHERE krs.user_id = u.id
      ) AS kobo_reading_state_count,
      (
        SELECT COUNT(*)
        FROM kobo_pending_redeliveries kpr
        WHERE kpr.user_id = u.id
      ) AS kobo_pending_redelivery_count,
      (
        SELECT COUNT(*)
        FROM kobo_sync_snapshots kss
        WHERE kss.user_id = u.id
      ) AS kobo_snapshot_count
    FROM users u
    LEFT JOIN kobo_user_settings kus ON kus.user_id = u.id
    ORDER BY u.id
  `);

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
    library: {
      ownedBookCount: Number(row.owned_book_count),
      sharedInCount: Number(row.shared_in_count),
      sharedOutCount: Number(row.shared_out_count),
      collectionCount: Number(row.collection_count),
      progressCount: Number(row.progress_count),
      readingCount: Number(row.reading_count),
      readCount: Number(row.read_count)
    },
    importJobs: {
      queued: Number(row.queued_job_count),
      processing: Number(row.processing_job_count),
      completed: Number(row.completed_job_count),
      failed: Number(row.failed_job_count)
    },
    kobo: {
      settingsCreated: row.kobo_sync_enabled !== null,
      syncEnabled: row.kobo_sync_enabled === 1,
      syncAllBooks: row.kobo_sync_all_books === 1,
      twoWayProgressSync: row.kobo_two_way_progress_sync === 1,
      syncCollectionCount: Number(row.kobo_sync_collection_count),
      readingStateCount: Number(row.kobo_reading_state_count),
      pendingRedeliveryCount: Number(row.kobo_pending_redelivery_count),
      snapshotCount: Number(row.kobo_snapshot_count)
    }
  }));
};

export const getAdminDiagnostics = async (options: {
  scope?: AdminActivityScope;
  level?: AdminActivityLevel;
  limit?: number;
}) => {
  const [settings, users, activityLog] = await Promise.all([
    getDiagnosticsSettings(),
    getDiagnosticsUsers(),
    listAdminActivity(options)
  ]);

  return {
    generatedAt: nowIso(),
    settings,
    users,
    activityLog
  };
};
