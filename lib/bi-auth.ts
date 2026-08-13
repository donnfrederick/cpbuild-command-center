/**
 * BI API key authentication for /api/bi/v1/* routes.
 *
 * Keys are formatted as `cc_bi_<random-hex>`. The raw key is shown once at
 * creation and never stored — only the SHA-256 hash is persisted in `api_keys`.
 *
 * Usage in a route handler:
 *   const keyCtx = await validateBiKey(request);
 *   if (!keyCtx) return new Response("Unauthorized", { status: 401 });
 *   if (!requireScope(keyCtx, "bi:projects"))
 *     return new Response("Forbidden", { status: 403 });
 */

import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { ApiKeyParty } from "@prisma/client";
import type { BiScope } from "@/lib/bi-scopes";

export { BI_SCOPES } from "@/lib/bi-scopes";
export type { BiScope } from "@/lib/bi-scopes";

export interface BiKeyContext {
  keyId: string;
  name: string;
  scopes: string[];
  allowedProjectIds: string[];
  party: ApiKeyParty;
}

/**
 * Generates a new API key pair.
 * @returns `{ rawKey, keyHash, keyPrefix }` — store only hash + prefix; give rawKey to the user once.
 */
export function generateApiKey(): {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
} {
  const raw = `cc_bi_${randomBytes(24).toString("hex")}`;
  // SHA-256 is appropriate here: we are hashing a high-entropy random token
  // (192 bits of randomness), not a password. Slow algorithms like bcrypt/argon2
  // are designed for low-entropy secrets; they add no security benefit when the
  // secret already has 2^192 search space. CodeQL flagging this as "weak hashing"
  // is a false positive for this use case.
  const hash = createHash("sha256").update(raw).digest("hex"); // codeql[js/insufficient-password-hash]
  const prefix = raw.slice(0, 16);
  return { rawKey: raw, keyHash: hash, keyPrefix: prefix };
}

/**
 * Hashes a raw key for DB lookup — same algorithm used at creation.
 * SHA-256 is appropriate for high-entropy random tokens (not passwords).
 */
function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex"); // codeql[js/insufficient-password-hash]
}

/**
 * Validates the Bearer token from the Authorization header.
 * Returns the key context on success, or null if invalid/expired/revoked.
 *
 * Updates `lastUsedAt` fire-and-forget — callers do not need to await this.
 */
export async function validateBiKey(request: Request): Promise<BiKeyContext | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith("cc_bi_")) return null;

  const hash = hashKey(rawKey);

  const key = await db.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      name: true,
      scopes: true,
      allowedProjectIds: true,
      party: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
    },
  });

  if (!key) return null;
  if (key.revokedAt) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Throttle lastUsedAt writes: only update if > 5 minutes since last write.
  // BI tools that paginate/poll would otherwise hammer the DB with writes on every page.
  const FIVE_MIN_MS = 5 * 60 * 1000;
  const shouldUpdate = !key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > FIVE_MIN_MS;
  if (shouldUpdate) {
    db.apiKey
      .update({ where: { keyHash: hash }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return {
    keyId: key.id,
    name: key.name,
    scopes: key.scopes,
    allowedProjectIds: key.allowedProjectIds,
    party: key.party,
  };
}

/**
 * Checks whether a key context includes the required scope.
 * Returns true if the scope is present, false otherwise.
 */
export function requireScope(ctx: BiKeyContext, scope: BiScope): boolean {
  return ctx.scopes.includes(scope);
}

/**
 * Checks whether the key is allowed to access the given project.
 * If `allowedProjectIds` is empty, all projects are allowed.
 */
export function isProjectAllowed(ctx: BiKeyContext, projectId: string): boolean {
  if (ctx.allowedProjectIds.length === 0) return true;
  return ctx.allowedProjectIds.includes(projectId);
}

/**
 * Standard CORS + cache headers for all BI API responses.
 * Power BI Web connector requires CORS headers.
 */
export function biResponseHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}
