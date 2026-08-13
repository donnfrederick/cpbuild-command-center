import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { enforceProjectReadVisibility } from "@/lib/production-project-access";
import { resolveProjectSiteGeocode } from "@/lib/geo/project-site-geocode";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const visBlock = await enforceProjectReadVisibility(projectId, effective);
  if (visBlock) return visBlock;

  const geocode = await resolveProjectSiteGeocode(projectId);

  return NextResponse.json({
    siteLocation: geocode.siteLocation,
    latitude: geocode.latitude,
    longitude: geocode.longitude,
    available: geocode.available,
    geocodeStatus: geocode.geocodeStatus,
  });
}
