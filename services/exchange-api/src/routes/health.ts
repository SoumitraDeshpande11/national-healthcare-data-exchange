import { Router } from "express";
import { pool } from "../db/pool.js";
import { checkObjectStorage } from "../services/objectStorage.js";
import { checkSyncBus } from "../services/syncBus.js";

export const healthRouter = Router();

healthRouter.get("/live", (_req, res) => {
  res.json({ status: "live" });
});

healthRouter.get("/ready", async (_req, res) => {
  const checks = await Promise.allSettled([
    pool.query("SELECT 1"),
    checkSyncBus(),
    checkObjectStorage()
  ]);

  const dependencies = {
    postgres: statusFor(checks[0]),
    redis: statusFor(checks[1]),
    minio: statusFor(checks[2])
  };
  const ready = Object.values(dependencies).every((status) => status === "ready");

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    dependencies
  });
});

function statusFor(result: PromiseSettledResult<unknown>) {
  return result.status === "fulfilled" ? "ready" : "unavailable";
}
