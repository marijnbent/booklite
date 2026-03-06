import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AuthTokens } from "@booklite/shared";

export const createTempEnv = (): { appDataDir: string; booksDir: string } => {
  const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-api-data-"));
  const booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "booklite-api-books-"));

  process.env.APP_DATA_DIR = appDataDir;
  process.env.BOOKS_DIR = booksDir;
  process.env.JWT_SECRET = "test-secret";
  process.env.PORT = "0";

  return { appDataDir, booksDir };
};

export const setupTestApp = async () => {
  const mod = await import("../src/app");
  const app = mod.buildApp();
  await app.ready();
  return app;
};

export const setupOwnerAndLogin = async (
  app: Awaited<ReturnType<(typeof import("../src/app"))["buildApp"]>>,
  email = "owner@test.com",
  username = "owner"
): Promise<AuthTokens> => {
  await app.inject({
    method: "POST",
    url: "/api/v1/setup",
    payload: {
      email,
      username,
      password: "secret123"
    }
  });

  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      usernameOrEmail: username,
      password: "secret123"
    }
  });

  return res.json() as AuthTokens;
};
