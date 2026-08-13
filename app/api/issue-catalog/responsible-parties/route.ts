import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import { slugIssueCatalogCode } from "@/lib/issues/issue-catalog-definitions";

const CreateSchema = z.object({
  displayName: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
});

/** POST /api/issue-catalog/responsible-parties */
export async function POST(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { displayName, sortOrder } = parsed.data;
  let code = slugIssueCatalogCode(displayName);
  const existing = await db.responsiblePartyCatalog.findUnique({ where: { code } });
  if (existing) {
    code = `${code}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const maxOrder = await db.responsiblePartyCatalog.aggregate({ _max: { sortOrder: true } });
  const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 10;

  try {
    const row = await db.responsiblePartyCatalog.create({
      data: {
        code,
        displayName: displayName.trim(),
        sortOrder: nextOrder,
        isActive: true,
      },
      select: {
        code: true,
        displayName: true,
        sortOrder: true,
        isActive: true,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[issue-catalog/responsible-parties POST]", err);
    return NextResponse.json({ error: "Failed to create responsible party" }, { status: 500 });
  }
}
