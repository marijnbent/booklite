import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/guards";
import { fetchMetadataPreview } from "../services/metadata";
import { resolveFilenameMetadata } from "../services/filenameNormalizer";

const previewSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    author: z.string().trim().min(1).optional(),
    fileName: z.string().trim().min(1).optional()
  })
  .refine((value) => Boolean(value.title || value.fileName), {
    message: "title or fileName is required"
  });

const resolvePreviewQuery = async (input: z.infer<typeof previewSchema>) => {
  const fallback = input.fileName ? await resolveFilenameMetadata(input.fileName) : null;
  const title = input.title ?? fallback?.title;
  const author = input.author ?? fallback?.author ?? undefined;
  const series = fallback?.series ?? undefined;

  if (!title) {
    throw new Error("Unable to resolve preview title");
  }

  return {
    title,
    author,
    series
  };
};

export const metadataRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/metadata/preview",
    { preHandler: requireAuth },
    async (request) => {
      const body = previewSchema.parse(request.body);
      const query = await resolvePreviewQuery(body);
      const result = await fetchMetadataPreview(query.title, query.author);
      return {
        source: result.source,
        queryTitle: query.title,
        queryAuthor: query.author,
        querySeries: query.series,
        title: result.title,
        author: result.author,
        series: result.series,
        description: result.description,
        coverPath: result.coverPath,
        coverOptions: result.coverOptions
      };
    }
  );
};
