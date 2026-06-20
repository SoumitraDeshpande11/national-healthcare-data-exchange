import { createClient } from "redis";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { logger } from "./utils/logger.js";

type SyncMessage = {
  syncEventId?: string;
  eventType?: string;
};

const subscriber = createClient({ url: env.REDIS_URL });

subscriber.on("error", (error) => {
  logger.error({ error }, "sync worker redis error");
});

async function markPublished(message: SyncMessage) {
  if (!message.syncEventId) {
    logger.warn({ message }, "sync message missing syncEventId");
    return;
  }

  await pool.query(
    `UPDATE sync_events
     SET status = 'published'
     WHERE id = $1`,
    [message.syncEventId]
  );

  logger.info({
    syncEventId: message.syncEventId,
    eventType: message.eventType
  }, "sync event published to subscribers");
}

async function start() {
  await subscriber.connect();
  await subscriber.subscribe("patient-record-sync", async (payload) => {
    try {
      await markPublished(JSON.parse(payload) as SyncMessage);
    } catch (error) {
      logger.error({ error, payload }, "sync worker failed to process message");
    }
  });

  logger.info("healthcare sync worker subscribed to patient-record-sync");
}

async function shutdown() {
  await subscriber.quit();
  await pool.end();
}

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

start().catch((error) => {
  logger.error({ error }, "sync worker startup failed");
  process.exit(1);
});
