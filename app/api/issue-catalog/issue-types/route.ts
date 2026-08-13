import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import {
  ISSUE_TYPE_CATALOG_DEFINITIONS,
  slugIssueCatalogCode,
} from "@/lib/issues/issue-catalog-definitions";

const CreateSchema = z.object({
  displayName: z.string().min(1).max(120),
  requiresVisual: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

async function requireManageAuth(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (
    !canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)
  ) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}

/** POST /api/issue-catalog/issue-types */
export async function POST(req: NextRequest) {
  const auth = await requireManageAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { displayName, requiresVisual = false, sortOrder } = parsed.data;
  let code = slugIssueCatalogCode(displayName);
  const existing = await db.issueTypeCatalog.findUnique({ where: { code } });
  if (existing) {
    code = `${code}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const maxOrder = await db.issueTypeCatalog.aggregate({ _max: { sortOrder: true } });
  const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 10;

  try {
    const row = await db.issueTypeCatalog.create({
      data: {
        code,
        displayName: displayName.trim(),
        requiresVisual,
        sortOrder: nextOrder,
        isActive: true,
      },
      select: {
        code: true,
        displayName: true,
        requiresVisual: true,
        sortOrder: true,
        isActive: true,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[issue-catalog/issue-types POST]", err);
    return NextResponse.json({ error: "Failed to create issue type" }, { status: 500 });
  }
}
