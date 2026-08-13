/**
 * GET /api/devtools/diagnostics
 *
 * Server-side diagnostic checks returned as JSON.
 * Hard-blocked in production.
 *
 * Returns:
 *   - db: database connectivity + basic stats
 *   - env: required environment variable presence (values never exposed)
 */

import { NextResponse } from "next/server";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";

export const dynamic = "force-dynamic";

interface DiagResult {
  name: string;
  pass: boolean;
  warning?: boolean;
  detail: string;
  durationMs?: number;
}

async function checkDatabase(): Promise<DiagResult[]> {
  const results: DiagResult[] = [];
  const t0 = Date.now();

  try {
    const { db } = await import("@/lib/db");

    // Basic connectivity
    await db.$queryRaw`SELECT 1`;
    const pingMs = Date.now() - t0;

    results.push({
      name: "Database Connection",
      pass: true,
      detail: `Connected successfully (${pingMs}ms)`,
      durationMs: pingMs,
    });

    // Project count
    const t1 = Date.now();
    const projectCount = await db.project.count({ where: { deletedAt: null } });
    const deletedCount = await db.project.count({ where: { deletedAt: { not: null } } });
    results.push({
      name: "Projects Table",
      pass: true,
      detail: `${projectCount} active project${projectCount !== 1 ? "s" : ""}, ${deletedCount} soft-deleted`,
      durationMs: Date.now() - t1,
    });

    // User count
    const t2 = Date.now();
    const userCount = await db.user.count();
    results.push({
      name: "Users Table",
      pass: true,
      detail: `${userCount} user${userCount !== 1 ? "s" : ""} registered`,
      durationMs: Date.now() - t2,
    });

    // Pending invites
    const t3 = Date.now();
    const pendingInvites = await db.invite.count({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    results.push({
      name: "Invites Table",
      pass: true,
      detail: `${pendingInvites} pending invite${pendingInvites !== 1 ? "s" : ""}`,
      durationMs: Date.now() - t3,
    });

  } catch (err) {
    results.push({
      name: "Database Connection",
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
    });
  }

  return results;
}

function checkEnvVars(): DiagResult[] {
  const checks: Array<{
    name: string;
    key: string;
    required: boolean;
    description: string;
    validate?: (v: string) => string | null; // returns error message or null
  }> = [
    {
      name: "DATABASE_URL",
      key: "DATABASE_URL",
      required: true,
      description: "PostgreSQL connection string",
      validate: (v) =>
        v.startsWith("postgresql://") || v.startsWith("postgres://")
          ? null
          : "Must start with postgresql:// or postgres://",
    },
    {
      name: "AUTH_SECRET",
      key: "AUTH_SECRET",
      required: true,
      description: "NextAuth.js signing secret",
      validate: (v) => (v.length >= 32 ? null : "Should be at least 32 characters (run: openssl rand -base64 32)"),
    },
    {
      name: "NEXTAUTH_URL",
      key: "NEXTAUTH_URL",
      required: true,
      description: "NextAuth.js callback base URL",
      validate: (v) =>
        v.startsWith("http://") || v.startsWith("https://")
          ? null
          : "Must be a full URL (http:// or https://)",
    },
    {
      name: "UNIFIER_BASE_URL",
      key: "UNIFIER_BASE_URL",
      required: true,
      description: "Oracle Unifier PDS base URL",
    },
    {
      name: "UNIFIER_USERNAME",
      key: "UNIFIER_USERNAME",
      required: false,
      description: "Unifier API username (default: Coadmin)",
    },
    {
      name: "UNIFIER_PASSWORD or AZURE_KEYVAULT_URL",
      key: "UNIFIER_PASSWORD",
      required: false,
      description: "Unifier credentials source — plain password or Key Vault (not needed when UNIFIER_MOCK=true)",
      validate: (v) => {
        if (process.env.UNIFIER_MOCK === "true") return null; // Mock mode — password not required
        const hasKv = !!process.env.AZURE_KEYVAULT_URL;
        const isPlaceholder = v?.includes("REPLACE") || v === "" || !v;
        if (hasKv) return null;
        if (isPlaceholder) return "Still set to placeholder — update with real password, set AZURE_KEYVAULT_URL, or use UNIFIER_MOCK=true";
        return null;
      },
    },
    {
      name: "AZURE_KEYVAULT_URL",
      key: "AZURE_KEYVAULT_URL",
      required: false,
      description: "Azure Key Vault endpoint (alternative to UNIFIER_PASSWORD)",
    },
    {
      name: "DEV_BYPASS_AUTH",
      key: "DEV_BYPASS_AUTH",
      required: false,
      description: "Dev-only auth bypass flag",
      validate: (v) =>
        v === "true" && process.env.NODE_ENV === "production"
          ? "DANGER: DEV_BYPASS_AUTH=true in production!"
          : null,
    },
    {
      name: "UNIFIER_MOCK",
      key: "UNIFIER_MOCK",
      required: false,
      description: "Use mock Unifier data instead of live API (recommended for local + dev until credentials resolved)",
      validate: (v) => {
        if (v === "true") return null; // Mock enabled — pass
        return null;
      },
    },
    {
      name: "RESEND_API_KEY",
      key: "RESEND_API_KEY",
      required: false,
      description: "Resend API key for invite emails (required in dev/prod for real delivery)",
      validate: (v) =>
        v?.startsWith("re_YOUR") ? "Still placeholder — get key from resend.com" : null,
    },
    {
      name: "EMAIL_FROM",
      key: "EMAIL_FROM",
      required: false,
      description: "From address for emails — must use a Resend-verified domain (e.g. noreply@cp-command-center.com)",
    },
    {
      name: "APP_ENV",
      key: "APP_ENV",
      required: false,
      description: "Set to 'dev' on Railway dev to enable DevTools (NODE_ENV=production there)",
    },
  ];

  return checks.map(({ name, key, required, description, validate }) => {
    const value = process.env[key];
    const isSet = value !== undefined && value !== "";

    if (!isSet) {
      // UNIFIER_PASSWORD not needed when mock is enabled
      if (key === "UNIFIER_PASSWORD" && process.env.UNIFIER_MOCK === "true") {
        return { name, pass: true, detail: "Not set — OK when UNIFIER_MOCK=true" };
      }
      return {
        name,
        pass: !required,
        warning: !required,
        detail: required ? `Missing — ${description}` : `Not set (optional) — ${description}`,
      };
    }

    const validationError = validate?.(value);
    if (validationError) {
      return {
        name,
        pass: false,
        warning: true,
        detail: validationError,
      };
    }

    // Mask the actual value but show it's set
    let masked: string;
    if (key.toLowerCase().includes("password") || key.toLowerCase().includes("secret")) {
      masked = `Set (${value.length} chars)`;
    } else if (key === "DATABASE_URL") {
      masked = `Set — ${value.replace(/:[^:@]+@/, ":***@")}`;
    } else if (key === "UNIFIER_MOCK" && value === "true") {
      masked = "Using mock data (no API credentials required)";
    } else {
      masked = `Set — ${value}`;
    }

    return { name, pass: true, detail: masked };
  });
}

export async function GET() {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const [dbResults, envResults] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkEnvVars()),
  ]);

  return NextResponse.json({
    db: dbResults,
    env: envResults,
    timestamp: new Date().toISOString(),
  });
}
