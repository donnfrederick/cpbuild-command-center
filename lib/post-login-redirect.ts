/**
 * Path used for a full document navigation after credentials sign-in.
 * Open redirect hardening: only same-origin relative paths (leading single `/`).
 */
export function postLoginRedirectPath(callbackUrl: string | null): string {
  const fallback = "/";
  if (callbackUrl == null || callbackUrl === "") return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(callbackUrl.trim());
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  return decoded;
}
