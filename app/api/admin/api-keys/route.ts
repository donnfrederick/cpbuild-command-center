/**
 * GET  /api/admin/api-keys — List all API keys (ADMIN only)
 * POST /api/admin/api-keys — Create a new API key (ADMIN only)
 *
 * The raw key is returned ONCE in the POST response and never stored.
 * Only the SHA-256 hash and display prefix are persisted.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/bi-auth";
import { BI_SCOPES } from "@/lib/bi-scopes";

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  party: z.enum(["INTERNAL", "SUBCONTRACTOR", "GENERAL_CONTRACTOR"]).default("INTERNAL"),
  scopes: z
    .array(z.enum(BI_SCOPES as unknown as [string, ...string[]]))
    .min(1, "At least one scope is required"),
  allowedProjectIds: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

// ─── Auth guard ───────────────────────────────────────────────────────────────

type AdminGuardResult =
  | { session: null; status: 401 }
  | { session: NonNullable<Awaited<ReturnType<typeof getSession>>>; status: 403 | null };

async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await getSession();
  if (!session?.user) return { session: null, status: 401 };
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES)) return { session, status: 403 };
  return { session, status: null };
}

// ─── GET /api/admin/api-keys ──────────────────────────────────────────────────

export async function GET() {
  const { status } = await requireAdmin();
  if (status) return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });

  const keys = await db.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      allowedProjectIds: true,
      party: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  const enriched = keys.map((k) => ({
    ...k,
    status: k.revokedAt
      ? "revoked"
      : k.expiresAt && k.expiresAt < new Date()
        ? "expired"
        : "active",
  }));

  return NextResponse.json(enriched);
}

// ─── POST /api/admin/api-keys ─────────────────────────────────────────────────

export async function POST(request: Request) {
  const { session, status } = await requireAdmin();
  if (status) return NextResponse.json({ error: status === 403 ? "Forbidden" : "Unauthorized" }, { status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, party, scopes, allowedProjectIds, expiresAt, assignedToId } = parsed.data;

  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  const API_KEY_SELECT = {
    id: true,
    name: true,
    keyPrefix: true,
    scopes: true,
    allowedProjectIds: true,
    party: true,
    expiresAt: true,
    createdAt: true,
  } as const;

  let apiKey: Prisma.ApiKeyGetPayload<{ select: typeof API_KEY_SELECT }>;
  try {
    apiKey = await db.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        scopes,
        allowedProjectIds,
        party,
        createdById: session.user.id,
        assignedToId: assignedToId ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: API_KEY_SELECT,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "assignedToId references a user that does not exist" },
        { status: 400 }
      );
    }
    throw err;
  }

  // rawKey is returned ONCE here and never stored — caller must copy it now
  return NextResponse.json(
    {
      ...apiKey,
      rawKey,
      warning: "This is the only time the full API key will be shown. Copy it now — it cannot be retrieved again.",
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    }
  );
}
