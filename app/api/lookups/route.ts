import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";

/**
 * GET /api/lookups
 *
 * Returns all lookup tables for project row FK dropdowns:
 * scope types, location types, cost types, install teams, uom types.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Guard: Prisma client must have lookup models (run `npx prisma generate` if missing)
  const models = [db.scopeType, db.locationType, db.costType, db.installTeam, db.uomType];
  const missing = models.some((m) => m == null);
  if (missing) {
    console.error("[api/lookups] Prisma client missing lookup models. Run: npx prisma generate && rm -rf .next");
    return NextResponse.json(
      { error: "Database client not ready", detail: "Run: npx prisma generate, clear .next, and restart the dev server." },
      { status: 503 }
    );
  }

  try {
    const [scopeTypes, canonicalScopeTypes, locationTypes, costTypes, installTeams, uomTypes] =
      await Promise.all([
        db.scopeType.findMany({ orderBy: { code: "asc" } }),
        db.canonicalScopeType.findMany({ orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] }),
        db.locationType.findMany({ orderBy: { code: "asc" } }),
        db.costType.findMany({ orderBy: { code: "asc" } }),
        db.installTeam.findMany({ orderBy: { code: "asc" } }),
        db.uomType.findMany({ orderBy: { code: "asc" } }),
      ]);

    return NextResponse.json({
      scopeTypes: scopeTypes.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      // Deduplicated canonical scope types for the Form Builder picker.
      // Use these instead of raw scopeTypes to avoid showing aliases like
      // "CABIU" alongside "Cabinetry" — both resolve to the same canonical.
      canonicalScopeTypes: canonicalScopeTypes.map((c) => ({
        id: c.id,
        code: c.code,
        displayName: c.displayName,
      })),
      locationTypes: locationTypes.map((l) => ({ id: l.id, code: l.code, name: l.name })),
      costTypes: costTypes.map((c) => ({ id: c.id, code: c.code, name: c.name })),
      installTeams: installTeams.map((i) => ({ id: i.id, code: i.code, name: i.name })),
      uomTypes: uomTypes.map((u) => ({ id: u.id, code: u.code, name: u.name })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/lookups] Error:", message);
    return NextResponse.json(
      { error: "Failed to load lookups", detail: process.env.NODE_ENV === "development" ? message : undefined },
      { status: 500 }
    );
  }
}
