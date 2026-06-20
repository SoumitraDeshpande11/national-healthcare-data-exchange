import express from "express";
import cors from "cors";
import type { CorsOptions } from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { logger } from "./utils/logger.js";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { patientsRouter } from "./routes/patients.js";
import { recordsRouter } from "./routes/records.js";
import { documentsRouter } from "./routes/documents.js";
import { healthRouter } from "./routes/health.js";
import { complianceRouter } from "./routes/compliance.js";
import { errorHandler } from "./middleware/errors.js";
import { metricsMiddleware, metricsText } from "./middleware/metrics.js";

export function createApp() {
  const app = express();
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization"]
  };

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/patients", patientsRouter);
  app.use("/records", recordsRouter);
  app.use("/documents", documentsRouter);
  app.use("/compliance", complianceRouter);

  app.get("/metrics", async (_req, res) => {
    res.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(await metricsText());
  });

  app.use(errorHandler);

  return app;
}
