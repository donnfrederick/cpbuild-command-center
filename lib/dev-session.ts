/**
 * Shared dev bypass session.
 *
 * Used by every page/layout when DEV_BYPASS_AUTH=true (local dev only).
 * When no DB persona applies, `DEV_USER_ROLE` sets the synthetic dev-user’s role
 * (defaults to ADMIN). When `DEV_BYPASS_USER_EMAIL` or the persona cookie resolves
 * to a user row, **role comes from the database**, not `DEV_USER_ROLE`.
 *
 * **Real user in bypass (recommended):** set `DEV_BYPASS_USER_EMAIL` to an email
 * that exists in your local DB. The session uses that row’s id, name, and role so
 * feedback assignees, “My items”, @mentions, and account UI stay consistent.
 * If unset or the user is missing, the synthetic `dev-user` id is used (no DB row).
 *
 * **Per-browser override:** `/api/dev-switch-user?email=…` sets `cc-dev-persona`
 * (wins over `DEV_BYPASS_USER_EMAIL`). `?reset=1` clears it.
 *
 * Valid DEV_USER_ROLE values (matches RoleCode in lib/permissions.ts):
 *   ADMIN | TEAM_LEAD | DESIGNER | MEMBER | PRODUCT
 *   DEVELOPER | EXECUTIVE | CONTROLS_MANAGER | INSTALL_MANAGER
 *   PROJECT_MANAGER | PROJECT_COORDINATOR
 */

// Derived from ROLE_PERMISSIONS so it stays in sync whenever a new role is added.
import { ROLE_PERMISSIONS } from "@/lib/permissions";
const VALID_ROLES = new Set(Object.keys(ROLE_PERMISSIONS));

export const DEV_PERSONA_COOKIE = "cc-dev-persona";

/** Normalized `DEV_BYPASS_USER_EMAIL`; exported for unit tests. */
export function readDevBypassUserEmailEnv(): string | null {
  let t = process.env.DEV_BYPASS_USER_EMAIL?.trim();
  if (!t) return null;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1).trim();
  }
  return t.length > 0 ? t : null;
}

type DevPersonaRow = {
  id: string;
  email: string;
  name: string | null;
  role: { code: string };
};

function sessionFromDbPersona(dbUser: DevPersonaRow) {
  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role.code,
      specialPermissions: [] as string[],
    },
  };
}

async function loadDevPersonaByEmail(email: string): Promise<DevPersonaRow | null> {
  const { db } = await import("@/lib/db");
  const trimmed = email.trim();
  // Exact match first (fast path), then case-insensitive — local DB email may differ in casing.
  const exact = await db.user.findUnique({
    where: { email: trimmed },
    select: { id: true, email: true, name: true, role: { select: { code: true } } },
  });
  if (exact) return exact;
  return db.user.findFirst({
    where: { email: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: { select: { code: true } } },
  });
}

function resolveDevRole(): string {
  const envRole = process.env.DEV_USER_ROLE;
  if (envRole && VALID_ROLES.has(envRole)) return envRole;
  return "ADMIN";
}

/** Returns the bypass session in dev; calls real auth() in production. */
export async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production";
  if (isBypass) {
    // Check for a per-browser persona override (set by /api/dev-switch-user).
    // This lets multiple people use the same local server with different identities.
    try {
      const { cookies } = await import("next/headers");
      const jar = await cookies();
      const personaEmail = jar.get(DEV_PERSONA_COOKIE)?.value?.trim();
      if (personaEmail) {
        const dbUser = await loadDevPersonaByEmail(personaEmail);
        if (dbUser) return sessionFromDbPersona(dbUser);
        console.warn(
          `[dev-session] cc-dev-persona cookie="${personaEmail}" — no User with that email; trying DEV_BYPASS_USER_EMAIL or synthetic dev-user.`
        );
      }
    } catch {
      // Outside request context (e.g. tests) — fall through to default
    }

    const envEmail = readDevBypassUserEmailEnv();
    if (envEmail) {
      try {
        const dbUser = await loadDevPersonaByEmail(envEmail);
        if (dbUser) return sessionFromDbPersona(dbUser);
        console.warn(
          `[dev-session] DEV_BYPASS_USER_EMAIL="${envEmail}" — no User row matches (check Users in app or Prisma Studio). Using synthetic dev-user / dev@cpbuild.com.`
        );
      } catch {
        // DB unavailable in some test contexts — fall through to synthetic user
      }
    }

    // Fallback: synthetic id (no DB row) — assignee / "My items" will not match real users
    return {
      user: {
        id: "dev-user",
        name: "Dev User",
        email: "dev@cpbuild.com",
        role: resolveDevRole(),
        specialPermissions: [] as string[],
      },
    };
  }
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  // Normalize legacy SUPER_ADMIN JWT sessions → ADMIN so all downstream role
  // checks (role === "ADMIN", roleBadgeVariant, isAdminRole, etc.) work
  // correctly during the transition period before tokens expire/refresh.
  if (session?.user && (session.user as { role?: string }).role === "SUPER_ADMIN") {
    return {
      ...session,
      user: { ...session.user, role: "ADMIN" },
    };
  }
  return session;
}
