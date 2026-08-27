import path from "node:path";

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const INSECURE_JWT_SECRETS = new Set([
  "booklite-dev-secret-change-me",
  "change-me-booklite"
]);

const resolveJwtSecret = (): string => {
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (!jwtSecret) {
    throw new Error("JWT_SECRET is required");
  }

  if (INSECURE_JWT_SECRETS.has(jwtSecret)) {
    throw new Error("JWT_SECRET must be changed from the default/example value");
  }

  return jwtSecret;
};

export const config = {
  port: toInt(process.env.PORT, 6060),
  host: process.env.HOST ?? "0.0.0.0",
  baseUrl: process.env.BASE_URL ?? `http://localhost:${toInt(process.env.PORT, 6060)}`,
  appDataDir: process.env.APP_DATA_DIR ?? path.join(process.cwd(), "app-data"),
  booksDir: process.env.BOOKS_DIR ?? path.join(process.cwd(), "books"),
  webDistDir: process.env.WEB_DIST_DIR ?? path.join(process.cwd(), "apps/web/dist"),
  frontendMode: process.env.BOOKLITE_FRONTEND_MODE ?? "auto",
  jwtSecret: resolveJwtSecret(),
  accessTokenTtlSeconds: toInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 3600),
  refreshTokenTtlSeconds: toInt(process.env.REFRESH_TOKEN_TTL_SECONDS, 7776000),
  uploadLimitMb: toInt(process.env.UPLOAD_LIMIT_MB, 100),
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY ?? "",
  googleBooksLanguage: process.env.GOOGLE_BOOKS_LANGUAGE ?? "",
  hardcoverApiKey: process.env.HARDCOVER_API_KEY ?? "",
  openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  amazonBooksDomain: process.env.AMAZON_BOOKS_DOMAIN ?? "com",
  amazonBooksCookie: process.env.AMAZON_BOOKS_COOKIE ?? ""
};

export const dbFilePath = path.join(config.appDataDir, "booklite.db");
