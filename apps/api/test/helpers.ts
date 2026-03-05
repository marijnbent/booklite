import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const createTempEnv = (): { appDataDir: string; booksDir: string } => {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-api-data-"));
  const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-api-books-"));

  process.env.APP_DATA_DIR = appDataDir;
  process.env.BOOKS_DIR = booksDir;
  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  return { appDataDir, booksDir };
};
