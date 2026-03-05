import { count } from "drizzle-orm";
import { db } from "./db/client";
import { koboUserSettings, users } from "./db/schema";
import { hashPassword } from "./auth/password";
import { nowIso } from "./utils/time";
import { randomToken } from "./utils/hash";

export const bootstrapOwnerFromEnv = async (): Promise<void> => {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) return;

  const email = process.env.BOOTSTRAP_OWNER_EMAIL;
  const username = process.env.BOOTSTRAP_OWNER_USERNAME;
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

  await db.insert(koboUserSettings).values({
    userId: owner.id,
    token: randomToken(),
    syncEnabled: 0,
    twoWayProgressSync: 0,
    markReadingThreshold: 1,
    markFinishedThreshold: 99,
    updatedAt: timestamp
  });
};
