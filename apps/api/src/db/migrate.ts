import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, seedDefaultAppSettings } from "./client";

const migrationsFolder = path.resolve(__dirname, "../../drizzle");

let databasePrepared = false;

export const prepareDatabase = (): void => {
  if (databasePrepared) {
    return;
  }

  migrate(db, { migrationsFolder });
  seedDefaultAppSettings();
  databasePrepared = true;
};

if (require.main === module) {
  prepareDatabase();
}
