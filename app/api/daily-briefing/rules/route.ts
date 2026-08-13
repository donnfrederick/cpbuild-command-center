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

// ── GET /api/daily-briefing/rules ─────────────────────────────────────────────
// Returns all briefing rules (active and inactive), newest first.

export async function GET() {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;

  const rules = await db.briefingRule.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ rules });
}

// ── POST /api/daily-briefing/rules ────────────────────────────────────────────
// Creates a new briefing rule.

const createSchema = z.object({
  text: z.string().min(1).max(2000),
  source: z.enum(["MANUAL", "FEEDBACK_DERIVED"]).default("MANUAL"),
  active: z.boolean().default(true),
});

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard.error;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const rule = await db.briefingRule.create({
    data: {
      text: parsed.data.text,
      source: parsed.data.source,
      active: parsed.data.active,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
