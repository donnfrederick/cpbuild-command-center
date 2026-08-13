/**
 * Utility helpers for bootstrap scripts.
 * Kept in a separate file so they can be imported and tested without
 * pulling in Prisma or other heavy runtime dependencies.
 */

/** Returns true when the credential matches the exact placeholder value from .env.example. */
export function isPlaceholderCredential(
  email: string | undefined,
  password: string | undefined
): boolean {
  return email === "admin@yourdomain.com" || password === "replace-with-a-strong-password";
}
