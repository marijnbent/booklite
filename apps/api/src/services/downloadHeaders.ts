import type { FastifyReply } from "fastify";

const NON_ASCII_PATTERN = /[^\x00-\x7F]/g;

export const buildAttachmentContentDisposition = (filename: string): string => {
  const encodedFilename = encodeURIComponent(filename).replace(/\+/g, "%20");
  const fallbackFilename = filename.replace(NON_ASCII_PATTERN, "_");
  return `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
};

export const applyDownloadHeaders = (
  reply: FastifyReply,
  filename: string,
  size: number
): FastifyReply =>
  reply
    .header("content-type", "application/octet-stream")
    .header("content-length", String(size))
    .header("content-disposition", buildAttachmentContentDisposition(filename))
    .header("cache-control", "no-cache, no-store, must-revalidate")
    .header("pragma", "no-cache")
    .header("expires", "0");
