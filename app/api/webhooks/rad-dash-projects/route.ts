import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasFeedbackInboxAccess } from "@/lib/feedback-access";
import type { RadDashProject } from "@/lib/rad-dash-webhook";

export async function GET(): Promise<NextResponse> {
  const session = await getEffectiveSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const specialPermissions = session.user.specialPermissions ?? [];
  if (!hasFeedbackInboxAccess(role, specialPermissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webhookUrl = process.env.RAD_DASH_WEBHOOK_URL;
  const webhookSecret = process.env.RAD_DASH_WEBHOOK_SECRET;
  if (!webhookUrl || !webhookSecret) {
    return NextResponse.json(
      { error: "Rad-Dash integration is not configured on this server." },
      { status: 503 }
    );
  }

  const baseUrl = new URL(webhookUrl).origin;

  let radDashRes: Response;
  try {
    radDashRes = await fetch(`${baseUrl}/api/projects`, {
      headers: { authorization: `Bearer ${webhookSecret}` },
    });
  } catch (err: unknown) {
    console.error("[webhooks/rad-dash-projects] fetch error:", err);
    return NextResponse.json(
      { error: "Failed to reach Rad-Dash. Check RAD_DASH_WEBHOOK_URL." },
      { status: 502 }
    );
  }

  if (!radDashRes.ok) {
    const errBody = await radDashRes.text();
    console.error(
      `[webhooks/rad-dash-projects] Rad-Dash returned ${radDashRes.status}: ${errBody}`
    );
    return NextResponse.json(
      { error: `Rad-Dash rejected the request (${radDashRes.status})` },
      { status: 502 }
    );
  }

  const raw: unknown = await radDashRes.json();

  // Normalise common response shapes: plain array, { projects: [] }, { data: [] }
  let projects: RadDashProject[];
  if (Array.isArray(raw)) {
    projects = raw as RadDashProject[];
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const candidate = obj["projects"] ?? obj["data"];
    if (Array.isArray(candidate)) {
      projects = candidate as RadDashProject[];
    } else {
      console.error("[webhooks/rad-dash-projects] unexpected response shape:", raw);
      return NextResponse.json(
        { error: "Unexpected response shape from Rad-Dash" },
        { status: 502 }
      );
    }
  } else {
    console.error("[webhooks/rad-dash-projects] unexpected response shape:", raw);
    return NextResponse.json(
      { error: "Unexpected response shape from Rad-Dash" },
      { status: 502 }
    );
  }

  // Normalise each project to a guaranteed { id, name } shape.
  // Rad-Dash may use any of these common ID field names depending on the ORM/DB.
  const normalised: RadDashProject[] = projects.map((p) => {
    const obj = p as unknown as Record<string, unknown>;
    const rawId =
      obj["id"] ??
      obj["_id"] ??
      obj["projectId"] ??
      obj["project_id"] ??
      obj["uuid"] ??
      "";
    const rawName =
      obj["name"] ?? obj["title"] ?? obj["projectName"] ?? obj["project_name"] ?? "";
    return { id: String(rawId), name: String(rawName) };
  });

  return NextResponse.json(normalised);
}
