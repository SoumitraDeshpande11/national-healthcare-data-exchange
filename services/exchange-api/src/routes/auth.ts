import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { authenticateApiKey, issueToken } from "../services/auth.js";
import { writeAudit } from "../services/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordAuthFailure } from "../middleware/metrics.js";

const loginSchema = z.object({
  apiKey: z.string().min(12)
});

export const authRouter = Router();

authRouter.post("/token", asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const org = await authenticateApiKey(body.apiKey);

  if (!org) {
    recordAuthFailure("api_key", "invalid_api_key");
    res.status(401).json({ error: "invalid api key" });
    return;
  }

  await writeAudit({
    actorOrgId: org.id,
    action: "token.issue",
    resourceType: "organization",
    resourceId: org.id,
    ipAddress: req.ip
  });

  res.json({
    tokenType: "Bearer",
    expiresInSeconds: 3600,
    accessToken: issueToken(org)
  });
}));

authRouter.get("/organizations", requireAuth, asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT id, name, type
     FROM organizations
     ORDER BY CASE type
       WHEN 'agency' THEN 1
       WHEN 'hospital' THEN 2
       WHEN 'laboratory' THEN 3
       WHEN 'pharmacy' THEN 4
       WHEN 'insurer' THEN 5
       ELSE 6
     END, name`
  );

  res.json({ organizations: result.rows });
}));
