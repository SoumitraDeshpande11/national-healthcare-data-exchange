import fs from "node:fs/promises";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { indexOperationalLog } from "./elasticLogger.js";

export type AuditEvent = {
  actorOrgId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(event: AuditEvent) {
  await pool.query(
    `INSERT INTO audit_logs (actor_org_id, action, resource_type, resource_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.actorOrgId ?? null,
      event.action,
      event.resourceType,
      event.resourceId ?? null,
      event.ipAddress ?? null,
      JSON.stringify(event.metadata ?? {})
    ]
  );

  await fs.appendFile(
    env.AUDIT_LOG_PATH,
    `${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n`
  );

  void indexOperationalLog({
    event: event.action,
    actorOrgId: event.actorOrgId ?? null,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata
  });
}
