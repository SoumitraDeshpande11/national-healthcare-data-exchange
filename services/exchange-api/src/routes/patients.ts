import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth, requireOrgTypes } from "../middleware/auth.js";
import { writeAudit } from "../services/audit.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordPatientRegistration } from "../middleware/metrics.js";
import { authorizeActivePatientAccess, grantPatientAccess, hasPatientAccess } from "../services/authorization.js";

const patientSchema = z.object({
  nationalHealthId: z.string().min(6).max(64),
  fullName: z.string().min(2).max(200),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  consentStatus: z.enum(["active", "revoked"]).default("active")
});

const accessGrantSchema = z.object({
  organizationId: z.string().min(1)
});

async function findPatientForAccess(nationalHealthId: string) {
  const result = await pool.query(
    "SELECT id, consent_status FROM patients WHERE national_health_id = $1",
    [nationalHealthId]
  );

  return result.rows[0] ?? null;
}

export const patientsRouter = Router();

patientsRouter.use(requireAuth);

patientsRouter.post("/", requireOrgTypes(["hospital", "agency"]), asyncHandler(async (req, res) => {
  const body = patientSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO patients (national_health_id, full_name, date_of_birth, consent_status)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (national_health_id)
     DO UPDATE SET full_name = EXCLUDED.full_name,
                   date_of_birth = EXCLUDED.date_of_birth,
                   consent_status = EXCLUDED.consent_status,
                   updated_at = now()
     RETURNING id, national_health_id AS "nationalHealthId", full_name AS "fullName",
               date_of_birth AS "dateOfBirth", consent_status AS "consentStatus"`,
    [body.nationalHealthId, body.fullName, body.dateOfBirth, body.consentStatus]
  );

  const patient = result.rows[0];
  await grantPatientAccess({
    patientId: patient.id,
    orgId: req.org!.id,
    grantedByOrgId: req.org!.id
  });

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "patient.upsert",
    resourceType: "patient",
    resourceId: patient.id,
    ipAddress: req.ip
  });

  recordPatientRegistration(req.org?.type, patient.consentStatus);
  res.status(201).json(patient);
}));

patientsRouter.post("/:nationalHealthId/access-grants", requireOrgTypes(["hospital", "agency"]), asyncHandler(async (req, res) => {
  const body = accessGrantSchema.parse(req.body);
  const patient = await findPatientForAccess(req.params.nationalHealthId);

  if (!patient) {
    res.status(404).json({ error: "patient not found" });
    return;
  }

  if (req.org?.type !== "agency" && !(await hasPatientAccess(patient.id, req.org))) {
    res.status(403).json({ error: "patient access is not granted" });
    return;
  }

  await grantPatientAccess({
    patientId: patient.id,
    orgId: body.organizationId,
    grantedByOrgId: req.org?.id
  });

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "patient.access_grant",
    resourceType: "patient",
    resourceId: patient.id,
    ipAddress: req.ip,
    metadata: { organizationId: body.organizationId }
  });

  res.status(201).json({ patientId: patient.id, organizationId: body.organizationId });
}));

patientsRouter.post("/:nationalHealthId/documents", (_req, res) => {
  res.status(410).json({ error: "patient document uploads moved to POST /documents" });
});

patientsRouter.get("/:nationalHealthId/documents", (req, res) => {
  res.redirect(308, `/documents/patient/${encodeURIComponent(req.params.nationalHealthId)}`);
});

patientsRouter.get("/:nationalHealthId/documents/:documentId", (req, res) => {
  res.redirect(308, `/documents/${encodeURIComponent(req.params.documentId)}/download`);
});

patientsRouter.get("/:nationalHealthId", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, national_health_id AS "nationalHealthId", full_name AS "fullName",
            date_of_birth AS "dateOfBirth", consent_status AS "consentStatus",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM patients WHERE national_health_id = $1`,
    [req.params.nationalHealthId]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "patient not found" });
    return;
  }

  const authorization = await authorizeActivePatientAccess(
    { id: result.rows[0].id, consent_status: result.rows[0].consentStatus },
    req.org
  );
  if (!authorization.allowed) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "patient.read",
    resourceType: "patient",
    resourceId: result.rows[0].id,
    ipAddress: req.ip
  });

  res.json(result.rows[0]);
}));
