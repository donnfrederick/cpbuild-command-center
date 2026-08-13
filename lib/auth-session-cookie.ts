/**
 * Auth.js v5 stores the JWT session in `authjs.session-token` (HTTP dev) or
 * `__Secure-authjs.session-token` (HTTPS). Large tokens are split into chunked
 * cookies: `…session-token.0`, `…session-token.1`, etc.
 */
const AUTHJS_SESSION_COOKIE = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?$/;

export function hasAuthJsSessionCookie(cookies: Iterable<{ name: string }>): boolean {
  for (const { name } of cookies) {
    if (AUTHJS_SESSION_COOKIE.test(name)) return true;
  }
  return false;
}
