import { pool } from "../db/pool.js";
import type { AuthenticatedOrg } from "./auth.js";

type OrgType = AuthenticatedOrg["type"];

const recordCreatePermissions: Record<string, OrgType[]> = {
  encounter: ["hospital"],
  lab_result: ["laboratory"],
  prescription: ["pharmacy"],
  claim: ["insurer"],
  immunization: ["hospital"]
};

const documentCreatePermissions: Record<string, OrgType[]> = {
  discharge_summary: ["hospital"],
  lab_report: ["laboratory"],
  prescription_scan: ["pharmacy"],
  insurance_document: ["insurer"],
  imaging_report: ["hospital", "laboratory"],
  consent_form: ["hospital", "agency"]
};

export type PatientAuthorizationStatus =
  | { allowed: true }
  | { allowed: false; status: 403; error: string };

export function canCreateRecordType(org: AuthenticatedOrg | undefined, recordType: string) {
  return Boolean(org && recordCreatePermissions[recordType]?.includes(org.type));
}

export function canCreateDocumentType(org: AuthenticatedOrg | undefined, documentType: string) {
  return Boolean(org && documentCreatePermissions[documentType]?.includes(org.type));
}

export async function grantPatientAccess({
  patientId,
  orgId,
  grantedByOrgId
}: {
  patientId: string;
  orgId: string;
  grantedByOrgId?: string;
}) {
  await pool.query(
    `INSERT INTO patient_access_grants (patient_id, org_id, granted_by_org_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (patient_id, org_id)
     DO UPDATE SET revoked_at = NULL,
                   granted_by_org_id = EXCLUDED.granted_by_org_id`,
    [patientId, orgId, grantedByOrgId]
  );
}

export async function hasPatientAccess(patientId: string, org: AuthenticatedOrg | undefined) {
  if (!org) {
    return false;
  }

  if (org.type === "agency") {
    return true;
  }

  const result = await pool.query(
    `SELECT 1
     FROM patient_access_grants
     WHERE patient_id = $1 AND org_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [patientId, org.id]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function authorizeActivePatientAccess(
  patient: { id: string; consent_status: string },
  org: AuthenticatedOrg | undefined
): Promise<PatientAuthorizationStatus> {
  if (patient.consent_status !== "active") {
    return { allowed: false, status: 403, error: "patient consent is revoked" };
  }

  if (!(await hasPatientAccess(patient.id, org))) {
    return { allowed: false, status: 403, error: "patient access is not granted" };
  }

  return { allowed: true };
}
