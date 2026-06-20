import dotenv from "dotenv";
import { z } from "zod";
import { loadVaultSecrets } from "./vault.js";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url().default("postgres://hde:hde_password@localhost:5432/hde"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(16).default("local-dev-change-me-with-32-characters"),
  MINIO_ENDPOINT: z.string().url().default("http://localhost:9000"),
  MINIO_ACCESS_KEY: z.string().default("soumitra"),
  MINIO_SECRET_KEY: z.string().default("deshpande"),
  MINIO_BUCKET: z.string().default("healthcare-documents"),
  DOCUMENT_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  VAULT_ENABLED: z.enum(["true", "false"]).default("false"),
  VAULT_ADDR: z.string().url().default("http://localhost:8200"),
  VAULT_TOKEN: z.string().default("root"),
  VAULT_SECRET_PATH: z.string().default("secret/data/hde/exchange-api"),
  ELASTICSEARCH_URL: z.string().url().default("http://localhost:9200"),
  ELASTICSEARCH_LOG_INDEX: z.string().default("hde-api-logs"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  API_LOG_PATH: z.string().optional(),
  AUDIT_LOG_PATH: z.string().default("/tmp/hde-audit.log")
});

const vaultSecrets = await loadVaultSecrets();

export const env = envSchema.parse({
  ...process.env,
  ...vaultSecrets
});
