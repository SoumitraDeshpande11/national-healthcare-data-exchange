import type { NextFunction, Request, Response } from "express";
import client from "prom-client";

client.collectDefaultMetrics();

const orgTypes = ["agency", "hospital", "laboratory", "pharmacy", "insurer", "unknown"] as const;
const recordTypes = ["encounter", "lab_result", "prescription", "claim", "immunization"] as const;

export const httpDuration = new client.Histogram({
  name: "hde_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
});

export const patientRegistrationsTotal = new client.Counter({
  name: "hde_patient_registrations_total",
  help: "Total successful patient registration upserts",
  labelNames: ["org_type", "consent_status"]
});

export const recordPublicationsTotal = new client.Counter({
  name: "hde_record_publications_total",
  help: "Total clinical records published to the exchange",
  labelNames: ["record_type", "source_org_type"]
});

export const authFailuresTotal = new client.Counter({
  name: "hde_auth_failures_total",
  help: "Total authentication failures",
  labelNames: ["auth_flow", "reason"]
});

export const documentUploadsTotal = new client.Counter({
  name: "hde_document_uploads_total",
  help: "Total document upload attempts",
  labelNames: ["outcome"]
});

for (const orgType of orgTypes) {
  for (const consentStatus of ["active", "revoked"]) {
    patientRegistrationsTotal.labels(orgType, consentStatus).inc(0);
  }
}

for (const recordType of recordTypes) {
  for (const orgType of orgTypes) {
    recordPublicationsTotal.labels(recordType, orgType).inc(0);
  }
}

for (const [authFlow, reason] of [
  ["api_key", "invalid_api_key"],
  ["bearer_token", "missing_bearer_token"],
  ["bearer_token", "invalid_or_expired_token"]
]) {
  authFailuresTotal.labels(authFlow, reason).inc(0);
}

for (const outcome of ["success", "failure"]) {
  documentUploadsTotal.labels(outcome).inc(0);
}

export function recordPatientRegistration(orgType = "unknown", consentStatus = "unknown") {
  patientRegistrationsTotal.labels(orgType, consentStatus).inc();
}

export function recordRecordPublication(recordType: string, sourceOrgType = "unknown") {
  recordPublicationsTotal.labels(recordType, sourceOrgType).inc();
}

export function recordAuthFailure(authFlow: "api_key" | "bearer_token", reason: string) {
  authFailuresTotal.labels(authFlow, reason).inc();
}

export function recordDocumentUpload(outcome: "success" | "failure") {
  documentUploadsTotal.labels(outcome).inc();
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    end({
      method: req.method,
      route: req.route?.path ?? req.path,
      status_code: String(res.statusCode)
    });
  });
  next();
}

export async function metricsText() {
  return client.register.metrics();
}
