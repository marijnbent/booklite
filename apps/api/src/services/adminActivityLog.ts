import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { adminActivityLog } from "../db/schema";
import { nowIso } from "../utils/time";

export type AdminActivityScope = "metadata" | "upload" | "kobo";
export type AdminActivityLevel = "ERROR" | "WARN" | "INFO";

const MAX_LOG_ENTRIES = 1000;
const MAX_STRING_LENGTH = 600;
const MAX_STACK_LENGTH = 2000;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 25;
const MAX_DEPTH = 4;

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

type AdminActivityDetails = Record<string, unknown> | undefined;

const truncate = (value: string, maxLength = MAX_STRING_LENGTH): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

const normalizeValue = (value: unknown, depth = 0): SerializableValue => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack, MAX_STACK_LENGTH) : null
    };
  }

  if (depth >= MAX_DEPTH) {
    return truncate(String(value));
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => normalizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, normalizeValue(nested, depth + 1)])
    );
  }

  return truncate(String(value));
};

const normalizeDetails = (details: AdminActivityDetails): string | null => {
  if (!details) return null;
  return JSON.stringify(normalizeValue(details));
};

const parseDetails = (value: string | null): SerializableValue | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as SerializableValue;
  } catch {
    return { parseError: "Invalid details JSON" };
  }
};

const pruneAdminActivityLog = (): void => {
  db.run(sql`
    DELETE FROM admin_activity_log
    WHERE id NOT IN (
      SELECT id
      FROM admin_activity_log
      ORDER BY created_at DESC, id DESC
      LIMIT ${MAX_LOG_ENTRIES}
    )
  `);
};

export const logAdminActivity = async (input: {
  scope: AdminActivityScope;
  event: string;
  message: string;
  level?: AdminActivityLevel;
  details?: AdminActivityDetails;
  actorUserId?: number | null;
  targetUserId?: number | null;
  bookId?: number | null;
  jobId?: string | null;
}): Promise<void> => {
  try {
    await db.insert(adminActivityLog).values({
      scope: input.scope,
      event: input.event,
      level: input.level ?? "ERROR",
      message: input.message,
      detailsJson: normalizeDetails(input.details),
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      bookId: input.bookId ?? null,
      jobId: input.jobId ?? null,
      createdAt: nowIso()
    });

    pruneAdminActivityLog();
  } catch {
    // Operational logging should never break the primary request path.
  }
};

export const listAdminActivity = async (options: {
  scope?: AdminActivityScope;
  level?: AdminActivityLevel;
  limit?: number;
}) => {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 250);
  const whereClause =
    options.scope && options.level
      ? and(eq(adminActivityLog.scope, options.scope), eq(adminActivityLog.level, options.level))
      : options.scope
        ? eq(adminActivityLog.scope, options.scope)
        : options.level
          ? eq(adminActivityLog.level, options.level)
          : undefined;

  const rows = whereClause
    ? await db
        .select()
        .from(adminActivityLog)
        .where(whereClause)
        .orderBy(desc(adminActivityLog.createdAt), desc(adminActivityLog.id))
        .limit(limit)
    : await db
        .select()
        .from(adminActivityLog)
        .orderBy(desc(adminActivityLog.createdAt), desc(adminActivityLog.id))
        .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    event: row.event,
    level: row.level,
    message: row.message,
    details: parseDetails(row.detailsJson),
    actorUserId: row.actorUserId,
    targetUserId: row.targetUserId,
    bookId: row.bookId,
    jobId: row.jobId,
    createdAt: row.createdAt
  }));
};

export const clearAdminActivity = async (options?: {
  scope?: AdminActivityScope;
}): Promise<number> => {
  const rows = options?.scope
    ? await db
        .delete(adminActivityLog)
        .where(eq(adminActivityLog.scope, options.scope))
        .returning({ id: adminActivityLog.id })
    : await db.delete(adminActivityLog).returning({ id: adminActivityLog.id });

  return rows.length;
};
