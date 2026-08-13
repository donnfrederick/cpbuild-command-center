# Backend Patterns — CP Build Command Center

> Follow these patterns for all new API routes and server-side logic. Do not scan source files unless you need to copy a specific implementation detail.

## Migrations vs Bootstrap Scripts — Environment Parity Contract

This is the single most important deployment rule. Violating it causes data to exist locally but not in any deployed environment.

| Concern | Tool | Runs automatically on deploy? |
|---|---|---|
| Schema changes (tables, columns, indexes, enums) | `prisma/migrations/` via `prisma migrate deploy` | ✅ Yes — Step 1 of `railway-start.sh` |
| Reference/seed data (rows that must exist everywhere) | `scripts/bootstrap-*.ts` | ✅ Only if called from `railway-start.sh` |

**The rule:** If data must exist in every environment, it must be produced by a script called from `scripts/railway-start.sh`. Migrations are for DDL only — they do not seed rows. Running a bootstrap script locally does not make the data appear in dev or prod Railway.

```
prisma/migrations/  → "The projects table has an isTestProject column"   ← schema
Unifier-linked test projects + seed-test-data → test sandboxes   ← data
railway-start.sh    → the only place that connects bootstrap script → environment   ← wiring
```

**When adding a new bootstrap script:**
1. Write the script to be fully idempotent (skip if data exists, restore if soft-deleted)
2. Add a call in `railway-start.sh` in the **same PR** — never as a follow-up
3. The PR checklist item will catch this if you forget

**When adding a migration that requires seed data:**
Ask: "Does this migration create a table/column that also needs at least one row to exist in every environment?" If yes, a bootstrap script is required in the same PR.

## API Route Anatomy

Every route handler follows this exact structure:

```typescript
// app/api/<resource>/route.ts
import { getSession } from "@/lib/dev-session";  // ← always use getSession, never auth() directly
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { z } from "zod/v4";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // 1. Auth check — always first
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Permission check (if restricted)
  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_TEAM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Input parsing (query params for GET, body for POST/PATCH)
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1");

  // 4. Business logic / DB query
  try {
    const data = await db.someModel.findMany({ ... });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/resource]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Parse + validate body
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  // DB write
  const created = await db.someModel.create({ data: result.data });
  return NextResponse.json(created, { status: 201 });
}
```

## Auth Pattern

```typescript
import { getSession } from "@/lib/dev-session";  // ← never import auth() directly in route handlers
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const session = await getSession();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Role-gated operation:
if (!hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Never import `auth` directly in a route handler.** Always use `getSession()` from `@/lib/dev-session` — it wraps `auth()` with the `DEV_BYPASS_AUTH` bypass so local dev works without logging in.

**Never gate on `session.user.role === "ADMIN"` directly** — always use `hasPermission()`. This respects `UserSpecialPermission` overrides.

## Permission Catalog (`lib/permissions.ts`)

```typescript
export const PERMISSIONS = {
  INVITE_MEMBER:   "invite:member",
  VIEW_TEAM:       "view:team",
  MANAGE_ROLES:    "manage:roles",
  REMOVE_MEMBER:   "remove:member",
  // ... more as features expand
} as const;
```

`hasPermission(role: string, permission: string): boolean` checks `ROLE_PERMISSIONS` map.

## Validation Pattern (Zod 4)

```typescript
import { z } from "zod/v4";

// Define schema in lib/validations/<feature>.ts or inline for simple routes
// Example — link project to Unifier (display fields come from PDS at read time, not the body):
const createProjectSchema = z.object({
  unifierPid: z.string().min(1),
  installManagerId: z.string().optional(),
  installManagerName: z.string().max(100).optional(),
  projectManagerId: z.string().optional(),
  upmData: z.array(z.record(z.string(), z.unknown())).optional(),
});

// In route handler:
const result = createProjectSchema.safeParse(body);
if (!result.success) {
  return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
}
const { unifierPid, upmData } = result.data;
```

Validation schemas that need to run on the client too live in `lib/validations/`.

## Database (Prisma) Patterns

```typescript
import { db } from "@/lib/db";

// Standard query
const projects = await db.project.findMany({
  where: { deletedAt: null },          // Always filter soft-deleted records
  orderBy: { createdAt: "desc" },
  include: { projectRows: false },     // Avoid accidental N+1
});

// Transactions — always use array form (interactive form broken with PgBouncer)
const [user, preference] = await db.$transaction([
  db.user.create({ data: userData }),
  db.offlinePreference.create({ data: { userId: "..." } }),
]);

// Soft delete — set deletedAt, never hard delete Project rows
await db.project.update({
  where: { id },
  data: { deletedAt: new Date() },
});
```

**Important:** Never call `db.$transaction(async (tx) => {...})` (interactive form). Always use array form `db.$transaction([...])`.

## Error Handling

```typescript
try {
  // operation
} catch (err) {
  // Log with context so errors are traceable in Railway logs
  console.error("[POST /api/projects]", err);
  
  // Handle Prisma unique constraint violations
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return NextResponse.json({ error: "Already exists" }, { status: 409 });
  }
  
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
```

## Response Shape Conventions

| Scenario | Status | Body |
|----------|--------|------|
| Success (read) | 200 | `data` directly (array or object) |
| Created | 201 | Created object |
| Bad input | 400 | `{ error: string \| ZodFlattenedError }` |
| Unauthenticated | 401 | `{ error: "Unauthorized" }` |
| Forbidden | 403 | `{ error: "Forbidden" }` |
| Not found | 404 | `{ error: "Not found" }` |
| Conflict | 409 | `{ error: "Already exists" }` |
| Server error | 500 | `{ error: "Internal server error" }` |

## Unifier Integration Pattern

```typescript
// app/api/unifier/projects/route.ts proxies to Oracle Unifier
// Mock mode is active when UNIFIER_MOCK=true (always true in dev)
import { getProjects } from "@/lib/unifier/service";

const projects = await getProjects(); // Returns mock or real data
```

Never call Unifier directly from a client component — always proxy through the API route.

## DevTools Routes

**Both GET and POST (every HTTP method) in `app/api/devtools/` must call `requireDevToolsAdmin()`.** `isDevToolsAllowed()` is a production guard — it is NOT an auth check.

```typescript
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

// Every handler — GET, POST, PATCH, DELETE:
if (!isDevToolsAllowed()) {
  return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 404 });
}
const guard = await requireDevToolsAdmin();
if (guard instanceof NextResponse) return guard;
```

This hard-blocks DevTools APIs in production AND enforces admin-only auth on every method.

## Locale / URL Construction Pattern

Any query param that is incorporated into a URL being constructed must be validated against an explicit allowlist:

```typescript
// BAD — arbitrary value goes into a URL
const locale = searchParams.get("locale");
const url = `${baseUrl}/${locale}/projects`;

// GOOD — validate against allowlist, fall back to default
const SUPPORTED_LOCALES = ["en", "es"] as const;
const requestedLocale = searchParams.get("locale") ?? "en";
const locale = (SUPPORTED_LOCALES as readonly string[]).includes(requestedLocale)
  ? requestedLocale
  : "en";
const url = `${baseUrl}/${locale}/projects`;
```

## Route Naming Conventions

```
GET    /api/projects              # List (with optional query params for filter/sort)
POST   /api/projects              # Create
GET    /api/projects/[id]         # Single resource
PATCH  /api/projects/[id]         # Partial update
DELETE /api/projects/[id]         # Delete (soft where applicable)
POST   /api/projects/[id]/units/bulk-delete   # Bulk operations as sub-routes
```

## Environment Guards

For any dev/staging-only behavior:

```typescript
// Correct — checks both NODE_ENV and APP_ENV
function isNonProd(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.APP_ENV === "development";
}
```

Never gate solely on `NODE_ENV === "development"` — Railway dev environment runs `NODE_ENV=production`.
