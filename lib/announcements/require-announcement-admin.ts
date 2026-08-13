import { NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";

type AdminGuardResult =
  | { session: null; userId: null; status: 401 }
  | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; userId: null; status: 403 }
  | {
      session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
      userId: string;
      status: null;
    };

/** ADMIN role only — uses real actor role during masquerade. */
export async function requireAnnouncementAdmin(): Promise<AdminGuardResult> {
  const session = await getSession();
  if (!session?.user) return { session: null, userId: null, status: 401 };

  const effective = await getEffectiveSession();
  const realRole =
    effective?.masquerade?.actorRole ??
    effective?.rolePreview?.realRole ??
    session.user.role;

  if (realRole !== "ADMIN") {
    return { session, userId: null, status: 403 };
  }

  return { session, userId: session.user.id, status: null };
}

export function adminGuardResponse(status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? "Forbidden" : "Unauthorized" },
    { status },
  );
}
