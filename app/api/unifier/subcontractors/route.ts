/**
 * GET /api/unifier/subcontractors
 *
 * Returns active subcontractors from Unifier's UNIFIER_UXSUB table, formatted
 * for use in the scope-row subcontractor picker.
 *
 * Filters to STATUS === "Active" (case-insensitive) and caches the result for
 * 5 minutes server-side.
 *
 * Auth: any authenticated user (subcontractor list is not sensitive).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { getSubcontractorsForPicker } from "@/lib/unifier/subcontractors";
import type { ApiError } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subcontractors = await getSubcontractorsForPicker();
    return NextResponse.json({ subcontractors });
  } catch (err) {
    console.error("[GET /api/unifier/subcontractors] error:", err);
    return NextResponse.json<ApiError>(
      { error: "Failed to load subcontractors from Unifier" },
      { status: 502 }
    );
  }
}
