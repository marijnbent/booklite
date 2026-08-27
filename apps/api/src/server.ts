import { buildApp } from "./app";
import { config } from "./config";
import { bootstrapOwnerFromEnv } from "./bootstrap";
import { prepareDatabase } from "./db/migrate";
import { startJobRunner, stopJobRunner } from "./services/jobs";
import { registerFrontend } from "./frontend";
import { closeDatabase } from "./db/client";

const main = async (): Promise<void> => {
  prepareDatabase();

  const app = buildApp();
  await registerFrontend(app);

  await bootstrapOwnerFromEnv();
  await startJobRunner();

  await app.listen({
    host: config.host,
    port: config.port
  });

  app.log.info(`BookLite API listening at ${config.host}:${config.port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Stopping BookLite");
    await stopJobRunner();
    await app.close();
    closeDatabase();
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
