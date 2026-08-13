/**
 * Password reset token utilities.
 *
 * Security model:
 * - The plaintext token (32 random bytes as hex) travels in the email link only.
 * - We store only the SHA-256 hash in the DB. A DB breach cannot be used to
 *   generate valid reset links.
 * - Tokens expire after 72 hours and are single-use (usedAt is set on redemption).
 * - Requesting a new reset invalidates all prior tokens for the same user.
 * - Rate limit: max 3 reset requests per email per hour (enforced in the API route).
 */

import crypto from "crypto";

export const PASSWORD_RESET_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72 hours — matches admin reset links
/** @deprecated Use PASSWORD_RESET_EXPIRY_MS — kept for existing imports. */
export const RESET_TOKEN_EXPIRY_MS = PASSWORD_RESET_EXPIRY_MS;
export const ADMIN_RESET_EXPIRY_MS = PASSWORD_RESET_EXPIRY_MS;
export const MAX_RESETS_PER_HOUR = 3;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Generate a cryptographically secure 32-byte token as a hex string. */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Hash a plaintext token for safe DB storage. */
export function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * When true, the reset-password page should sign out this browser before showing the form.
 * Avoids blocking users whose email client opens the link in a profile that was already logged in.
 * (Clears JWT cookie for this browser only — not all devices.)
 */
export function shouldSignOutBeforeResetForm(
  hasSession: boolean,
  isExpiredOrUsed: boolean
): boolean {
  return hasSession && !isExpiredOrUsed;
}
