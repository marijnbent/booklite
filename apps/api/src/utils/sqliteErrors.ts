type SqliteConstraintError = Error & {
  code?: string;
};

const SQLITE_CONSTRAINT_CODES = new Set([
  "SQLITE_CONSTRAINT",
  "SQLITE_CONSTRAINT_UNIQUE",
]);

export const getSqliteUniqueConstraintColumns = (error: unknown): string[] => {
  if (!(error instanceof Error)) return [];

  const code = (error as SqliteConstraintError).code;
  if (!code || !SQLITE_CONSTRAINT_CODES.has(code)) {
    return [];
  }

  const match = error.message.match(/UNIQUE constraint failed: (.+)$/i);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};
