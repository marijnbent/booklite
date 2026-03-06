import { count } from "drizzle-orm";
import { db } from "./db/client";
import { users } from "./db/schema";
import { hashPassword } from "./auth/password";
import { nowIso } from "./utils/time";
import { ensureKoboSettingsRow } from "./services/koboSettings";
import {
  ensureSystemCollectionsForAllUsers,
  ensureSystemCollectionsForUser
} from "./services/systemCollections";

export const bootstrapOwnerFromEnv = async (): Promise<void> => {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) {
    await ensureSystemCollectionsForAllUsers();
    return;
  }

  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const username = process.env.BOOTSTRAP_OWNER_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (!email || !username || !password) return;

  const timestamp = nowIso();
  const [owner] = await db
    .insert(users)
    .values({
      email,
      username,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      createdAt: timestamp,
      disabledAt: null
    })
    .returning({ id: users.id });

  await ensureKoboSettingsRow(owner.id);

  await ensureSystemCollectionsForUser(owner.id, {
    preselectFavoritesForKobo: true
  });
};
