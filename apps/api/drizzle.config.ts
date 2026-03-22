import path from "node:path";
import { defineConfig } from "drizzle-kit";

const appDataDir = process.env.APP_DATA_DIR ?? path.resolve("../../app-data");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: path.join(appDataDir, "booklite.db")
  }
});
