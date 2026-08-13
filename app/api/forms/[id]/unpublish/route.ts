import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";

// ─── POST /api/forms/[id]/unpublish ──────────────────────────────────────────
// Moves a PUBLISHED form back to DRAFT. Versions are preserved.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeFormMutation();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const existing = await db.form.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const form = await db.form.update({
    where: { id },
    data: { status: "DRAFT" },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, versionNumber: true, publishedAt: true },
      },
    },
  });

  return NextResponse.json({ form });
}
