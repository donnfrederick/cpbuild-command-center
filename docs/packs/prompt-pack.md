# Prompt Pack — CP Build Command Center

**Paste this at the start of any new agent/dev session to establish full project context.**  
For complete details on any section, see `docs/packs/base-pack.md`.

---

## Project in One Paragraph

CP Build Command Center is an internal construction project management PWA built for CP Build. It tracks projects, units, phases, and install teams for subcontractors. It integrates with Oracle Primavera Unifier. Stack: **Next.js 16 + next-intl + Prisma 7 + Postgres + Railway**. Auth via NextAuth credentials. Two locales: `en` and `es` (all routes are `/[locale]/...`). Real auth, RBAC (ADMIN / MEMBER), team invitations via email (Resend in prod, Mailpit locally).

---

## Critical Infrastructure Constraints

### 🚨 No Interactive Prisma Transactions
Railway runs PgBouncer in transaction pooling mode. **`$transaction(async tx => {})` will fail** with "Transaction not found." Use sequential `db.X()` calls instead. If atomicity is needed, add a compensating delete/update on error. See `app/api/projects/route.ts` for the pattern.

### Locale Routing
All pages live under `/[locale]/`. **Always import** `Link`, `redirect`, `useRouter`, `usePathname` **from `@/i18n/navigation`** — never from `next/link` or `next/navigation`.

### Middleware File
The Next.js middleware is `proxy.ts` (not `middleware.ts`) — handles route protection + locale. Do not rename.

---

## Top 5 Anti-Patterns to Avoid

1. **Interactive Prisma transactions** (`$transaction(async tx => {})`) — Railway/PgBouncer incompatible → use sequential calls
2. **Logging PII** (emails, names) — use `maskEmail()` from `lib/email.ts`
3. **Dev-only env vars without prod guard** — check `NODE_ENV !== 'production' && APP_ENV !== 'production'`
4. **Multi-line strings in GitHub Actions `run:` blocks** — use `printf '...\n...'` into a variable
5. **Workflow dedup missing** — always check for existing issue/comment before creating from a workflow

Full list: `docs/COPILOT_LEARNINGS.md` | Architectural decisions: `docs/decisions/decision-log.md`

---

## Auth Pattern (Every Protected API Route)

```typescript
const session = await auth();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
if (!hasPermission(session.user.role, PERMISSIONS.YOUR_PERMISSION)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Roles: `ADMIN`, `MEMBER` | Permissions: `lib/permissions.ts`

---

## Key Conventions

- **CSS**: CSS variables from `app/globals.css` — no hardcoded hex/px
- **i18n**: Every UI string → both `messages/en.json` AND `messages/es.json`
- **TypeScript**: Strict, no `any`, `interface` for object shapes
- **Tests**: Unit tests in `__tests__/unit/`, integration in `__tests__/integration/`. Always mock `lib/db` and `lib/auth`
- **Commits**: `feat(area): ...` · `fix(area): ...` · `chore: ...`

---

## Before Every Push

```bash
npm run build && npm run lint && npm run test:unit
```

---

## Session Start Checklist (agents)

```bash
# Check pending items
gh issue list --repo cp-build-dev-ops/command-center-reboot \
  --label agent-action-required --state open \
  --json number,title --jq '.[] | "#\(.number): \(.title)"'

# Check open PRs
gh pr list --repo cp-build-dev-ops/command-center-reboot --state open \
  --json number,title,mergeable --jq '.[] | "#\(.number) \(.title)"'
```

Full agent protocol: `.cursor/rules/git-pr-workflow.mdc`

---

## Where Things Live

| Need | File |
|------|------|
| DB schema | `prisma/schema.prisma` · `docs/contracts/db-schema-notes.md` |
| API routes | `app/api/` · `docs/contracts/api-contracts.md` |
| Permissions | `lib/permissions.ts` |
| Email | `lib/email.ts` |
| UPM parsing | `lib/upm-parse.ts` · `lib/project-rows.ts` |
| i18n strings | `messages/en.json` + `messages/es.json` |
| Design tokens | `app/globals.css` |
| Decisions made | `docs/decisions/decision-log.md` |
| Anti-patterns | `docs/COPILOT_LEARNINGS.md` |
| PR workflow | `.cursor/rules/git-pr-workflow.mdc` |
| Base context | `docs/packs/base-pack.md` |
| Dev setup | `docs/DEV_SETUP_LIGHTWEIGHT.md` |
