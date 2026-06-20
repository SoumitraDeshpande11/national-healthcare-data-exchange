import { Readable } from "node:stream";
import type { Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  s3Send: vi.fn(),
  publishSyncEvent: vi.fn(),
  writeAudit: vi.fn()
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../src/services/audit.js", () => ({
  writeAudit: mocks.writeAudit
}));

vi.mock("../src/services/syncBus.js", () => ({
  publishSyncEvent: mocks.publishSyncEvent
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send(command: unknown) {
      return mocks.s3Send(command);
    }
  }

  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  class HeadBucketCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  class CreateBucketCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  class GetObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }

  return {
    S3Client,
    PutObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
    GetObjectCommand
  };
});

type CommandWithInput = {
  constructor: { name: string };
  input: Record<string, unknown>;
};

function queryText(sql: unknown) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function patientRow(consentStatus = "active") {
  return {
    id: "patient-1",
    nationalHealthId: "NHID12345",
    fullName: "Ada Lovelace",
    dateOfBirth: "1980-01-01",
    consentStatus,
    consent_status: consentStatus
  };
}

describe("exchange API authorization and documents", () => {
  let app: Express;
  let hospitalToken: string;
  let labToken: string;
  let pharmacyToken: string;

  beforeAll(async () => {
    const [{ createApp }, { issueToken }] = await Promise.all([
      import("../src/app.js"),
      import("../src/services/auth.js")
    ]);

    app = createApp();
    hospitalToken = issueToken({
      id: "hospital-1",
      name: "Metro General Hospital",
      type: "hospital"
    });
    labToken = issueToken({
      id: "lab-1",
      name: "Apex Diagnostic Lab",
      type: "laboratory"
    });
    pharmacyToken = issueToken({
      id: "pharmacy-1",
      name: "CarePlus Pharmacy",
      type: "pharmacy"
    });
  });

  beforeEach(() => {
    mocks.poolQuery.mockReset();
    mocks.s3Send.mockReset();
    mocks.publishSyncEvent.mockReset();
    mocks.writeAudit.mockReset();

    mocks.s3Send.mockResolvedValue({});
    mocks.publishSyncEvent.mockResolvedValue(undefined);
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  it("forbids patient reads without an access grant", async () => {
    mocks.poolQuery.mockImplementation(async (sql: unknown) => {
      const text = queryText(sql);

      if (text.includes("FROM patients WHERE national_health_id = $1")) {
        return { rowCount: 1, rows: [patientRow()] };
      }

      if (text.includes("FROM patient_access_grants")) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error(`unexpected query: ${text}`);
    });

    const response = await request(app)
      .get("/patients/NHID12345")
      .set("authorization", `Bearer ${pharmacyToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "patient access is not granted" });
  });

  it("rejects a record type created by the wrong organization role", async () => {
    const response = await request(app)
      .post("/records")
      .set("authorization", `Bearer ${hospitalToken}`)
      .send({
        nationalHealthId: "NHID12345",
        recordType: "lab_result",
        payload: { value: "positive" }
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "organization cannot create this record type" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects record reads when consent is revoked", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: "patient-1", consent_status: "revoked" }]
    });

    const response = await request(app)
      .get("/records/patient/NHID12345")
      .set("authorization", `Bearer ${hospitalToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "patient consent is revoked" });
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical DB-backed document workflow", async () => {
    mocks.poolQuery.mockImplementation(async (sql: unknown) => {
      const text = queryText(sql);

      if (text.includes("SELECT id, consent_status FROM patients")) {
        return { rowCount: 1, rows: [{ id: "patient-1", consent_status: "active" }] };
      }

      if (text.includes("FROM patient_access_grants")) {
        return { rowCount: 1, rows: [{ "?column?": 1 }] };
      }

      if (text.includes("INSERT INTO patient_documents")) {
        return {
          rowCount: 1,
          rows: [{
            id: "document-1",
            documentType: "lab_report",
            fileName: "lab-result.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3,
            checksumSha256: "checksum",
            createdAt: "2026-06-20T08:00:00.000Z"
          }]
        };
      }

      if (text.includes("INSERT INTO sync_events")) {
        return { rowCount: 1, rows: [] };
      }

      if (text.includes("FROM patient_documents d JOIN organizations")) {
        return {
          rowCount: 1,
          rows: [{
            id: "document-1",
            documentType: "lab_report",
            fileName: "lab-result.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3,
            checksumSha256: "checksum",
            createdAt: "2026-06-20T08:00:00.000Z",
            sourceOrganization: "Apex Diagnostic Lab"
          }]
        };
      }

      if (text.includes("FROM patient_documents d JOIN patients")) {
        return {
          rowCount: 1,
          rows: [{
            id: "document-1",
            object_key: "patients/patient-1/documents/document-1-lab-result.pdf",
            file_name: "lab-result.pdf",
            mime_type: "application/pdf",
            patient_id: "patient-1",
            consent_status: "active"
          }]
        };
      }

      throw new Error(`unexpected query: ${text}`);
    });

    mocks.s3Send.mockImplementation(async (command: CommandWithInput) => {
      if (command.constructor.name === "GetObjectCommand") {
        return {
          Body: Readable.from(Buffer.from("abc")),
          ContentType: "application/pdf"
        };
      }

      return {};
    });

    const uploadResponse = await request(app)
      .post("/documents")
      .set("authorization", `Bearer ${labToken}`)
      .field("nationalHealthId", "NHID12345")
      .field("documentType", "lab_report")
      .attach("file", Buffer.from("abc"), {
        filename: "lab-result.pdf",
        contentType: "application/pdf"
      });

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body).toMatchObject({
      id: "document-1",
      documentType: "lab_report",
      fileName: "lab-result.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3
    });

    const putCommand = mocks.s3Send.mock.calls
      .map((call) => call[0] as CommandWithInput)
      .find((command) => command.constructor.name === "PutObjectCommand");

    expect(putCommand?.input).toMatchObject({
      Bucket: "healthcare-documents",
      Body: Buffer.from("abc"),
      ContentType: "application/pdf"
    });
    expect(String(putCommand?.input.Key)).toMatch(/^patients\/patient-1\/documents\/.+lab-result\.pdf$/);

    const listResponse = await request(app)
      .get("/documents/patient/NHID12345")
      .set("authorization", `Bearer ${labToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.documents).toEqual([{
      id: "document-1",
      documentType: "lab_report",
      fileName: "lab-result.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      checksumSha256: "checksum",
      createdAt: "2026-06-20T08:00:00.000Z",
      sourceOrganization: "Apex Diagnostic Lab"
    }]);

    const downloadResponse = await request(app)
      .get("/documents/document-1/download")
      .set("authorization", `Bearer ${labToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("application/pdf");
    expect(downloadResponse.headers["content-disposition"]).toBe("attachment; filename=\"lab-result.pdf\"");
    expect(downloadResponse.body).toEqual(Buffer.from("abc"));
  });

  it("does not serve the legacy MinIO-metadata patient document API", async () => {
    const listResponse = await request(app)
      .get("/patients/NHID12345/documents")
      .set("authorization", `Bearer ${hospitalToken}`);

    expect(listResponse.status).toBe(308);
    expect(listResponse.headers.location).toBe("/documents/patient/NHID12345");

    const uploadResponse = await request(app)
      .post("/patients/NHID12345/documents")
      .set("authorization", `Bearer ${hospitalToken}`)
      .set("content-type", "application/pdf")
      .send(Buffer.from("abc"));

    expect(uploadResponse.status).toBe(410);
    expect(uploadResponse.body).toEqual({ error: "patient document uploads moved to POST /documents" });
  });
});
