import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";

export type AuthenticatedOrg = {
  id: string;
  name: string;
  type: "hospital" | "laboratory" | "pharmacy" | "insurer" | "agency";
};

export function hashApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function issueToken(org: AuthenticatedOrg) {
  return jwt.sign(org, env.JWT_SECRET, {
    subject: org.id,
    issuer: "national-healthcare-data-exchange",
    expiresIn: "1h"
  });
}

export async function authenticateApiKey(apiKey: string): Promise<AuthenticatedOrg | null> {
  const result = await pool.query(
    "SELECT id, name, type FROM organizations WHERE api_key_hash = $1",
    [hashApiKey(apiKey)]
  );

  return result.rows[0] ?? null;
}

export function verifyToken(token: string): AuthenticatedOrg {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "national-healthcare-data-exchange"
  }) as AuthenticatedOrg;
}
