# Architecture — CP Build Command Center

> **Agent instruction:** Load this instead of scanning the full codebase. Only open source files when you need to read or modify specific logic.

## Tech Stack (Quick Reference)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 16 (App Router) | webpack build; Turbopack opt-in for dev only |
| Language | TypeScript 5 strict mode | No `any` — use `unknown` if truly untyped |
| Styling | Tailwind CSS 4 + CSS custom properties | All values via design tokens, never hardcoded |
| Font | Inter (next/font/google) | |
| Auth | Auth.js v5 beta (`next-auth`) | Credentials provider, JWT strategy |
| Database | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` | Requires adapter; no direct connection string in schema |
| Email | Resend (Mailpit captured in dev) | |
| Validation | Zod 4 | Shared schemas used on both server and client |
| PWA | `@ducanh2912/next-pwa` | Generates `public/sw.js` at build; disabled in dev |
| i18n | next-intl | EN + ES, locale-prefixed routing (`/en/...`, `/es/...`) |
| Testing | Vitest + React Testing Library + Playwright | |
| Deployment | Railway (dev + prod) + Supabase (PostgreSQL) | |

## Route Architecture (App Router)

```
app/
  [locale]/                        ← All pages locale-prefixed (en | es)
    (auth)/                        ← Public, no session required
      login/                       → /en/login
      invite/[token]/              → /en/invite/<token>
    (dashboard)/                   ← Protected: global sidebar + TopBar
      layout.tsx                   ← Auth guard here (redirects if no session)
      page.tsx                     → /en  (dashboard home, 6 module cards)
      projects/                    → /en/projects
      users/                       → /en/users
      settings/                    → /en/settings
    (project)/                     ← Protected: project-scoped layout
      projects/[id]/               → /en/projects/<id>
        page.tsx                   → Project overview (stats + UPM link)
        units/                     → Unit cards (mobile) + Unit Detail Modal
        upm/                       → Full UPM spreadsheet
        install/                   → Install Manager view (placeholder)
        sov/                       → Schedule of Values (placeholder)
        layout.tsx                 ← ProjectTopBar + ProjectSideNav + ProjectMobileBottomNav
  api/
    site-tour/                     → GET /api/site-tour (bilingual hardcoded walkthrough steps)
    ...                            ← All other API routes (no locale prefix)
```

## Authentication & Authorization Flow

```
Request
  → proxy.ts (Next.js 16 middleware)
      → next-intl locale detection + redirect
      → session presence check → redirect to /[locale]/login if missing
  → Route handler / Server Component
      → auth() from lib/auth.ts → returns session or null
      → hasPermission(session.user.role, PERMISSIONS.XXX) from lib/permissions.ts
      → 401 if no session, 403 if insufficient permission
      → business logic
```

**Key caveat:** `proxy.ts` handles redirect only. It does NOT enforce authorization. All `hasPermission()` calls must be inside the route handler or server action.

**JWT shape:**
```typescript
session.user = {
  id: string,
  email: string,
  name: string | null,
  role: string,   // "ADMIN" | "MEMBER" | "DEVELOPER" | "DESIGNER" | "EXECUTIVE" | etc.
                  // Full list in lib/permissions.ts:ROLE_PERMISSIONS
}
```
Role is embedded in JWT at sign-in. Role changes require re-login.

**`DEVELOPER` role:** A non-admin role with read access to team, projects, and dashboard. Has DevTools access in dev environments. Used for engineers who need visibility but not admin write permissions.

**Login security:** `failedLoginAttempts` and `lockedUntil` tracked on `User` model. Account locks after repeated failures.

## Data Flow

```
Client Component
  → fetch("/api/...")   ← always authenticated via session cookie
  → app/api/.../route.ts
      → auth() → hasPermission()
      → Zod validation on request body
      → lib/db.ts (Prisma singleton) → PostgreSQL (Supabase)
      → Response JSON
  ← Client re-renders
```

For server components, Prisma is called directly (no fetch). Auth is still checked via `auth()`.

## Prisma Singleton Pattern

```typescript
// lib/db.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const db = new PrismaClient({ adapter });
```

**Critical:** Prisma 7 requires a driver adapter — do NOT remove it. Use array-form `$transaction([...])` — interactive transactions are incompatible with Railway's PgBouncer.

## i18n Pattern

```typescript
// Server component
import { getTranslations } from "next-intl/server";
const t = await getTranslations("projects");
t("addRow");

// Client component
import { useTranslations } from "next-intl";
const t = useTranslations("projects");
t("addRow");

// Navigation (always use these — preserves locale)
import { Link, useRouter, usePathname } from "@/i18n/navigation";
```

All strings live in `messages/en.json` and `messages/es.json`, namespaced by feature.

## Unifier Integration

- `lib/unifier/client.ts` — fetches paginated rows from Oracle Primavera Unifier PDS API
- `lib/unifier/service.ts` — `getProjects()`, `getProjectByPid()`, `mapUnifierStatus()`
- `UNIFIER_MOCK=true` in dev/local → uses safe placeholder data, no credentials
- `UNIFIER_BASE_URL` + `UNIFIER_PASSWORD` needed in production

## PWA & Offline

- Service worker generated at `npm run build` → `public/sw.js` (gitignored)
- `OfflinePreference` model stores per-user module selections
- `components/shared/OfflineIndicator.tsx` — `aria-live="assertive"` when offline
- Offline snapshot API at `GET /api/offline/snapshot`

## Known Caveats

1. **`proxy.ts` not `middleware.ts`** — Next.js 16 renamed the middleware entry point.
2. **Prisma adapter required** — `PrismaPg` adapter must be passed; no direct URL in schema.
3. **JWT bracket notation** — Auth.js v5 module augmentation is unreliable; use `token["role"]`.
4. **`AUTH_TRUST_HOST=true`** required on Railway/Vercel or sessions are rejected behind proxy IPs.
5. **Webpack only for PWA** — `@ducanh2912/next-pwa` is incompatible with Turbopack; never use `npm run dev:turbo` for PWA work.
6. **PrismaAdapter cast** — `@auth/prisma-adapter` and `next-auth` have minor version skew; adapter is cast to `any` in `lib/auth.ts` — runtime is fine.
