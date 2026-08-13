# Code Audit Report

**Date:** February 2025  
**Scope:** Security, accessibility, PWA/offline, unit tests, E2E tests

---

## Executive Summary

The codebase is well-structured with strong security practices, good accessibility patterns, and a solid PWA setup. This audit addressed gaps in test coverage, added an E2E test plan visualizer, and documented findings.

---

## 1. Security ✅

| Area | Status | Notes |
|------|--------|-------|
| **Secrets** | ✅ | No hardcoded secrets; env vars + Azure Key Vault |
| **Auth** | ✅ | Server-side session checks; DEV_BYPASS_AUTH blocked in production |
| **SQL Injection** | ✅ | Prisma ORM; raw SQL uses parameterized queries |
| **XSS** | ✅ | Zod validation; single `dangerouslySetInnerHTML` (design tokens, validated) |
| **Permissions** | ✅ | `hasPermission()` enforced on all protected routes |
| **Input Validation** | ✅ | Zod schemas on all user inputs |

**Recommendation:** Consider explicit CSRF tokens if expanding to cross-origin API calls.

---

## 2. Accessibility ✅

| Area | Status | Notes |
|------|--------|-------|
| **ARIA** | ✅ | `aria-live`, `aria-label`, `aria-current`, `role="dialog"` |
| **Focus** | ✅ | `:focus-visible` styles; `autoFocus` on modal inputs |
| **Skip Link** | ✅ | `SkipLink` → `#main-content`; E2E test verifies presence |
| **Route Announcer** | ✅ | Announces route changes for screen readers |
| **Form Errors** | ✅ | `role="alert"`, `aria-invalid`, `aria-describedby` |

**Recommendation:** Add `aria-label` to icon-only buttons (e.g., delete, refresh).

---

## 3. PWA / Offline ✅

| Area | Status | Notes |
|------|--------|-------|
| **Manifest** | ✅ | `public/manifest.json`; name, icons, display, theme |
| **Service Worker** | ✅ | `@ducanh2912/next-pwa`; Workbox runtime caching |
| **Offline Detection** | ✅ | `useOfflineStatus` hook; `OfflineIndicator` component |
| **Caching** | ✅ | NetworkFirst for API; CacheFirst for static assets |
| **Offline Preferences** | ✅ | User-selectable modules; snapshot API |

---

## 4. Unit / Integration Test Coverage ✅

### Coverage Config
- **Thresholds:** lines 70%, functions 70%, branches 48%
- **Included:** `lib/**`, `components/**` (selected), `app/api/**`, `hooks/**`
- **Excluded:** Auth, devtools, complex UI (CreateProjectModal, ProjectsTable, ProjectDetailView)

### Tests Added (this audit)
- `__tests__/integration/lookups.integration.test.ts` — GET /api/lookups (401, 200)
- `__tests__/integration/projects-units.integration.test.ts` — GET/PATCH units (401, 403, 404, 200)

### Coverage Scope
- **lookups** — 93% statements, 100% lines
- **projects/[id]/units** — 95% statements, 100% lines
- **projects/[id]/units/[rowId]** — 90% statements, 96% lines

---

## 5. E2E Test Plan ✅

### New Dev Tool Tab
- **Test Plan** → **E2E** sub-tab shows:
  - User flow coverage (health, auth, invite, PWA, accessibility, projects, team, offline)
  - Spec files and their test blocks
  - Total E2E test count

### API
- `GET /api/devtools/e2e-test-plan` — Parses `e2e/*.spec.ts`; returns flows + spec entries

### Playwright
- **Port:** Default `BASE_URL` updated to `http://localhost:3002` (matches `npm run dev`)
- **Script:** `npm run test:e2e:local` — runs against local dev server

### Current E2E Coverage
- `e2e/smoke.spec.ts` — Health, auth redirect, login form, skip link, invite 404, PWA manifest
- **Gaps:** Full CRUD flows (projects, team), offline flows

---

## 6. Dead / Old Code

- No TODO/FIXME/HACK comments in source
- `design-tokens.css` — may be legacy (tokens live in `globals.css`)
- `lib/unifier/mock-data.ts` — used when `UNIFIER_MOCK=true`

---

## 7. Recommendations

### High Priority
1. **E2E flows:** Add Playwright specs for login → create project → edit → delete
2. **E2E flows:** Add team management (invite, accept, remove)
3. **E2E flows:** Add offline mode (navigator.onLine mock, cache behavior)

### Medium Priority
1. **Accessibility:** Add `aria-label` to icon-only buttons
2. **Color contrast:** Verify WCAG AA/AAA with tools (e.g., axe DevTools)

### Low Priority
1. **Deprecated packages:** Update npm packages with deprecation warnings
2. **Thresholds:** Consider raising coverage thresholds for critical paths

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `npm run test:coverage` | Unit + integration tests with coverage |
| `npm run test:e2e` | Playwright E2E (uses BASE_URL or localhost:3002) |
| `npm run test:e2e:local` | E2E against local dev (port 3002) |
| `BASE_URL=https://... npm run test:e2e` | E2E against deployed environment |
