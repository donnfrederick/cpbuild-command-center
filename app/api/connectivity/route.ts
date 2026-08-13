import { NextResponse } from "next/server";

/** Lightweight liveness probe for client connectivity checks — no DB hit. */
export async function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
