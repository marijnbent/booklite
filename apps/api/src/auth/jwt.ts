import jwt from "jsonwebtoken";
import { config } from "../config";

export interface AccessPayload {
  userId: number;
  role: "OWNER" | "MEMBER";
  username: string;
}

export const signAccessToken = (
  payload: AccessPayload,
  options?: { expiresInSeconds?: number }
): string =>
  jwt.sign(payload, config.jwtSecret, {
    expiresIn: options?.expiresInSeconds ?? config.accessTokenTtlSeconds
  });

export const verifyAccessToken = (token: string): AccessPayload =>
  jwt.verify(token, config.jwtSecret) as AccessPayload;
