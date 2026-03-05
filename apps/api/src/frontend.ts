import fs from "node:fs";
import path from "node:path";
import middie from "@fastify/middie";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { config } from "./config";

type FrontendMode = "vite" | "static" | "off";

const workspaceRoot = path.resolve(__dirname, "../../..");
const webRootDir = path.join(workspaceRoot, "apps/web");
const webIndexPath = path.join(webRootDir, "index.html");

const getPathname = (requestUrl: string): string => requestUrl.split("?")[0];

const resolveFrontendMode = (rawMode: string): FrontendMode => {
  const mode = rawMode.toLowerCase();
  if (mode === "auto") {
    return process.env.NODE_ENV === "production" ? "static" : "vite";
  }
  if (mode === "vite" || mode === "static" || mode === "off") {
    return mode;
  }
  return process.env.NODE_ENV === "production" ? "static" : "vite";
};

const registerStaticFrontend = async (app: FastifyInstance): Promise<void> => {
  if (!fs.existsSync(config.webDistDir)) {
    app.log.warn(`Skipping static frontend mount: dist directory not found at ${config.webDistDir}`);
    return;
  }

  app.register(fastifyStatic, {
    root: config.webDistDir,
    prefix: "/"
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = getPathname(request.url);
    if (pathname.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }

    const indexPath = path.join(config.webDistDir, "index.html");
    if (!fs.existsSync(indexPath)) {
      return reply.code(404).send({ error: "Not found" });
    }

    return reply.type("text/html").send(fs.createReadStream(indexPath));
  });
};

const registerViteFrontend = async (app: FastifyInstance): Promise<void> => {
  await app.register(middie);

  process.env.BOOKLITE_FRONTEND_EMBEDDED = "1";
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(webRootDir, "vite.config.ts"),
    root: webRootDir,
    appType: "custom",
    server: {
      middlewareMode: true,
      proxy: {},
      hmr: {
        server: app.server
      }
    }
  });

  app.use(vite.middlewares);
  app.addHook("onClose", async () => {
    await vite.close();
  });

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = getPathname(request.url);
    if (pathname.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }

    if (!fs.existsSync(webIndexPath)) {
      return reply.code(404).send({ error: "Not found" });
    }

    try {
      const template = await fs.promises.readFile(webIndexPath, "utf8");
      const html = await vite.transformIndexHtml(pathname, template);
      return reply.type("text/html").send(html);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      app.log.error(error);
      return reply.code(500).send({ error: "Failed to render app" });
    }
  });
};

export const registerFrontend = async (app: FastifyInstance): Promise<void> => {
  const frontendMode = resolveFrontendMode(config.frontendMode);
  app.log.info({ frontendMode }, "Registering frontend runtime");

  if (frontendMode === "off") {
    return;
  }

  if (frontendMode === "static") {
    await registerStaticFrontend(app);
    return;
  }

  await registerViteFrontend(app);
};
