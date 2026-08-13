# Unifier API Setup

How to set and verify Unifier credentials securely.

**Current default:** `UNIFIER_MOCK=true` — mock data is used in local + dev until API credentials are resolved.

## Where to Set the Password

| Environment | Where | Variable |
|-------------|-------|----------|
| **Local dev** | `.env` in project root | `UNIFIER_PASSWORD="your-password"` |
| **Railway** | Project → Variables | Add `UNIFIER_PASSWORD` |
| **Production (Azure)** | Key Vault | Secret `unifier-password`; set `AZURE_KEYVAULT_URL` |

## Quick Check (Secure)

```bash
npm run unifier:check
```

Shows whether the password is set and from where (env vs Key Vault). Never prints the full value — only a masked hint (e.g. `Ge********1`).

## Verify Connection

1. Start the app: `npm run dev`
2. Open DevTools (purple icon) → **Debugger** tab
3. The Unifier connectivity check runs automatically

Or hit the test endpoint (dev only):

```bash
curl http://localhost:3002/api/devtools/unifier-test
```

Returns `passwordSource` and `passwordMasked` — never the raw password.

**If you get "Internal Server Error":** The dev server may be in a stale state. Restart with a clean cache:

```bash
rm -rf .next && npm run dev
```

## Required Variables

| Variable | Local | Production |
|----------|-------|------------|
| `UNIFIER_BASE_URL` | `.env` | Railway / Key Vault config |
| `UNIFIER_USERNAME` | `.env` (default: Coadmin) | Same |
| `UNIFIER_PASSWORD` | `.env` | Railway Variables or Key Vault |

## Security

- `.env` is gitignored — never commit it
- DevTools diagnostics show "Set (X chars)" for passwords, never the value
- The unifier-test endpoint returns a masked hint only
