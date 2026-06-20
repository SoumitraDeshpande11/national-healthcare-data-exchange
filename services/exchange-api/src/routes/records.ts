import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";
import { publishSyncEvent } from "../services/syncBus.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordRecordPublication } from "../middleware/metrics.js";
import { authorizeActivePatientAccess, canCreateRecordType } from "../services/authorization.js";

const recordSchema = z.object({
  nationalHealthId: z.string().min(6).max(64),
  recordType: z.enum(["encounter", "lab_result", "prescription", "claim", "immunization"]),
  payload: z.record(z.unknown())
});

export const recordsRouter = Router();

recordsRouter.use(requireAuth);

recordsRouter.post("/", asyncHandler(async (req, res) => {
  const body = recordSchema.parse(req.body);

  if (!canCreateRecordType(req.org, body.recordType)) {
    res.status(403).json({ error: "organization cannot create this record type" });
    return;
  }

  const patientResult = await pool.query(
    "SELECT id, consent_status FROM patients WHERE national_health_id = $1",
    [body.nationalHealthId]
  );

  if (patientResult.rowCount === 0) {
    res.status(404).json({ error: "patient not found" });
    return;
  }

  const patient = patientResult.rows[0];
  const authorization = await authorizeActivePatientAccess(patient, req.org);
  if (!authorization.allowed) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const recordResult = await pool.query(
    `INSERT INTO clinical_records (patient_id, source_org_id, record_type, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id, patient_id AS "patientId", source_org_id AS "sourceOrgId",
               record_type AS "recordType", payload, version, created_at AS "createdAt"`,
    [patient.id, req.org?.id, body.recordType, JSON.stringify(body.payload)]
  );

  const record = recordResult.rows[0];
  await pool.query(
    `INSERT INTO sync_events (record_id, patient_id, event_type, status)
     VALUES ($1, $2, $3, 'published')`,
    [record.id, patient.id, "record.created"]
  );
  await publishSyncEvent({ eventType: "record.created", recordId: record.id, patientId: patient.id });
  await writeAudit({
    actorOrgId: req.org?.id,
    action: "record.create",
    resourceType: "clinical_record",
    resourceId: record.id,
    ipAddress: req.ip,
    metadata: { recordType: body.recordType }
  });

  recordRecordPublication(body.recordType, req.org?.type);
  res.status(201).json(record);
}));

recordsRouter.get("/patient/:nationalHealthId", asyncHandler(async (req, res) => {
  const patientResult = await pool.query(
    "SELECT id, consent_status FROM patients WHERE national_health_id = $1",
    [req.params.nationalHealthId]
  );

  if (patientResult.rowCount === 0) {
    res.status(404).json({ error: "patient not found" });
    return;
  }

  const patient = patientResult.rows[0];
  const authorization = await authorizeActivePatientAccess(patient, req.org);
  if (!authorization.allowed) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const result = await pool.query(
    `SELECT r.id, r.record_type AS "recordType", r.payload, r.version,
            r.created_at AS "createdAt", o.name AS "sourceOrganization"
     FROM clinical_records r
     JOIN organizations o ON o.id = r.source_org_id
     WHERE r.patient_id = $1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [patient.id]
  );

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "record.search",
    resourceType: "clinical_record",
    resourceId: req.params.nationalHealthId,
    ipAddress: req.ip
  });

  res.json({ records: result.rows });
}));
