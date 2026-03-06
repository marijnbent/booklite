import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { koboUserSettings } from "../db/schema";
import { randomToken } from "../utils/hash";
import { nowIso } from "../utils/time";

export type ReadingStatus = "UNREAD" | "READING" | "DONE";

export type KoboThresholds = {
  markReadingThreshold: number;
  markFinishedThreshold: number;
};

export const ensureKoboSettingsRow = async (userId: number) => {
  const found = await db
    .select()
    .from(koboUserSettings)
    .where(eq(koboUserSettings.userId, userId))
    .limit(1);

  if (found[0]) return found[0];

  const [inserted] = await db
    .insert(koboUserSettings)
    .values({
      userId,
      token: randomToken(),
      syncEnabled: 0,
      twoWayProgressSync: 0,
      markReadingThreshold: 1,
      markFinishedThreshold: 99,
      updatedAt: nowIso()
    })
    .returning();

  return inserted;
};

export const getKoboThresholdsForUser = async (
  userId: number
): Promise<KoboThresholds> => {
  const settings = await ensureKoboSettingsRow(userId);
  return {
    markReadingThreshold: settings.markReadingThreshold,
    markFinishedThreshold: settings.markFinishedThreshold
  };
};

export const inferStatusFromProgress = (
  progressPercent: number,
  thresholds: KoboThresholds
): ReadingStatus => {
  if (progressPercent >= thresholds.markFinishedThreshold) return "DONE";
  if (progressPercent >= thresholds.markReadingThreshold) return "READING";
  return "UNREAD";
};
