import crypto from "node:crypto";

export const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const randomToken = (): string => crypto.randomUUID();
