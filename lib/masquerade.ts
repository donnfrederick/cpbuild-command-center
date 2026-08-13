/**
 * Masquerade (user impersonation) utilities.
 *
 * ADMIN can temporarily overlay a target user's identity on the UI.
 * State is carried in a signed HttpOnly cookie (`cc-masquerade`). The real
 * JWT session is unchanged — the overlay only affects `getEffectiveSession()`
 * which is used by server-component layouts and pages to render UI.
 *
 * Most mutation routes use `getSession()` so writes stay attributed to the
 * real signed-in user. Strict-production **structural** project mutations consult
 * `getEffectiveSession().masquerade` via `enforceProductionProjectMutation`.
 * Field notes (observations/issues) use `enforceProductionFieldNotesMutation` —
 * ADMIN may post on live projects without masquerade.
 * **User-scoped reads** that must match the dashboard UI — e.g. `GET /api/notifications`
 * and mark-read — use `getEffectiveSession()` so masquerade shows the target user's
 * notifications, not the actor's. The MasqueradeLog table records the window for audit.
 */

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import { resolveAuthoritativeUserSession } from "@/lib/session-user-resolution";
import {
  ROLE_PREVIEW_COOKIE,
  parseRolePreviewCookie,
  type RolePreviewContext,
} from "@/lib/role-preview";

// ─── Constants ──────────────────────────────────────────────────────────────

export const MASQUERADE_COOKIE = "cc-masquerade";
const MASQUERADE_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MasqueradePayload {
  /** The ADMIN's real user ID. */
  actorId: string;
  /** The user being impersonated. */
  targetUserId: string;
  /** The MasqueradeLog row ID for audit trail updates. */
  logId: string;
  /** Issued-at unix timestamp (seconds). */
  iat: number;
}

export interface MasqueradeContext {
  actorId: string;
  actorEmail: string;
  actorName: string | null;
  actorRole: string;
  targetUserId: string;
  targetUserName: string | null;
  targetUserEmail: string;
  targetUserRole: string;
  logId: string;
}

export interface EffectiveSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    specialPermissions?: string[];
  };
  /** Non-null when the ADMIN is actively masquerading as another user. */
  masquerade: MasqueradeContext | null;
  /**
   * Non-null when the user is previewing the dashboard as a different role.
   * Only present when masquerade is null — masquerade takes precedence.
   * UI elements should use this to render the RolePreviewBanner.
   */
  rolePreview: RolePreviewContext | null;
}

/**
 * Role for write authorization on mutation routes.
 * Masquerade: target user's role (unchanged). Role preview: actor's real role, not overlay.
 */
export function writeAuthorizationRole(effective: EffectiveSession): string {
  if (effective.masquerade) {
    return effective.user.role;
  }
  if (effective.rolePreview) {
    return effective.rolePreview.realRole;
  }
  return effective.user.role;
}

/**
 * Actor's real role for strict-production guards — never role-preview overlay or masquerade target.
 */
export function productionGuardActorRole(effective: EffectiveSession): string {
  if (effective.masquerade) {
    return effective.masquerade.actorRole;
  }
  if (effective.rolePreview) {
    return effective.rolePreview.realRole;
  }
  return effective.user.role;
}

export function productionGuardSession(
  effective: EffectiveSession
): { user: { role: string } } {
  return { user: { role: productionGuardActorRole(effective) } };
}

/** User id to attribute activity logs — masquerade actor when impersonating. */
export function activityLogActorId(effective: EffectiveSession): string {
  return effective.masquerade?.actorId ?? effective.user.id;
}

// ─── Cookie signing ───────────────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing auth secret: set AUTH_SECRET or NEXTAUTH_SECRET");
  return secret;
}

function base64urlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padding), "base64").toString("utf8");
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

async function hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(payload, secret);
  if (expected.length !== signature.length) return false;
  // Constant-time comparison
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Serialise a MasqueradePayload into a signed cookie value.
 * Format: `<base64url(JSON)>.<base64url(HMAC-SHA256 signature)>`
 */
export async function signMasqueradeCookie(payload: MasqueradePayload): Promise<string> {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(encoded, getSecret());
  return `${encoded}.${sig}`;
}

/**
 * Parse and verify a masquerade cookie value.
 * Returns the payload, or null if the value is missing, malformed, or has an invalid signature.
 */
export async function parseMasqueradeCookie(value: string): Promise<MasqueradePayload | null> {
  try {
    const dotIdx = value.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = value.slice(0, dotIdx);
    const sig = value.slice(dotIdx + 1);
    const valid = await hmacVerify(encoded, sig, getSecret());
    if (!valid) return null;
    const payload = JSON.parse(base64urlDecode(encoded)) as MasqueradePayload;
    if (
      typeof payload.actorId !== "string" ||
      typeof payload.targetUserId !== "string" ||
      typeof payload.logId !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ─── Session overlay ──────────────────────────────────────────────────────────

/**
 * Returns the effective session for server components and layouts.
 *
 * When a valid masquerade cookie is present and the cookie's actorId matches
 * the real session's user.id, the target user's identity is overlaid on the
 * returned `user` object. The `masquerade` field is populated with context
 * about both actor and target so the MasqueradeBanner can render correctly.
 *
 * When masquerade is not active, this behaves identically to `getSession()`.
 */
export async function getEffectiveSession(): Promise<EffectiveSession | null> {
  const realSession = await getSession();
  if (!realSession?.user) return null;

  // Try to read cookies — throws outside of a request context (e.g. tests)
  let jar: Awaited<ReturnType<typeof cookies>> | null = null;
  try {
    jar = await cookies();
  } catch {
    return { user: realSession.user, masquerade: null, rolePreview: null };
  }

  // ── Masquerade layer (highest priority) ────────────────────────────────────
  const masqueradeCookieValue = jar.get(MASQUERADE_COOKIE)?.value;

  if (masqueradeCookieValue) {
    const payload = await parseMasqueradeCookie(masqueradeCookieValue);

    if (payload && payload.actorId === realSession.user.id) {
      const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
      if (ageSeconds <= MASQUERADE_MAX_AGE_SECONDS) {
        let targetUser: { id: string; email: string; name: string | null; role: { code: string } } | null = null;
        try {
          targetUser = await db.user.findUnique({
            where: { id: payload.targetUserId },
            select: { id: true, email: true, name: true, role: { select: { code: true } } },
          });
        } catch {
          // DB error — fall through to real session
        }

        if (targetUser) {
          // Fetch target user's special permissions so the masquerade view
          // accurately reflects what that user can actually do.
          const targetSpecialPerms = await fetchUserSpecialPermissions(targetUser.id);

          const masquerade: MasqueradeContext = {
            actorId: realSession.user.id,
            actorEmail: realSession.user.email,
            actorName: realSession.user.name ?? null,
            actorRole: realSession.user.role,
            targetUserId: targetUser.id,
            targetUserName: targetUser.name,
            targetUserEmail: targetUser.email,
            targetUserRole: targetUser.role.code,
            logId: payload.logId,
          };

          return {
            user: {
              id: targetUser.id,
              email: targetUser.email,
              name: targetUser.name,
              role: targetUser.role.code,
              specialPermissions: targetSpecialPerms,
            },
            masquerade,
            rolePreview: null, // masquerade takes precedence; role preview is suppressed
          };
        }
      }
    }
  }

  // ── Role preview layer (lower priority, only when masquerade is inactive) ──
  const rolePreviewCookieValue = jar.get(ROLE_PREVIEW_COOKIE)?.value;

  if (rolePreviewCookieValue) {
    const rpPayload = await parseRolePreviewCookie(rolePreviewCookieValue);

    if (rpPayload && rpPayload.actorId === realSession.user.id) {
      const resolved = await resolveAuthoritativeUserSession({
        id: realSession.user.id,
        email: realSession.user.email,
        role: realSession.user.role,
      });

      const rolePreview: RolePreviewContext = {
        realRole: resolved.role,
        previewRole: rpPayload.previewRole,
      };

      return {
        user: {
          ...realSession.user,
          id: resolved.id,
          role: rpPayload.previewRole,
          specialPermissions: resolved.specialPermissions,
        },
        masquerade: null,
        rolePreview,
      };
    }
  }

  // ── No overlay active — DB-authoritative id, role, and special permissions ──
  //
  // Special permissions and role are intentionally excluded from the JWT (to
  // avoid stale/bloated tokens — see lib/auth.ts). Both are loaded here on
  // every request so admin role/permission changes take effect on refresh
  // without a sign-out cycle. Stale-ID heal (email lookup after migrate reset)
  // lives in resolveAuthoritativeUserSession().
  const resolved = await resolveAuthoritativeUserSession({
    id: realSession.user.id,
    email: realSession.user.email,
    role: realSession.user.role,
  });

  return {
    user: { ...realSession.user, ...resolved },
    masquerade: null,
    rolePreview: null,
  };
}

// ─── Cookie helpers for API routes ───────────────────────────────────────────

/**
 * Build the Set-Cookie header string for starting a masquerade session.
 * Uses the Secure flag in production.
 */
export function buildMasqueradeCookieHeader(signedValue: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${MASQUERADE_COOKIE}=${signedValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MASQUERADE_MAX_AGE_SECONDS}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build the Set-Cookie header string for clearing the masquerade cookie.
 */
export function clearMasqueradeCookieHeader(): string {
  return `${MASQUERADE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
