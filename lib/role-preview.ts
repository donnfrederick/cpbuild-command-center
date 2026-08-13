/**
 * Role Preview utilities.
 *
 * ADMIN, DESIGNER, and DEVELOPER can temporarily overlay any role on their own
 * session to verify role-specific UI gating, nav items, and permission-controlled
 * features without impersonating another user.
 *
 * State is carried in a signed HttpOnly cookie (`cc-role-preview`). Only the
 * `role` field in the effective session is changed — the real user's id, email,
 * and name are preserved. API routes using `getSession()` always see the real
 * role, so write operations are always attributed to the actor's true role.
 *
 * Masquerade takes precedence: if a masquerade cookie is also active,
 * role preview is ignored entirely (see getEffectiveSession in lib/masquerade.ts).
 */

export const ROLE_PREVIEW_COOKIE = "cc-role-preview";
const ROLE_PREVIEW_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RolePreviewPayload {
  /** The real user's ID — validated in getEffectiveSession to prevent replay across accounts. */
  actorId: string;
  /** The role code being previewed (e.g. "MEMBER", "PROJECT_MANAGER"). */
  previewRole: string;
  /** Issued-at unix timestamp (seconds). */
  iat: number;
}

export interface RolePreviewContext {
  /** The user's actual role before preview. */
  realRole: string;
  /** The role currently being previewed. */
  previewRole: string;
}

// ─── Cookie signing (mirrors lib/masquerade.ts) ───────────────────────────────

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
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Serialise a RolePreviewPayload into a signed cookie value.
 * Format: `<base64url(JSON)>.<base64url(HMAC-SHA256 signature)>`
 */
export async function signRolePreviewCookie(payload: RolePreviewPayload): Promise<string> {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const sig = await hmacSign(encoded, getSecret());
  return `${encoded}.${sig}`;
}

/**
 * Parse and verify a role preview cookie value.
 * Returns the payload, or null if the value is missing, malformed, or has an invalid signature.
 */
export async function parseRolePreviewCookie(value: string): Promise<RolePreviewPayload | null> {
  try {
    const dotIdx = value.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const encoded = value.slice(0, dotIdx);
    const sig = value.slice(dotIdx + 1);
    const valid = await hmacVerify(encoded, sig, getSecret());
    if (!valid) return null;
    const payload = JSON.parse(base64urlDecode(encoded)) as RolePreviewPayload;
    if (
      typeof payload.actorId !== "string" ||
      typeof payload.previewRole !== "string" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    // Belt-and-suspenders expiry check beyond cookie maxAge
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
    if (ageSeconds > ROLE_PREVIEW_MAX_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Cookie header builders ───────────────────────────────────────────────────

/**
 * Build the Set-Cookie header string for starting a role preview session.
 * Uses the Secure flag in production.
 */
export function buildRolePreviewCookieHeader(signedValue: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const parts = [
    `${ROLE_PREVIEW_COOKIE}=${signedValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ROLE_PREVIEW_MAX_AGE_SECONDS}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Build the Set-Cookie header string for clearing the role preview cookie.
 */
export function clearRolePreviewCookieHeader(): string {
  return `${ROLE_PREVIEW_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
