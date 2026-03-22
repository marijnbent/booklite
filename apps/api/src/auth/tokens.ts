import { refreshTokens } from "../db/schema";
import { db } from "../db/client";
import { config } from "../config";
import { randomToken, sha256 } from "../utils/hash";
import { nowIso } from "../utils/time";
import { signAccessToken } from "./jwt";

export const issueTokens = async (input: {
  userId: number;
  username: string;
  role: "OWNER" | "MEMBER";
}) => {
  const accessToken = signAccessToken({
    userId: input.userId,
    role: input.role,
    username: input.username
  });
  const refreshToken = randomToken();
  const timestamp = nowIso();
  const expiresAt = new Date(
    Date.now() + config.refreshTokenTtlSeconds * 1000
  ).toISOString();

  await db.insert(refreshTokens).values({
    userId: input.userId,
    tokenHash: sha256(refreshToken),
    createdAt: timestamp,
    expiresAt,
    revokedAt: null
  });

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: config.accessTokenTtlSeconds
  };
};
