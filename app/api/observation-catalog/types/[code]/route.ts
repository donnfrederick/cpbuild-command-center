import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";

const PatchSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ code: string }> };

/** PATCH /api/observation-catalog/types/[code] */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const existing = await db.observationTypeCatalog.findUnique({ where: { code } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const row = await db.observationTypeCatalog.update({
      where: { code },
      data: {
        ...(parsed.data.displayName !== undefined
          ? { displayName: parsed.data.displayName.trim() }
          : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
      select: {
        code: true,
        displayName: true,
        sortOrder: true,
        isActive: true,
      },
    });
    return NextResponse.json(row);
  } catch (err) {
    console.error("[observation-catalog/types PATCH]", err);
    return NextResponse.json({ error: "Failed to update observation type" }, { status: 500 });
  }
}
