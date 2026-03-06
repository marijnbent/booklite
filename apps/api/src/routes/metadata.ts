import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/guards";
import { fetchMetadataPreview } from "../services/metadata";

const previewSchema = z.object({
  title: z.string().trim().min(1),
  author: z.string().trim().min(1).optional()
});

export const metadataRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/api/v1/metadata/preview",
    { preHandler: requireAuth },
    async (request) => {
      const body = previewSchema.parse(request.body);
      const result = await fetchMetadataPreview(body.title, body.author);
      return {
        source: result.source,
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
