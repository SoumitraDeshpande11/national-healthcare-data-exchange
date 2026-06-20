import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("health routes", () => {
  it("returns liveness", async () => {
    const app = createApp();
    const response = await request(app).get("/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "live" });
  });
});
