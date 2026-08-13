/**
 * Dev-only endpoint — switches the per-browser dev persona cookie.
 *
 * Only active when DEV_BYPASS_AUTH=true (local dev). Returns 404 in production.
 *
 * Usage:
 *   Set persona:   GET /api/dev-switch-user?email=hannah@cpbuild.com
 *   Reset cookie: GET /api/dev-switch-user?reset=1
 *   (then session uses DEV_BYPASS_USER_EMAIL if set, else synthetic dev-user)
 */
import { NextRequest, NextResponse } from "next/server";
import { DEV_PERSONA_COOKIE } from "@/lib/dev-session";

const isBypass =
  process.env.DEV_BYPASS_AUTH === "true" &&
  process.env.NODE_ENV !== "production";

export async function GET(req: NextRequest) {
  if (!isBypass) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const reset = searchParams.has("reset");
  const email = searchParams.get("email");

  const res = NextResponse.json(
    reset
      ? {
          message:
            "Dev persona cookie cleared. Next load uses DEV_BYPASS_USER_EMAIL if set, else synthetic dev-user.",
        }
      : { message: `Dev persona set to ${email}. Refresh the app to take effect.` }
  );

  if (reset) {
    res.cookies.set(DEV_PERSONA_COOKIE, "", { maxAge: 0, path: "/" });
  } else if (email) {
    res.cookies.set(DEV_PERSONA_COOKIE, email, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  } else {
    return NextResponse.json(
      { error: "Provide ?email=user@example.com or ?reset=1" },
      { status: 400 }
    );
  }

  return res;
}
