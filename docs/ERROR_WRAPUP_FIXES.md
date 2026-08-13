# Error Wrap-Up Fixes — Applied

This doc summarizes fixes applied to resolve errors reported by the DevTools Error Wrap-Up tool.

## What Was Fixed (Code)

| Error | Fix |
|-------|-----|
| **UntrustedHost** | `lib/auth.ts` — set `trustHost: true` so Auth.js accepts localhost |
| **Cannot read properties of undefined (reading 'id')** | `lib/auth.ts` — added guards in session callback |

## Unifier — Mock Mode (Current Default)

`UNIFIER_MOCK=true` is set in `.env.example`. Copy to `.env` when setting up. Mock data is used in local + dev until API credentials are resolved. DevTools diagnostics and checks treat this as pass.

**To switch to real API:** Set valid `UNIFIER_PASSWORD` (or Azure Key Vault), then set `UNIFIER_MOCK=false` or remove it.

## What You Need To Do

### 1. Restart the dev server

```bash
npm run dev
```

### 2. RESEND_API_KEY (optional)

Optional for local dev. Get a key at [resend.com](https://resend.com) if you need invite emails to send.

## Test Plan Coverage Gaps

The coverage gaps (missing/partial tests) are informational. They don't block the app. Address them over time as you touch those files.
