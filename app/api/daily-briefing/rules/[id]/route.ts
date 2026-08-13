import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!hasPermission(session.user.role, PERMISSIONS.VIEW_MORNING_BRIEFING)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

// ── PATCH /api/daily-briefing/rules/[id] ─────────────────────────────────────
// Updates a briefing rule (text and/or active toggle).

const patchSchema = z.object({
  text: z.string().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await db.briefingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  const updated = await db.briefingRule.update({
    where: { id },
    data: {
      ...(parsed.data.text !== undefined ? { text: parsed.data.text } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
  });

  return NextResponse.json({ rule: updated });
}

// ── DELETE /api/daily-briefing/rules/[id] ────────────────────────────────────
// Permanently deletes a briefing rule.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const existing = await db.briefingRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }

  await db.briefingRule.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
