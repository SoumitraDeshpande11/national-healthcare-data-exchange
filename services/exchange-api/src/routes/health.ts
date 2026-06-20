import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get("/live", (_req, res) => {
  res.json({ status: "live" });
});

healthRouter.get("/ready", asyncHandler(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ready" });
}));
