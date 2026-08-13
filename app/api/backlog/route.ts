import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";

// ── GET /api/backlog ──────────────────────────────────────────────────────────
// Returns all ACTIVE backlog items for the authenticated user.

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await db.backlogItem.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, notes: true, source: true, createdAt: true },
  });

  return NextResponse.json({ items });
}

// ── POST /api/backlog ─────────────────────────────────────────────────────────
// Creates a new backlog item (manual entry or saved from an AI suggestion).

const createSchema = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(1000).optional().default(""),
  source: z.enum(["MANUAL", "AI_SUGGESTED"]).default("MANUAL"),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { title, notes, source } = parsed.data;

  const item = await db.backlogItem.create({
    data: {
      userId: session.user.id,
      title,
      notes: notes ?? null,
      source,
      status: "ACTIVE",
    },
    select: { id: true, title: true, notes: true, source: true, createdAt: true },
  });

  return NextResponse.json({ item }, { status: 201 });
}
