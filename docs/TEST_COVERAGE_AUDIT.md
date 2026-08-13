# Test Coverage Audit — Command Center Reboot

**Last updated:** 2026-03-05

## Executive Summary

| Category | Total | Tested | Coverage | Priority Gaps |
|----------|-------|--------|----------|---------------|
| **API Routes** | 53 | 27 integration test files | ~72% | `PATCH /api/team/[id]`, `DELETE /api/team/[id]` |
| **Lib Modules** | 29 | 18 unit test files | ~62% (many intentionally excluded) | none critical |
| **Components** | 66 | 12 unit test files | ~18% (many excluded by policy) | `CreateProjectModal`, `TourPlayer`, `TourBuilder` |
| **Hooks** | 2 | 2 | 100% | ✅ Complete |
| **Validations** | 2 | 2 | 100% | ✅ Complete |
| **E2E Smoke** | — | 1 file | — | Auth, health, PWA |

---

## 1. API Routes (`app/api/**/route.ts`)

### ✅ Routes WITH Integration Tests

| Route | Test File | Coverage |
|-------|-----------|----------|
| `GET /api/health` | `health.integration.test.ts` | 200 ok |
| `GET /api/projects` | `projects-get.integration.test.ts` | 401, bypass, 200, empty, OnHold serialization, null PM name |
| `POST /api/projects` | `projects-get.integration.test.ts` | 401, 403, 400, 422, 201 (create, restore, upmData), 409, 500 |
| `GET /api/projects/[id]` | `projects-id.integration.test.ts` | 401, 404 (not found, soft-deleted), 200 |
| `PATCH /api/projects/[id]` | `projects-id.integration.test.ts` | 401, 403, 400, 422, 404, 200 |
| `DELETE /api/projects/[id]` | `projects-id.integration.test.ts` | 401, 403, 404, 204 |
| `GET /api/projects/[id]/units` | `projects-units.integration.test.ts` | 401, 404, 200 |
| `POST /api/projects/[id]/units` | `projects-units.integration.test.ts` | 401, 403, 404, add/merge modes, empty rows |
| `PATCH /api/projects/[id]/units/[rowId]` | `projects-units.integration.test.ts` | 401, 403, 404, 200 |
| `DELETE /api/projects/[id]/units/[rowId]` | `projects-units.integration.test.ts` | 401, 403, 404, 200 |
| `POST /api/projects/[id]/units/bulk-delete` | `bulk-delete.integration.test.ts` | 401, 403, 404, 200 |
| `GET /api/unifier/projects` | `unifier-projects.integration.test.ts` | 401, 200 (filtered), 502 |
| `GET /api/unifier/projects/[pid]/documents` | `unifier-documents.integration.test.ts` | 401, 404, 200 |
| `GET /api/invites` | `invites.integration.test.ts` | 401, 403, 200 |
| `POST /api/invites` | `invites.integration.test.ts` | 401, 403, 422, 409, 201 |
| `POST /api/invites/[id]/resend` | `invites-resend.integration.test.ts` | 401, 403, 404, 200 |
| `GET /api/invites/validate` | `invites-validate.integration.test.ts` | 400, 404, 410 (accepted/expired), 200 |
| `POST /api/invites/accept` | `invites-accept.integration.test.ts` | 422 (validation, password mismatch), 404, 410 (used/expired), 409, 201 |
| `GET /api/roles` | `roles.integration.test.ts` | 401, 403, 200 |
| `GET /api/team` | `team.integration.test.ts` | 401, 403, 200 |
| `GET /api/lookups` | `lookups.integration.test.ts` | 401, 200 |
| `GET /api/offline/preferences` | `offline-preferences.integration.test.ts` | 401, empty, saved, availableModules |
| `PUT /api/offline/preferences` | `offline-preferences.integration.test.ts` | 401, 400, saves, drops unavailable, my-profile |
| `POST /api/auth/forgot-password` | `forgot-password.integration.test.ts` | 400, 200 (user not found safe), 200 (email queued) |
| `POST /api/auth/reset-password` | `reset-password.integration.test.ts` | 400, 404, 410 (used/expired), 200 |
| `POST /api/auth/change-password` | `change-password.integration.test.ts` | 401, 400, 403 (wrong current), 200 |
| `GET /api/notifications` | `notifications.integration.test.ts` | 401, 200 (with/without tour) |
| `GET/PUT /api/feedback/[id]/tour` | `feedback-tour.integration.test.ts` | 401, 403, 404, 200 |
| `GET /api/feedback` | `feedback.integration.test.ts` | 401, 403, 200 (filtered) |
| `GET /api/admin/status` | `admin-status.integration.test.ts` | 401, 403, 200 (fields, ok check, dedup) |
| `GET /api/users/[id]/special-permissions` | `special-permissions.integration.test.ts` | 401, 403, 200 |
| `GET/POST /api/devtools/releases` | `devtools-releases.integration.test.ts` | auth guard, 200, changelog import |
| Various DevTools | `devtools-auth.integration.test.ts`, `devtools-data.integration.test.ts` | auth guard, data access |
| `POST /api/devtools/test-email` | `test-email.integration.test.ts` | 401, 403, 200 |

### ❌ Routes MISSING Integration Tests

| Route | Methods | Priority | Notes |
|-------|---------|----------|-------|
| `PATCH /api/team/[id]` | PATCH | **MEDIUM** | Update member role, self-change prevention |
| `DELETE /api/team/[id]` | DELETE | **MEDIUM** | Remove member, self-removal prevention |

### Excluded from Coverage (intentional)

| Route | Reason |
|-------|--------|
| `app/api/auth/[...nextauth]` | NextAuth internals |
| `app/api/devtools/**` | Dev-only tooling |
| `app/api/design-tokens/**` | Design system |
| `app/api/offline/snapshot` | Complex, excluded |
| `app/api/invites/accept` | In coverage exclude; has integration tests |

---

## 2. Lib Modules (`lib/**/*.ts`)

### ✅ Modules WITH Unit Tests

| Module | Test File | Coverage |
|--------|-----------|----------|
| `lib/utils.ts` | `utils.unit.test.ts` | `cn()` |
| `lib/api-logger.ts` | `api-logger.unit.test.ts` | `logApi`, `apiTimer`, status codes, truncation |
| `lib/project-rows.ts` | `project-rows.unit.test.ts` | `mapRowToColumns`, `rowKey`, `insertProjectRows` |
| `lib/projects.ts` | `projects.unit.test.ts` | Constants, types, `serializeProject`, status maps |
| `lib/permissions.ts` | `permissions.test.ts` | `hasPermission`, `formatRole`, catalog |
| `lib/upm-parse.ts` | `upm-parse.unit.test.ts` | `parseUPM`, `parseUPMFromFile` |
| `lib/unifier/client.ts` | `unifier-client.unit.test.ts` | `resetConfigCache`, `fetchAllRows`, pagination |
| `lib/unifier/service.ts` | `unifier-service.unit.test.ts` | `mapUnifierStatus`, `getProjects` cache |
| `lib/offline/modules.ts` | `offline-modules.unit.test.ts` | Registry, map, always-cached |
| `lib/ai/gemini.ts` | `ai-gemini.unit.test.ts` | `isAIEnabled`, prompt functions, rate limiter |
| `lib/changelog-parser.ts` | `changelog-parser.unit.test.ts` | `parseChangelog`, `inferRoute`, edge cases |
| `lib/unifier/circuit-breaker` | `unifier-circuit-breaker.unit.test.ts` | Open/close/half-open states |
| `lib/devtools-env.ts` | `devtools-env.unit.test.ts` | `isDevToolsAllowed`, env guards |
| `lib/validations/auth.ts` + invite | `auth-validations.unit.test.ts` + `validations.test.ts` | All schemas |
| `lib/password-reset.ts` | `password-reset.unit.test.ts` | Token hash, expiry checks |
| `scripts/bootstrap-admin.ts` | `bootstrap-admin.unit.test.ts` | Idempotency |

### ❌ Modules Excluded / No Tests

| Module | Excluded? | Reason |
|--------|-----------|--------|
| `lib/auth.ts` | Yes | NextAuth config |
| `lib/db.ts` | Yes | Prisma client |
| `lib/email.ts` | Yes | External I/O |
| `lib/azure-keyvault.ts` | Yes | External service (Azure credential-dependent) |
| `lib/design-tokens-server.ts` | Yes | Server-only |
| `lib/dev-logger.ts` | Yes | Dev tooling |
| `lib/dev-session.ts` | — | Thin wrapper over `auth()` |
| `lib/unifier/types.ts` | — | Types only |
| `lib/unifier/mock-data.ts` | — | Static data |

---

## 3. Components (`components/**/*.tsx`)

### ✅ Components WITH Unit Tests

| Component | Test File |
|-----------|-----------|
| `components/shared/OfflineIndicator.tsx` | `OfflineIndicator.test.tsx` |
| `components/shared/RouteAnnouncer.tsx` | `RouteAnnouncer.test.tsx` |
| `components/shared/SkipLink.tsx` | `SkipLink.test.tsx` |
| `components/shared/StatusBadge.tsx` | `StatusBadge.test.tsx` |
| `components/users/UsersView.tsx` | `UsersView.test.tsx` |
| `components/notifications/NotificationBell.tsx` | `NotificationBell.unit.test.tsx` |
| `components/projects/UnitCards.tsx` | `UnitCards.unit.test.tsx` |
| `components/layout/AccountMenu.tsx` | `AccountMenu.unit.test.tsx` |
| `components/projects/ProjectDocuments.tsx` | `ProjectDocuments.unit.test.tsx` |
| `components/layout/TopBar.tsx` | `TopBar.unit.test.tsx` |
| `components/layout/MobileBottomNav.tsx` | `MobileBottomNav.unit.test.tsx` |
| `components/layout/ProjectMobileBottomNav.tsx` | `ProjectMobileBottomNav.unit.test.tsx` |
| `app/[locale]/(admin)/admin/status/page.tsx` | `status-dashboard.unit.test.tsx` |

### Not Covered — Priority

| Component | Priority | Notes |
|-----------|----------|-------|
| `components/tour/TourPlayer.tsx` | Medium | No unit test; COPILOT_LEARNINGS: tour components need null-step tests |
| `components/tour/TourBuilder.tsx` | Low | Admin-only, DevTools-adjacent |
| `components/projects/CreateProjectModal.tsx` | Medium | COPILOT_LEARNINGS rule: form components need null-fixture unit test |

### Excluded from Coverage (vitest.config)

- `components/ui/**` — shadcn/ui primitives
- `components/devtools/**` — DevTools UI
- `components/auth/**` — Login, InviteAcceptForm
- `components/projects/ProjectsTable.tsx`, `ProjectDetailView.tsx`
- `components/account/OfflinePreferences.tsx`
- `components/shared/DevSwCleanup.tsx`

---

## 4. Hooks

| Hook | Test File | Status |
|------|-----------|--------|
| `hooks/use-debounce.ts` | `use-debounce.unit.test.ts` | ✅ |
| `hooks/use-offline-status.ts` | `use-offline-status.unit.test.ts` | ✅ |

**Coverage: 100%**

---

## 5. Validations (`lib/validations/**`)

| Validation | Test File | Schemas Tested |
|------------|-----------|----------------|
| `lib/validations/auth.ts` | `validations.test.ts` | `loginSchema`, `registerSchema`, `acceptInviteSchema` |
| `lib/validations/invite.ts` | `validations.test.ts` | `createInviteSchema` |

**Coverage: 100%**

---

## 6. E2E Tests (`e2e/`)

| File | Coverage |
|------|----------|
| `smoke.spec.ts` | Health, auth redirects (/team, /settings, /users), login form, skip link, invite 404, manifest |

---

## Recommended New Tests (Priority Order)

### Already Completed

✅ `bulk-delete.integration.test.ts` — `POST /api/projects/[id]/units/bulk-delete`
✅ `unifier-documents.integration.test.ts` — `GET /api/unifier/projects/[pid]/documents`
✅ `notifications.integration.test.ts`, `feedback-tour.integration.test.ts`, `feedback.integration.test.ts`
✅ `admin-status.integration.test.ts`, `special-permissions.integration.test.ts`
✅ `devtools-auth.integration.test.ts`, `devtools-releases.integration.test.ts`, `devtools-data.integration.test.ts`
✅ `change-password.integration.test.ts`, `forgot-password.integration.test.ts`, `reset-password.integration.test.ts`
✅ Many component and lib unit tests added (see components table above)

### Remaining Medium Priority

1. **`__tests__/integration/team-member.integration.test.ts`**
   - `PATCH /api/team/[id]` — 401, 403, self-change prevention, 200
   - `DELETE /api/team/[id]` — 401, 403, self-removal prevention, 204

2. **`__tests__/unit/CreateProjectModal.unit.test.tsx`**
   - Render with null/empty PM name fixture (COPILOT_LEARNINGS rule)
   - Assert POST does not fail schema validation

---

## Coverage Exclusions (vitest.config.ts)

The following are excluded from coverage thresholds:

- **Auth**: `app/api/auth/**`, `lib/auth.ts`
- **DevTools**: `app/api/devtools/**`, `lib/dev-logger.ts`
- **Infrastructure**: `lib/db.ts`, `lib/email.ts`, `lib/azure-keyvault.ts`, `lib/design-tokens-server.ts`
- **Invites**: `app/api/invites/route.ts`, `app/api/invites/accept/**`
- **Offline**: `app/api/offline/snapshot/**`
- **Projects**: `app/api/projects/[id]/route.ts`
- **Team**: `app/api/team/[id]/**`
- **Components**: ui, devtools, auth, layout, team, several project components

---

## Test Commands

```bash
npm run test              # All tests
npm run test:unit         # Unit only
npm run test:integration  # Integration only
npm run test:coverage     # With coverage report
npm run test:smoke        # E2E smoke (requires BASE_URL)
```
