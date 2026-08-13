import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevToolsAllowed, DEVTOOLS_BLOCKED_MESSAGE } from "@/lib/devtools-env";
import { requireDevToolsAdmin } from "@/lib/devtools-auth";

/** GET /api/devtools/layout-issues — list all issues, newest first (requires DevTools admin) */
export async function GET() {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const auth = await requireDevToolsAdmin();
  if (auth instanceof NextResponse) return auth;

  const issues = await db.layoutIssue.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(issues);
}

/** POST /api/devtools/layout-issues — create a new open issue */
export async function POST(req: NextRequest) {
  if (!isDevToolsAllowed()) {
    return NextResponse.json({ error: DEVTOOLS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const auth = await requireDevToolsAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { description, device, platform, route, screenshot } = body;

  if (!description?.trim() || !device || !platform || !route) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const issue = await db.layoutIssue.create({
    data: {
      description: description.trim(),
      device,
      platform,
      route,
      screenshot: screenshot ?? null,
      status: "OPEN",
    },
  });

  return NextResponse.json(issue, { status: 201 });
}
