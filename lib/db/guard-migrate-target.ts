import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface MigrateTargetAssessment {
  blocked: boolean;
  reason: string;
  host: string;
  fingerprint: string;
  matchedProd: boolean;
}

/** Host + port + database name — credentials stripped. */
export function postgresFingerprint(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const normalized = trimmed.replace(/^postgresql:/, "postgres:");
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port || "5432";
    const database = parsed.pathname.replace(/^\//, "") || "postgres";
    return `${host}:${port}/${database}`;
  } catch {
    const schemeEnd = trimmed.indexOf("://");
    if (schemeEnd === -1) return null;
    const afterScheme = trimmed.slice(schemeEnd + 3);
    const atIndex = afterScheme.lastIndexOf("@");
    if (atIndex === -1) return null;
    const hostPart = afterScheme.slice(atIndex + 1);
    const hostPort = hostPart.split("/")[0]?.split("?")[0]?.toLowerCase();
    if (!hostPort) return null;
    const dbMatch = hostPart.match(/\/([^/?]+)/);
    const database = dbMatch?.[1] ?? "postgres";
    return `${hostPort}/${database}`;
  }
}

export function resolveMigrateConnectionUrl(input: {
  databaseUrl?: string | null;
  directUrl?: string | null;
}): string | null {
  const direct = input.directUrl?.trim();
  if (direct) return direct;
  const database = input.databaseUrl?.trim();
  return database || null;
}

export function readDatabaseUrlsFromEnvFile(filePath: string): {
  databaseUrl?: string;
  directUrl?: string;
} {
  if (!existsSync(filePath)) return {};

  const text = readFileSync(filePath, "utf-8");
  const readKey = (key: string): string | undefined => {
    const match = text.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (!match?.[1]) return undefined;
    return match[1].trim().replace(/^["']|["']$/g, "");
  };

  return {
    databaseUrl: readKey("DATABASE_URL"),
    directUrl: readKey("DIRECT_URL"),
  };
}

export function loadProdMigrateFingerprints(repoRoot: string): string[] {
  const prodEnv = readDatabaseUrlsFromEnvFile(join(repoRoot, ".env.prod.local"));
  const urls = [prodEnv.directUrl, prodEnv.databaseUrl].filter(Boolean) as string[];
  const fingerprints = new Set<string>();
  for (const url of urls) {
    const fp = postgresFingerprint(url);
    if (fp) fingerprints.add(fp);
  }
  return [...fingerprints];
}

const INTERNAL_RAILWAY_HOSTS = new Set(["postgres.railway.internal"]);

export function assessMigrateTarget(
  migrateUrl: string,
  prodFingerprints: readonly string[],
): MigrateTargetAssessment {
  const fingerprint = postgresFingerprint(migrateUrl);
  if (!fingerprint) {
    return {
      blocked: true,
      reason: "Could not parse DATABASE_URL / DIRECT_URL for migrate guard.",
      host: "unknown",
      fingerprint: "",
      matchedProd: false,
    };
  }

  const host = fingerprint.split("/")[0]?.split(":")[0] ?? "unknown";
  const matchedProd = prodFingerprints.includes(fingerprint);

  if (INTERNAL_RAILWAY_HOSTS.has(host)) {
    return {
      blocked: true,
      reason:
        "Refusing migrate against postgres.railway.internal from a laptop — use Railway deploy or set ALLOW_PROD_MIGRATE=1 with explicit intent.",
      host,
      fingerprint,
      matchedProd,
    };
  }

  if (matchedProd) {
    return {
      blocked: true,
      reason:
        "Migrate target matches .env.prod.local (production). Use dev/local DATABASE_URL, or set ALLOW_PROD_MIGRATE=1 to override.",
      host,
      fingerprint,
      matchedProd: true,
    };
  }

  return {
    blocked: false,
    reason: "OK",
    host,
    fingerprint,
    matchedProd: false,
  };
}

export function assertSafeMigrateTarget(input: {
  databaseUrl?: string | null;
  directUrl?: string | null;
  prodFingerprints: readonly string[];
  allowProdMigrate?: boolean;
}): MigrateTargetAssessment {
  const migrateUrl = resolveMigrateConnectionUrl({
    databaseUrl: input.databaseUrl,
    directUrl: input.directUrl,
  });

  if (!migrateUrl) {
    return {
      blocked: true,
      reason: "DATABASE_URL is not set.",
      host: "unknown",
      fingerprint: "",
      matchedProd: false,
    };
  }

  const assessment = assessMigrateTarget(migrateUrl, input.prodFingerprints);
  if (assessment.blocked && input.allowProdMigrate) {
    return { ...assessment, blocked: false, reason: "ALLOW_PROD_MIGRATE override" };
  }
  return assessment;
}
