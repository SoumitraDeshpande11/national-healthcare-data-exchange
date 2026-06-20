import type { Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  writeAudit: vi.fn()
}));

vi.mock("../services/exchange-api/src/db/pool.js", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../services/exchange-api/src/services/audit.js", () => ({
  writeAudit: mocks.writeAudit
}));

describe("API authorization controls", () => {
  let app: Express;
  let issueToken: typeof import("../services/exchange-api/src/services/auth.js").issueToken;

  beforeAll(async () => {
    const [{ createApp }, authModule] = await Promise.all([
      import("../services/exchange-api/src/app.js"),
      import("../services/exchange-api/src/services/auth.js")
    ]);

    issueToken = authModule.issueToken;
    app = createApp();
  });

  beforeEach(() => {
    mocks.poolQuery.mockReset();
    mocks.writeAudit.mockReset();
    mocks.writeAudit.mockResolvedValue(undefined);
  });

  it("rejects invalid API keys before issuing bearer tokens", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await request(app)
      .post("/auth/token")
      .send({ apiKey: "invalid-local-api-key" });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "invalid api key" });
    expect(response.body.accessToken).toBeUndefined();
    expect(mocks.writeAudit).not.toHaveBeenCalled();
  });

  it("issues a bearer token for a valid API key and permits agency compliance access", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: "agency-1", name: "National Health Agency", type: "agency" }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ status: "published", count: 3 }] });

    const tokenResponse = await request(app)
      .post("/auth/token")
      .send({ apiKey: "agency-local-api-key" });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body).toMatchObject({
      tokenType: "Bearer",
      expiresInSeconds: 3600
    });
    expect(tokenResponse.body.accessToken).toEqual(expect.any(String));

    const complianceResponse = await request(app)
      .get("/compliance/summary")
      .set("authorization", `Bearer ${tokenResponse.body.accessToken}`);

    expect(complianceResponse.status).toBe(200);
    expect(complianceResponse.body).toEqual({
      patients: 2,
      records: 4,
      auditEvents: 1,
      syncEvents: [{ status: "published", count: 3 }]
    });
  });

  it("requires a valid bearer token on compliance endpoints", async () => {
    const missingResponse = await request(app).get("/compliance/summary");
    expect(missingResponse.status).toBe(401);
    expect(missingResponse.body).toEqual({ error: "missing bearer token" });

    const invalidResponse = await request(app)
      .get("/compliance/summary")
      .set("authorization", "Bearer not-a-valid-token");

    expect(invalidResponse.status).toBe(401);
    expect(invalidResponse.body).toEqual({ error: "invalid or expired token" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("denies non-agency organizations from compliance endpoints", async () => {
    const hospitalToken = issueToken({
      id: "hospital-1",
      name: "Metro General Hospital",
      type: "hospital"
    });

    const response = await request(app)
      .get("/compliance/summary")
      .set("authorization", `Bearer ${hospitalToken}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "insufficient organization role" });
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
