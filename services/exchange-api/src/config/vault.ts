const DEFAULT_VAULT_ADDR = "http://localhost:8200";
const DEFAULT_VAULT_TOKEN = "root";
const DEFAULT_VAULT_SECRET_PATH = "secret/data/hde/exchange-api";
const DEFAULT_VAULT_TIMEOUT_MS = 2_000;

const SECRET_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "MINIO_ENDPOINT",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
  "ALLOWED_ORIGINS",
  "AUDIT_LOG_PATH"
] as const;

type SecretKey = (typeof SECRET_KEYS)[number];

type VaultEnv = NodeJS.ProcessEnv & {
  VAULT_ENABLED?: string;
  VAULT_ADDR?: string;
  VAULT_TOKEN?: string;
  VAULT_SECRET_PATH?: string;
  VAULT_NAMESPACE?: string;
  VAULT_TIMEOUT_MS?: string;
};

type VaultSecretResponse = {
  data?: Record<string, unknown> & {
    data?: Record<string, unknown>;
  };
};

export type RuntimeSecrets = Partial<Record<SecretKey, string>>;

export async function loadVaultSecrets(sourceEnv: VaultEnv = process.env): Promise<RuntimeSecrets> {
  if (sourceEnv.VAULT_ENABLED !== "true") {
    return {};
  }

  const vaultAddress = sourceEnv.VAULT_ADDR?.trim() || DEFAULT_VAULT_ADDR;
  const vaultToken = sourceEnv.VAULT_TOKEN?.trim() || DEFAULT_VAULT_TOKEN;

  const secretPath = sourceEnv.VAULT_SECRET_PATH?.trim() || DEFAULT_VAULT_SECRET_PATH;
  const timeoutMs = parseTimeout(sourceEnv.VAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(`/v1/${secretPath.replace(/^\/+/, "")}`, vaultAddress), {
      headers: buildVaultHeaders(vaultToken, sourceEnv.VAULT_NAMESPACE),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Vault responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as VaultSecretResponse;
    return selectRuntimeSecrets(extractSecretData(payload));
  } catch (error) {
    console.warn(`Vault secret load failed; using environment fallback. ${formatVaultError(error)}`);
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function buildVaultHeaders(vaultToken: string, namespace?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Vault-Token": vaultToken
  };

  if (namespace?.trim()) {
    headers["X-Vault-Namespace"] = namespace.trim();
  }

  return headers;
}

function extractSecretData(payload: VaultSecretResponse): Record<string, unknown> {
  if (payload.data?.data && isPlainObject(payload.data.data)) {
    return payload.data.data;
  }

  if (payload.data && isPlainObject(payload.data)) {
    return payload.data;
  }

  return {};
}

function selectRuntimeSecrets(data: Record<string, unknown>): RuntimeSecrets {
  return SECRET_KEYS.reduce<RuntimeSecrets>((secrets, key) => {
    const value = data[key];

    if (typeof value === "string" && value.length > 0) {
      secrets[key] = value;
    }

    return secrets;
  }, {});
}

function parseTimeout(value?: string) {
  if (!value) {
    return DEFAULT_VAULT_TIMEOUT_MS;
  }

  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return DEFAULT_VAULT_TIMEOUT_MS;
  }

  return timeout;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatVaultError(error: unknown) {
  if (error instanceof Error) {
    return error.name === "AbortError" ? `Timed out after Vault request.` : error.message;
  }

  return "Unknown Vault error.";
}
