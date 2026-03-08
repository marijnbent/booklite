import type { FastifyReply, FastifyRequest } from "fastify";
import { getSetting } from "../db/client";
import { logAdminActivity } from "./adminActivityLog";
import { getKoboUserByToken } from "./kobo";

type KoboDebugRequest = FastifyRequest & {
  koboDebugEnabled?: boolean;
  koboDebugStartAt?: number;
  koboDebugActorUserId?: number | null;
};

const KOBO_URL_PREFIX = "/api/kobo/";
const ALLOWED_HEADER_KEYS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-type",
  "etag",
  "if-none-match",
  "location",
  "range",
  "user-agent",
  "www-authenticate"
]);

const extractKoboToken = (request: FastifyRequest): string | null => {
  const params =
    typeof request.params === "object" && request.params !== null
      ? (request.params as Record<string, unknown>)
      : null;

  if (params && typeof params.token === "string" && params.token.length > 0) {
    return params.token;
  }

  const url = request.raw.url ?? request.url;
  const match = /^\/api\/kobo\/([^/?]+)/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const maskSensitiveValue = (key: string, value: string): string => {
  const lowered = key.toLowerCase();
  if (
    lowered === "authorization" ||
    lowered.includes("token") ||
    lowered.includes("apikey") ||
    lowered.includes("api-key")
  ) {
    if (value.length <= 8) return "***";
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }
  return value;
};

const sanitizeHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const entries = Object.entries(headers)
    .filter(([key]) => ALLOWED_HEADER_KEYS.has(key.toLowerCase()) || key.toLowerCase().startsWith("x-kobo-"))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.map((item) => maskSensitiveValue(key, String(item)))];
      }
      if (typeof value === "string") {
        return [key, maskSensitiveValue(key, value)];
      }
      return [key, value ?? null];
    });

  return Object.fromEntries(entries);
};

const summarizeValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return null;
  if (depth >= 3) {
    if (Array.isArray(value)) return { type: "array", length: value.length };
    if (typeof value === "object") return { type: "object" };
    return String(value);
  }

  if (typeof value === "string") {
    return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3).map((item) => summarizeValue(item, depth + 1))
    };
  }
  if (value instanceof Uint8Array) {
    return { type: "bytes", length: value.byteLength };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, nested]) => [key, summarizeValue(nested, depth + 1)]));
  }

  return String(value);
};

const summarizePayload = (
  payload: unknown,
  contentType: string | undefined
): unknown => {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (contentType?.includes("application/json") && trimmed.length > 0) {
      try {
        return summarizeValue(JSON.parse(trimmed));
      } catch {
        return summarizeValue(trimmed);
      }
    }
    return summarizeValue(trimmed);
  }

  if (typeof payload === "object" && payload !== null && "pipe" in (payload as object)) {
    return { type: "stream" };
  }

  return summarizeValue(payload);
};

export const isKoboDebugLoggingEnabled = async (): Promise<boolean> =>
  Boolean(await getSetting<boolean>("kobo_debug_logging", false));

export const prepareKoboDebugRequest = async (request: FastifyRequest): Promise<void> => {
  const debugRequest = request as KoboDebugRequest;
  debugRequest.koboDebugEnabled = await isKoboDebugLoggingEnabled();
  if (!debugRequest.koboDebugEnabled) return;

  debugRequest.koboDebugStartAt = Date.now();
  const token = extractKoboToken(request);
  if (!token) {
    debugRequest.koboDebugActorUserId = null;
    return;
  }

  const user = await getKoboUserByToken(token);
  debugRequest.koboDebugActorUserId = user?.userId ?? null;
};

export const logKoboDebugRequest = async (request: FastifyRequest): Promise<void> => {
  const debugRequest = request as KoboDebugRequest;
  if (!debugRequest.koboDebugEnabled) return;

  await logAdminActivity({
    scope: "kobo",
    event: "kobo.debug.request",
    level: "INFO",
    message: "Kobo request received",
    actorUserId: debugRequest.koboDebugActorUserId ?? null,
    details: {
      method: request.method,
      url: request.raw.url ?? request.url,
      params: summarizeValue(request.params),
      query: summarizeValue(request.query),
      headers: sanitizeHeaders(request.headers as Record<string, unknown>),
      body: summarizePayload(request.body, request.headers["content-type"])
    }
  });
};

export const logKoboDebugResponse = async (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<void> => {
  const debugRequest = request as KoboDebugRequest;
  if (!debugRequest.koboDebugEnabled) return;

  const rawHeaders = reply.getHeaders() as Record<string, unknown>;
  await logAdminActivity({
    scope: "kobo",
    event: "kobo.debug.response",
    level: "INFO",
    message: "Kobo response sent",
    actorUserId: debugRequest.koboDebugActorUserId ?? null,
    details: {
      method: request.method,
      url: request.raw.url ?? request.url,
      statusCode: reply.statusCode,
      durationMs:
        typeof debugRequest.koboDebugStartAt === "number"
          ? Date.now() - debugRequest.koboDebugStartAt
          : null,
      headers: sanitizeHeaders(rawHeaders),
      body: summarizePayload(payload, typeof rawHeaders["content-type"] === "string" ? rawHeaders["content-type"] : undefined)
    }
  });
};

export const logKoboDebugEvent = async (input: {
  request?: FastifyRequest;
  actorUserId?: number | null;
  event: string;
  message: string;
  bookId?: number | null;
  details?: Record<string, unknown>;
}): Promise<void> => {
  const request = input.request as KoboDebugRequest | undefined;
  const enabled = request ? Boolean(request.koboDebugEnabled) : await isKoboDebugLoggingEnabled();
  if (!enabled) return;

  await logAdminActivity({
    scope: "kobo",
    event: input.event,
    level: "INFO",
    message: input.message,
    actorUserId: input.actorUserId ?? request?.koboDebugActorUserId ?? null,
    bookId: input.bookId ?? null,
    details: input.details
  });
};

export const isKoboDebugRoute = (url: string | undefined): boolean =>
  typeof url === "string" && url.startsWith(KOBO_URL_PREFIX);
