import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import {
  getDesignTokenOverrides,
  saveDesignTokenOverrides,
} from "@/lib/design-tokens-server";
import { z } from "zod";

// ─── GET /api/design-tokens ───────────────────────────────────────────────────
// Public — anyone can read the active token set (they render in the UI anyway).
// Returns overrides + caller's edit permission + last-saved attribution.
// Uses the effective session so that role-preview is respected: previewing as a
// non-editor role returns canEdit: false even for an admin actor.

export async function GET() {
  const effective = await getEffectiveSession();
  const snapshot = await getDesignTokenOverrides();

  const canEdit = effective?.user.role
    ? hasPermission(effective.user.role, PERMISSIONS.EDIT_DESIGN_SYSTEM, [])
    : false;

  return NextResponse.json({
    overrides: snapshot.overrides,
    canEdit,
    lastSaved: snapshot.savedByName
      ? {
          name: snapshot.savedByName,
          at: snapshot.savedAt?.toISOString() ?? null,
        }
      : null,
  });
}

// ─── PUT /api/design-tokens ───────────────────────────────────────────────────
// Requires: authenticated session + EDIT_DESIGN_SYSTEM permission.

const putSchema = z.object({
  overrides: z.record(
    z.string().startsWith("--"),   // keys must be CSS custom properties
    z.string().max(200)
  ),
});

export async function PUT(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.EDIT_DESIGN_SYSTEM, [])) {
    return NextResponse.json(
      {
        error: "Forbidden",
        detail:
          "Only Admins, Team Leads, and Designers may edit design tokens.",
      },
      { status: 403 }
    );
  }

  const body: unknown = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const userName =
    session.user.name ?? session.user.email ?? session.user.id;

  await saveDesignTokenOverrides(
    parsed.data.overrides,
    session.user.id,
    userName
  );

  return NextResponse.json({
    ok: true,
    savedAt: new Date().toISOString(),
    savedByName: userName,
  });
}
