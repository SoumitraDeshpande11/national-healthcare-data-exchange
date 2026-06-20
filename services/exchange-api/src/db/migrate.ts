import { pool } from "./pool.js";
import { logger } from "../utils/logger.js";

const statements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,
  `CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('hospital', 'laboratory', 'pharmacy', 'insurer', 'agency')),
    api_key_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `INSERT INTO organizations (name, type, api_key_hash)
   VALUES
     ('National Health Agency', 'agency', encode(digest('agency-local-api-key', 'sha256'), 'hex')),
     ('Metro General Hospital', 'hospital', encode(digest('hospital-local-api-key', 'sha256'), 'hex')),
     ('Apex Diagnostic Lab', 'laboratory', encode(digest('lab-local-api-key', 'sha256'), 'hex')),
     ('CarePlus Pharmacy', 'pharmacy', encode(digest('pharmacy-local-api-key', 'sha256'), 'hex')),
     ('Unified Health Insurance', 'insurer', encode(digest('insurer-local-api-key', 'sha256'), 'hex'))
   ON CONFLICT (name) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    national_health_id TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    consent_status TEXT NOT NULL CHECK (consent_status IN ('active', 'revoked')) DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS patient_access_grants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    granted_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    UNIQUE (patient_id, org_id)
  )`,
  `CREATE TABLE IF NOT EXISTS clinical_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    source_org_id UUID NOT NULL REFERENCES organizations(id),
    record_type TEXT NOT NULL CHECK (record_type IN ('encounter', 'lab_result', 'prescription', 'claim', 'immunization')),
    payload JSONB NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS patient_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    source_org_id UUID NOT NULL REFERENCES organizations(id),
    document_type TEXT NOT NULL CHECK (document_type IN ('discharge_summary', 'lab_report', 'prescription_scan', 'insurance_document', 'imaging_report', 'consent_form')),
    object_key TEXT UNIQUE NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    checksum_sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sync_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id UUID REFERENCES clinical_records(id) ON DELETE SET NULL,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'published', 'failed')) DEFAULT 'queued',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_org_id UUID REFERENCES organizations(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_records_patient_id ON clinical_records(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON patient_documents(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON patient_documents(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_patient_access_active ON patient_access_grants(patient_id, org_id) WHERE revoked_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_records_type_created_at ON clinical_records(record_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC)`
];

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of statements) {
      await client.query(sql);
    }
    await client.query("COMMIT");
    logger.info("database migrations applied");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
