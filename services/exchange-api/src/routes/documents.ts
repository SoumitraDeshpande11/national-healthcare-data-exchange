import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { recordDocumentUpload } from "../middleware/metrics.js";
import { buildDocumentObjectKey, ensureDocumentBucket, getDocumentObject, putDocumentObject } from "../services/objectStorage.js";
import { publishSyncEvent } from "../services/syncBus.js";
import { writeAudit } from "../services/audit.js";
import { authorizeActivePatientAccess, canCreateDocumentType } from "../services/authorization.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

const uploadSchema = z.object({
  nationalHealthId: z.string().min(6).max(64),
  documentType: z.enum([
    "discharge_summary",
    "lab_report",
    "prescription_scan",
    "insurance_document",
    "imaging_report",
    "consent_form"
  ])
});

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  const body = uploadSchema.parse(req.body);

  if (!canCreateDocumentType(req.org, body.documentType)) {
    recordDocumentUpload("failure");
    res.status(403).json({ error: "organization cannot create this document type" });
    return;
  }

  if (!req.file) {
    recordDocumentUpload("failure");
    res.status(400).json({ error: "file is required" });
    return;
  }

  const patientResult = await pool.query(
    "SELECT id, consent_status FROM patients WHERE national_health_id = $1",
    [body.nationalHealthId]
  );

  if (patientResult.rowCount === 0) {
    recordDocumentUpload("failure");
    res.status(404).json({ error: "patient not found" });
    return;
  }

  const patient = patientResult.rows[0];
  const authorization = await authorizeActivePatientAccess(patient, req.org);
  if (!authorization.allowed) {
    recordDocumentUpload("failure");
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const checksum = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const objectKey = buildDocumentObjectKey(patient.id, req.file.originalname);
  await ensureDocumentBucket();
  await putDocumentObject({
    objectKey,
    body: req.file.buffer,
    contentType: req.file.mimetype || "application/octet-stream",
    checksum
  });

  const documentResult = await pool.query(
    `INSERT INTO patient_documents (
       patient_id, source_org_id, document_type, object_key, file_name, mime_type, size_bytes, checksum_sha256
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, document_type AS "documentType", file_name AS "fileName",
               mime_type AS "mimeType", size_bytes AS "sizeBytes",
               checksum_sha256 AS "checksumSha256", created_at AS "createdAt"`,
    [
      patient.id,
      req.org?.id,
      body.documentType,
      objectKey,
      req.file.originalname,
      req.file.mimetype || "application/octet-stream",
      req.file.size,
      checksum
    ]
  );

  const document = documentResult.rows[0];
  const syncEventResult = await pool.query(
    `INSERT INTO sync_events (patient_id, event_type, status)
     VALUES ($1, $2, 'queued')
     RETURNING id`,
    [patient.id, "document.uploaded"]
  );
  await publishSyncEvent({
    syncEventId: syncEventResult.rows[0]?.id,
    eventType: "document.uploaded",
    patientId: patient.id,
    documentId: document.id
  });
  await writeAudit({
    actorOrgId: req.org?.id,
    action: "document.upload",
    resourceType: "patient_document",
    resourceId: document.id,
    ipAddress: req.ip,
    metadata: {
      nationalHealthId: body.nationalHealthId,
      documentType: body.documentType,
      fileName: req.file.originalname,
      sizeBytes: req.file.size,
      checksumSha256: checksum
    }
  });

  recordDocumentUpload("success");
  res.status(201).json(document);
}));

documentsRouter.get("/patient/:nationalHealthId", asyncHandler(async (req, res) => {
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
    `SELECT d.id, d.document_type AS "documentType", d.file_name AS "fileName",
            d.mime_type AS "mimeType", d.size_bytes AS "sizeBytes",
            d.checksum_sha256 AS "checksumSha256", d.created_at AS "createdAt",
            o.name AS "sourceOrganization"
     FROM patient_documents d
     JOIN organizations o ON o.id = d.source_org_id
     WHERE d.patient_id = $1
     ORDER BY d.created_at DESC
     LIMIT 200`,
    [patient.id]
  );

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "document.search",
    resourceType: "patient_document",
    resourceId: req.params.nationalHealthId,
    ipAddress: req.ip
  });

  res.json({ documents: result.rows });
}));

documentsRouter.get("/:documentId/download", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT d.object_key, d.file_name, d.mime_type, d.id,
            p.id AS patient_id, p.consent_status
     FROM patient_documents d
     JOIN patients p ON p.id = d.patient_id
     WHERE d.id = $1`,
    [req.params.documentId]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "document not found" });
    return;
  }

  const document = result.rows[0];
  const authorization = await authorizeActivePatientAccess(
    { id: document.patient_id, consent_status: document.consent_status },
    req.org
  );
  if (!authorization.allowed) {
    res.status(authorization.status).json({ error: authorization.error });
    return;
  }

  const object = await getDocumentObject(document.object_key);

  await writeAudit({
    actorOrgId: req.org?.id,
    action: "document.download",
    resourceType: "patient_document",
    resourceId: document.id,
    ipAddress: req.ip,
    metadata: { fileName: document.file_name }
  });

  res.setHeader("content-type", object.contentType || document.mime_type);
  res.setHeader("content-disposition", `attachment; filename="${String(document.file_name).replace(/["\\]/g, "_")}"`);
  object.body.pipe(res);
}));
