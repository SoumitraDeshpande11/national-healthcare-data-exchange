import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: "validation failed", details: error.flatten() });
    return;
  }

  logger.error({ error, path: req.path }, "request failed");
  res.status(500).json({ error: "internal server error" });
}
