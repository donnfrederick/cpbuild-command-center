import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { acceptInviteSchema } from "@/lib/validations/auth";
import type { ApiError } from "@/types";

const SALT_ROUNDS = 12;

// POST /api/invites/accept — Accept an invite and create account (public)
export async function POST(request: Request) {
  const body: unknown = await request.json();
  const parsed = acceptInviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 422 }
    );
  }

  const { token, name, password } = parsed.data;

  const invite = await db.invite.findUnique({ where: { token } });

  if (!invite) {
    return NextResponse.json<ApiError>({ error: "Invalid invite token" }, { status: 404 });
  }

  if (invite.acceptedAt) {
    return NextResponse.json<ApiError>({ error: "This invite has already been used" }, { status: 410 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json<ApiError>({ error: "This invite has expired" }, { status: 410 });
  }

  const existingUser = await db.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    return NextResponse.json<ApiError>(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    // Array-form transaction avoids the dedicated-connection requirement of
    // interactive transactions, which fails under PgBouncer connection pooling.
    await db.$transaction([
      db.user.create({
        data: {
          email: invite.email,
          name,
          passwordHash,
          roleId: invite.roleId,
        },
      }),
      db.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
  } catch (err) {
    // Unique constraint violation — another request created this user between
    // the pre-check above and the transaction (race condition).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json<ApiError>(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
    console.error("[invites/accept] transaction failed:", err);
    return NextResponse.json<ApiError>(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { data: { message: "Account created. You can now sign in." } },
    { status: 201 }
  );
}
