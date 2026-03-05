import path from "node:path";

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: toInt(process.env.PORT, 6060),
  host: process.env.HOST ?? "0.0.0.0",
  baseUrl: process.env.BASE_URL ?? `http://localhost:${toInt(process.env.PORT, 6060)}`,
  appDataDir: process.env.APP_DATA_DIR ?? path.join(process.cwd(), "app-data"),
  booksDir: process.env.BOOKS_DIR ?? path.join(process.cwd(), "books"),
  webDistDir: process.env.WEB_DIST_DIR ?? path.join(process.cwd(), "apps/web/dist"),
  jwtSecret: process.env.JWT_SECRET ?? "booklite-dev-secret-change-me",
  accessTokenTtlSeconds: toInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 900),
  refreshTokenTtlSeconds: toInt(process.env.REFRESH_TOKEN_TTL_SECONDS, 604800),
  uploadLimitMb: toInt(process.env.UPLOAD_LIMIT_MB, 100),
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY ?? ""
};

export const dbFilePath = path.join(config.appDataDir, "booklite.db");
