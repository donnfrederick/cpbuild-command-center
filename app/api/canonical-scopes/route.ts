import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";

// ─── GET /api/canonical-scopes ────────────────────────────────────────────────
// Returns all canonical scope types ordered by sort_order.
// Used by the upload linking prompt and any scope-type dropdowns.
// Open to all authenticated users (read-only reference data).

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canonicalScopes = await db.canonicalScopeType.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, displayName: true, sortOrder: true },
  });

  return NextResponse.json({ canonicalScopes });
}

// ─── POST /api/canonical-scopes ───────────────────────────────────────────────
// Creates a new canonical scope type.
// Requires EDIT_UPM — same as link — so uploaders can create canonical entries inline.

const CreateCanonicalScopeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9-]+$/, "Code must be uppercase letters, numbers, and hyphens only"),
  displayName: z.string().trim().min(1).max(100),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, PERMISSIONS.EDIT_UPM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateCanonicalScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { code, displayName } = parsed.data;

  const existing = await db.canonicalScopeType.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json(
      { error: "A canonical scope with this code already exists", existing },
      { status: 409 }
    );
  }

  const maxOrder = await db.canonicalScopeType.aggregate({ _max: { sortOrder: true } });
  const nextOrder = (maxOrder._max.sortOrder ?? 0) + 1;

  const created = await db.canonicalScopeType.create({
    data: { code, displayName, sortOrder: nextOrder },
    select: { id: true, code: true, displayName: true, sortOrder: true },
  });

  return NextResponse.json({ canonicalScope: created }, { status: 201 });
}
