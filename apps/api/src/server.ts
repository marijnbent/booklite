import { buildApp } from "./app";
import { config } from "./config";
import { bootstrapOwnerFromEnv } from "./bootstrap";
import { prepareDatabase } from "./db/migrate";
import { startJobRunner } from "./services/jobs";
import { registerFrontend } from "./frontend";

const main = async (): Promise<void> => {
  prepareDatabase();

  const app = buildApp();
  await registerFrontend(app);

  await bootstrapOwnerFromEnv();
  startJobRunner();

  await app.listen({
    host: config.host,
    port: config.port
  });

  app.log.info(`BookLite API listening at ${config.host}:${config.port}`);
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
