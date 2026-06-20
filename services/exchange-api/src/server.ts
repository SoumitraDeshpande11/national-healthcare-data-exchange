import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { migrate } from "./db/migrate.js";
import { closePool } from "./db/pool.js";
import { connectSyncBus, closeSyncBus } from "./services/syncBus.js";
import { logger } from "./utils/logger.js";

async function main() {
  await migrate();
  await connectSyncBus();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "healthcare data exchange API listening");
  });

  const shutdown = async () => {
    logger.info("shutting down");
    server.close(async () => {
      await closeSyncBus();
      await closePool();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error({ error }, "startup failed");
  process.exit(1);
});
