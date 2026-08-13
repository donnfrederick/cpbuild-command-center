/**
 * GET /api/users/[id]/unifier-tasks
 *
 * Returns pending Unifier workflow tasks assigned to the given CC user.
 * Requires the user to have a linked Unifier account (unifierUserId set).
 *
 * Filters UNIFIER_SYS_TASK rows where ASSIGNEE_ID matches the user's
 * unifierUserId, in memory (PDS has no server-side filtering).
 *
 * Auth: The requesting user must be the user themselves, or an ADMIN.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchAllRows } from "@/lib/unifier/client";
import { getTableDef } from "@/lib/unifier/schema-definition";
import type { ApiError } from "@/types";

// ─── In-memory TTL cache for the tasks table ─────────────────────────────────
// Tasks are fetched per-request but the underlying table changes infrequently.
// A 5-minute cache avoids hammering Unifier when multiple users view their tasks.
const TASKS_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TASK_ROWS = 5000;
let tasksCache: { rows: Record<string, unknown>[]; expiresAt: number } | null = null;

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: userId } = await params;

  // Only the user themselves or an admin can view tasks
  const isSelf = session.user.id === userId;
  const isAdmin = hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES);
  if (!isSelf && !isAdmin) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, unifierUserId: true, unifierUsername: true },
  });

  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  if (!user.unifierUserId) {
    return NextResponse.json(
      { data: [], total: 0, message: "This user has no linked Unifier account." }
    );
  }

  const columns = getTableDef("UNIFIER_SYS_TASK")?.columns.map((c) => c.code) ?? [];

  try {
    // Use the TTL cache to avoid a full-table scan on every request.
    let allTasks: Record<string, unknown>[];
    if (tasksCache && tasksCache.expiresAt > Date.now()) {
      allTasks = tasksCache.rows;
    } else {
      allTasks = await fetchAllRows<Record<string, unknown>>(
        "UNIFIER_SYS_TASK",
        columns,
        ["ID ASC"],
        MAX_TASK_ROWS
      );
      tasksCache = { rows: allTasks, expiresAt: Date.now() + TASKS_CACHE_TTL_MS };
    }

    // Filter to tasks assigned to this user's Unifier ID
    const tasks = allTasks.filter(
      (t) => t["ASSIGNEE_ID"] != null && String(t["ASSIGNEE_ID"]) === user.unifierUserId
    );

    return NextResponse.json({
      data: tasks,
      total: tasks.length,
      unifierUserId: user.unifierUserId,
      unifierUsername: user.unifierUsername,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json<ApiError>({ error: message }, { status: 502 });
  }
}
