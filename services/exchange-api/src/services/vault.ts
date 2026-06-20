import { loadVaultSecrets } from "../config/vault.js";

export async function bootstrapSecretsFromVault() {
  const secrets = await loadVaultSecrets();

  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }

  if (Object.keys(secrets).length > 0) {
    process.env.SECRETS_SOURCE = "vault";
  }
}
