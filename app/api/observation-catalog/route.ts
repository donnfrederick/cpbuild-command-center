import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { fetchActiveObservationCatalog } from "@/lib/observations/observation-catalog";

/** GET /api/observation-catalog — active observation types for pickers. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const catalog = await fetchActiveObservationCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[observation-catalog GET]", err);
    return NextResponse.json({ error: "Failed to load observation catalog" }, { status: 500 });
  }
}
