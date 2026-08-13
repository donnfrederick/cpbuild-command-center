/**
 * Azure Key Vault secret fetcher.
 *
 * Uses DefaultAzureCredential which supports, in order:
 *   1. Environment variables (AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID) — CI & staging
 *   2. Workload Identity (AKS pods)
 *   3. Managed Identity (App Service / Azure Functions in production)
 *   4. Azure CLI (`az login`) — local dev when AZURE_KEYVAULT_URL is set
 *
 * Falls back gracefully when AZURE_KEYVAULT_URL is not configured (plain env-var
 * credentials are used instead — see lib/unifier/client.ts).
 *
 * Based on the BI team's Python reference:
 *   keyvault_endpoint = 'https://CPBBI-vault1.vault.azure.net/'
 *   password = getSecret(keyvault_endpoint, 'unifier-password')
 */

import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

// Module-level cache: secretName → resolved value
const cache = new Map<string, string>();

let client: SecretClient | null = null;

function getClient(): SecretClient | null {
  const url = process.env.AZURE_KEYVAULT_URL;
  if (!url) return null;

  if (!client) {
    client = new SecretClient(url, new DefaultAzureCredential());
  }
  return client;
}

/**
 * Retrieve a secret from Azure Key Vault.
 * Returns null if Key Vault is not configured (AZURE_KEYVAULT_URL not set),
 * so callers can fall back to env-var values.
 *
 * Results are cached for the process lifetime (safe because secrets are
 * rotated externally; restart the app after rotation).
 */
export async function getKeyVaultSecret(
  secretName: string
): Promise<string | null> {
  const kvClient = getClient();
  if (!kvClient) return null;

  const cached = cache.get(secretName);
  if (cached !== undefined) return cached;

  const { value } = await kvClient.getSecret(secretName);
  if (value === undefined) {
    throw new Error(
      `Azure Key Vault secret "${secretName}" exists but has no value.`
    );
  }

  cache.set(secretName, value);
  return value;
}
