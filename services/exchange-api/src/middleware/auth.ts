import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../services/auth.js";
import { recordAuthFailure } from "./metrics.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    recordAuthFailure("bearer_token", "missing_bearer_token");
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  try {
    req.org = verifyToken(token);
    next();
  } catch {
    recordAuthFailure("bearer_token", "invalid_or_expired_token");
    res.status(401).json({ error: "invalid or expired token" });
  }
}

export function requireOrgTypes(types: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.org || !types.includes(req.org.type)) {
      res.status(403).json({ error: "insufficient organization role" });
      return;
    }
    next();
  };
}
