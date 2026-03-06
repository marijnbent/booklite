import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { config } from "./config";
import { healthRoutes } from "./routes/health";
import { setupRoutes } from "./routes/setup";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { uploadRoutes } from "./routes/uploads";
import { importJobRoutes } from "./routes/importJobs";
import { booksRoutes } from "./routes/books";
import { collectionsRoutes } from "./routes/collections";
import { koboSettingsRoutes } from "./routes/koboSettings";
import { koboDeviceRoutes } from "./routes/koboDevice";
import { appSettingsRoutes } from "./routes/appSettings";
import { metadataRoutes } from "./routes/metadata";

export const buildApp = () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  app.register(sensible);
  app.register(cors, {
    origin: true,
    credentials: true
  });
  app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute"
  });
  app.register(multipart, {
    limits: {
      fileSize: config.uploadLimitMb * 1024 * 1024,
      files: 100
    }
  });

  app.register(healthRoutes);
  app.register(setupRoutes);
  app.register(authRoutes);
  app.register(usersRoutes);
  app.register(appSettingsRoutes);
  app.register(metadataRoutes);
  app.register(uploadRoutes);
  app.register(importJobRoutes);
  app.register(booksRoutes);
  app.register(collectionsRoutes);
  app.register(koboSettingsRoutes);
  app.register(koboDeviceRoutes);

  return app;
};
