import { createClient } from "redis";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const redis = createClient({ url: env.REDIS_URL });

redis.on("error", (error) => logger.error({ error }, "redis error"));

export async function connectSyncBus() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

export async function publishSyncEvent(event: Record<string, unknown>) {
  if (!redis.isOpen) {
    await connectSyncBus();
  }
  await redis.publish("patient-record-sync", JSON.stringify(event));
}

export async function checkSyncBus() {
  if (!redis.isOpen) {
    await connectSyncBus();
  }
  await redis.ping();
}

export async function closeSyncBus() {
  if (redis.isOpen) {
    await redis.quit();
  }
}
