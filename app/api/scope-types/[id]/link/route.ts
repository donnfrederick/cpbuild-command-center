import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/lib/dev-session";

// ─── PATCH /api/scope-types/[id]/link ─────────────────────────────────────────
// Sets the canonical_scope_type_id on a scope_types row.
// Requires EDIT_UPM — the same permission that gates UPM uploads — so that users
// who trigger the linking modal via an upload can always resolve it.

const LinkSchema = z.object({
  // null = unlink (clear canonical_scope_type_id); non-null string = link to that canonical
  canonicalScopeTypeId: z.string().min(1).nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(session.user.role, PERMISSIONS.EDIT_UPM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const scopeType = await db.scopeType.findUnique({ where: { id } });
  if (!scopeType) {
    return NextResponse.json({ error: "Scope type not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { canonicalScopeTypeId } = parsed.data;

  // null = unlink: clear the canonical without looking up a target
  if (canonicalScopeTypeId === null) {
    const updated = await db.scopeType.update({
      where: { id },
      data: { canonicalScopeTypeId: null },
      select: {
        id: true,
        code: true,
        name: true,
        canonicalScopeType: {
          select: { id: true, code: true, displayName: true },
        },
      },
    });
    return NextResponse.json({ scopeType: updated });
  }

  const canonical = await db.canonicalScopeType.findUnique({
    where: { id: canonicalScopeTypeId },
  });
  if (!canonical) {
    return NextResponse.json(
      { error: "Canonical scope type not found" },
      { status: 404 }
    );
  }

  const updated = await db.scopeType.update({
    where: { id },
    data: { canonicalScopeTypeId },
    select: {
      id: true,
      code: true,
      name: true,
      canonicalScopeType: {
        select: { id: true, code: true, displayName: true },
      },
    },
  });

  return NextResponse.json({ scopeType: updated });
}
