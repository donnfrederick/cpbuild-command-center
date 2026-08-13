import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import {
  contentTypeForFieldMediaKey,
  isValidFieldMediaStorageKey,
  readLocalFieldMediaFile,
} from "@/lib/field-media-local";

/**
 * Serves bytes for field-media files stored on local disk (when uploads used empty SUPABASE_SERVICE_ROLE_KEY).
 * Session required; same-origin img/video/audio tags send cookies.
 */
export async function GET(req: NextRequest) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key || !isValidFieldMediaStorageKey(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const buf = await readLocalFieldMediaFile(key);
  if (!buf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentTypeForFieldMediaKey(key),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
