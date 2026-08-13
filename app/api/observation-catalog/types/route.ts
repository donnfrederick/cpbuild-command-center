import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageIssueReportConfig } from "@/lib/permissions";
import { slugObservationCatalogCode } from "@/lib/observations/observation-catalog-definitions";

const CreateSchema = z.object({
  displayName: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
});

async function requireManageAuth(): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canManageIssueReportConfig(effective.user.role, effective.user.specialPermissions)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true };
}

/** POST /api/observation-catalog/types */
export async function POST(req: NextRequest) {
  const auth = await requireManageAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { displayName, sortOrder } = parsed.data;
  let code = slugObservationCatalogCode(displayName);
  const existing = await db.observationTypeCatalog.findUnique({ where: { code } });
  if (existing) {
    code = `${code}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const maxOrder = await db.observationTypeCatalog.aggregate({ _max: { sortOrder: true } });
  const nextOrder = sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 10;

  try {
    const row = await db.observationTypeCatalog.create({
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
    console.error("[observation-catalog/types POST]", err);
    return NextResponse.json({ error: "Failed to create observation type" }, { status: 500 });
  }
}
