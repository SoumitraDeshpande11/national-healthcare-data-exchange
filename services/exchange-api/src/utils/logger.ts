import pino from "pino";
import { env } from "../config/env.js";

const loggerOptions: pino.LoggerOptions = {
  level: env.NODE_ENV === "test" ? "silent" : "info",
  redact: {
    paths: ["req.headers.authorization", "patient.ssn", "record.payload"],
    censor: "[REDACTED]"
  }
};

export const logger = env.API_LOG_PATH
  ? pino(
      loggerOptions,
      pino.multistream([
        { stream: process.stdout },
        { stream: pino.destination({ dest: env.API_LOG_PATH, sync: false }) }
      ])
    )
  : pino(loggerOptions);
