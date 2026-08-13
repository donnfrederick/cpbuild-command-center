import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/devtools/layout-issues/[id] — update status, mark fixed, reopen */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const auth = await requireDevToolsAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const { status, fixNote } = body;

  const existing = await db.layoutIssue.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const data: Parameters<typeof db.layoutIssue.update>[0]["data"] = { status };

  if (status === "FIXED") {
    data.fixNote = fixNote?.trim() ?? null;
    data.fixedAt = new Date();
  }

  if (status === "OPEN") {
    // Reopening — clear fix metadata
    data.fixNote = null;
    data.fixedAt = null;
  }

  const updated = await db.layoutIssue.update({ where: { id }, data });
  return NextResponse.json(updated);
}

/** DELETE /api/devtools/layout-issues/[id] — hard delete */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const auth = await requireDevToolsAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const existing = await db.layoutIssue.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  await db.layoutIssue.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
