import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { fetchActiveIssueCatalog } from "@/lib/issues/issue-catalog";

/** GET /api/issue-catalog — active issue types and responsible parties for pickers. */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const catalog = await fetchActiveIssueCatalog();
    return NextResponse.json(catalog);
  } catch (err) {
    console.error("[issue-catalog GET]", err);
    return NextResponse.json({ error: "Failed to load issue catalog" }, { status: 500 });
  }
}
