import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireOrgTypes } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const complianceRouter = Router();

complianceRouter.use(requireAuth, requireOrgTypes(["agency"]));

complianceRouter.get("/audit-events", asyncHandler(async (_req, res) => {
  const result = await pool.query(
    `SELECT id, actor_org_id AS "actorOrgId", action, resource_type AS "resourceType",
            resource_id AS "resourceId", ip_address AS "ipAddress",
            metadata, created_at AS "createdAt"
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT 500`
  );

  res.json({ auditEvents: result.rows });
}));

complianceRouter.get("/summary", asyncHandler(async (_req, res) => {
  const [patients, records, audits, events] = await Promise.all([
    pool.query("SELECT count(*)::int AS count FROM patients"),
    pool.query("SELECT count(*)::int AS count FROM clinical_records"),
    pool.query("SELECT count(*)::int AS count FROM audit_logs"),
    pool.query("SELECT status, count(*)::int AS count FROM sync_events GROUP BY status")
  ]);

  res.json({
    patients: patients.rows[0].count,
    records: records.rows[0].count,
    auditEvents: audits.rows[0].count,
    syncEvents: events.rows
  });
}));
