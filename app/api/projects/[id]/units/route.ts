import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { db } from "@/lib/db";
import { PERMISSIONS, hasPermission } from "@/lib/permissions";
import { insertProjectRows } from "@/lib/project-rows";
import { fullRowKeyFromParts, fullRowKeyFromSpreadsheetRow } from "@/lib/project-row-matching";
import { getOverwriteBlockStatus } from "@/lib/units-overwrite-guard";
import { relinkScopeTagsForProject } from "@/lib/field-notes/relink-scope-tags";
import { getActivityReplayMetadata, logActivity, resolveActorName } from "@/lib/activity-logger";
import { logApi, apiTimer } from "@/lib/api-logger";
import {
  buildProjectRowGlobalSearchWhere,
  normalizeUnitsSearchQuery,
  tourDemoRowMatchesGlobalSearch,
} from "@/lib/project-row-global-search";
import { TOUR_DEMO_PROJECT_ID, TOUR_DEMO_UNITS } from "@/lib/tour-demo-data";
import { autoCreateInstancesForNewRows } from "@/lib/sub-scopes";
import {
  enforceProductionProjectMutation,
  enforceProjectReadVisibility,
} from "@/lib/production-project-access";
import {
  EMPTY_ISSUE_META,
  PROJECT_ROW_INCLUDE,
  createIssueMetaBuilder,
  enrichUnitRowsWithGridInspection,
  loadProjectIssuesForMeta,
  serializeUnitRow,
  type ProjectRowWithRelations,
  type ProjectScopeOverrideMap,
  type CanonicalShape,
} from "@/lib/project-units-serialize";

const UNITS_PAGE_MAX = 200;

async function loadScopeOverrideMap(projectId: string): Promise<ProjectScopeOverrideMap> {
  const overrides = await db.projectScopeOverride.findMany({
    where: { projectId },
    select: {
      scopeTypeId: true,
      canonicalScopeType: { select: { id: true, code: true, displayName: true } },
    },
  });
  const map = new Map<string, CanonicalShape>();
  for (const ov of overrides) {
    map.set(ov.scopeTypeId, ov.canonicalScopeType);
  }
  return map;
}

const AddUnitsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  mode: z.enum(["add", "merge", "overwrite"]).optional().default("add"),
  forceOverwrite: z.boolean().optional().default(false),
  source: z.enum(["upload", "paste", "menu"]).optional(),
});

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) return { user: { id: "dev-user", role: "ADMIN" } };
  const { auth } = await import("@/lib/auth");
  return auth();
}

interface UnitsCursorPayload {
  rowIndex: number;
  id: string;
}

function encodeUnitsCursor(c: UnitsCursorPayload): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeUnitsCursor(s: string): UnitsCursorPayload | null {
  try {
    const json = Buffer.from(s, "base64url").toString("utf8");
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== "object") return null;
    const rowIndex = (o as { rowIndex?: unknown }).rowIndex;
    const id = (o as { id?: unknown }).id;
    if (typeof rowIndex !== "number" || !Number.isInteger(rowIndex) || typeof id !== "string" || id.length === 0) {
      return null;
    }
    return { rowIndex, id };
  } catch {
    return null;
  }
}

function unitsBaseWhere(projectId: string, searchQ: string): Prisma.ProjectRowWhereInput {
  if (!searchQ) {
    return { projectId };
  }
  return {
    AND: [{ projectId }, buildProjectRowGlobalSearchWhere(searchQ)],
  };
}

/**
 * GET /api/projects/[id]/units
 *
 * Without query `limit`: returns all ProjectRow rows, ordered by rowIndex then id.
 * With `limit` (1–200): keyset-paginated slice; optional `cursor` (opaque) for the next page.
 * Paginated responses include `hasMore`, `nextCursor` (null when done). On the first page only: `total`
 * (scope row count) and `totalUnits` (distinct building+level+unit count) for the current filter.
 * Optional `search`: case-insensitive substring across string columns and related lookup name/code (Field Tracker "all columns").
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("GET", "/api/projects/[id]/units", 401, "Unauthorized — no active session", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const canReadUnits =
    hasPermission(role, PERMISSIONS.VIEW_UPM) ||
    hasPermission(role, PERMISSIONS.MANAGE_PROJECTS) ||
    hasPermission(role, PERMISSIONS.MANAGE_UNIT_STATUS);
  if (!canReadUnits) {
    logApi("GET", "/api/projects/[id]/units", 403, `Forbidden — role "${role}" lacks unit read access`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const searchQ = normalizeUnitsSearchQuery(searchParams.get("search"));
  const limitRaw = searchParams.get("limit");
  const wantsPagination = limitRaw !== null && limitRaw !== "";
  let pageLimit: number | null = null;
  if (wantsPagination) {
    const n = parseInt(limitRaw, 10);
    if (!Number.isFinite(n)) {
      logApi("GET", `/api/projects/${id}/units`, 400, "Invalid limit", elapsed(), { error: "Invalid limit" });
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }
    pageLimit = Math.min(UNITS_PAGE_MAX, Math.max(1, n));
  }

  if (id === TOUR_DEMO_PROJECT_ID) {
    const demoFiltered = searchQ
      ? TOUR_DEMO_UNITS.filter((r) => tourDemoRowMatchesGlobalSearch(searchQ, r as Record<string, unknown>))
      : TOUR_DEMO_UNITS;
    const demoUnits = demoFiltered.map((u) => ({
      ...u,
      clearInspection: null,
      issueMeta: EMPTY_ISSUE_META,
    }));
    if (wantsPagination && pageLimit != null) {
      const unitKeys = new Set(demoFiltered.map((r) => `${r.building}|${r.level}|${r.unit}`));
      return NextResponse.json({
        units: demoUnits,
        hasMore: false,
        nextCursor: null,
        total: demoFiltered.length,
        totalUnits: unitKeys.size,
      });
    }
    return NextResponse.json({ units: demoUnits });
  }

  const readBlock = await enforceProjectReadVisibility(id, session);
  if (readBlock) return readBlock;

  const orderBy: Prisma.ProjectRowOrderByWithRelationInput[] = [{ rowIndex: "asc" }, { id: "asc" }];

  const baseWhere = unitsBaseWhere(id, searchQ);

  if (!wantsPagination || pageLimit == null) {
    const [units, projectIssues, projectScopeOverrides] = await Promise.all([
      db.projectRow.findMany({
        where: baseWhere,
        orderBy,
        include: PROJECT_ROW_INCLUDE,
      }),
      loadProjectIssuesForMeta(id),
      loadScopeOverrideMap(id),
    ]);
    const buildIssueMeta = createIssueMetaBuilder(projectIssues);
    const rows = await enrichUnitRowsWithGridInspection(
      id,
      units.map((u) => serializeUnitRow(u, buildIssueMeta, { projectScopeOverrides })),
    );
    logApi("GET", `/api/projects/${id}/units`, 200, `Returned ${rows.length} unit rows`, elapsed(), null);
    return NextResponse.json({ units: rows });
  }

  const cursorParam = searchParams.get("cursor")?.trim() ?? "";
  let cursor: UnitsCursorPayload | null = null;
  if (cursorParam.length > 0) {
    cursor = decodeUnitsCursor(cursorParam);
    if (!cursor) {
      logApi("GET", `/api/projects/${id}/units`, 400, "Invalid cursor", elapsed(), { error: "Invalid cursor" });
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
  }

  const take = pageLimit + 1;
  const where: Prisma.ProjectRowWhereInput =
    cursor == null
      ? baseWhere
      : {
          AND: [
            baseWhere,
            {
              OR: [
                { rowIndex: { gt: cursor.rowIndex } },
                { AND: [{ rowIndex: cursor.rowIndex }, { id: { gt: cursor.id } }] },
              ],
            },
          ],
        };

  const [projectIssues, projectScopeOverrides] = await Promise.all([
    loadProjectIssuesForMeta(id),
    loadScopeOverrideMap(id),
  ]);
  const buildIssueMeta = createIssueMetaBuilder(projectIssues);

  let units: ProjectRowWithRelations[];
  let total: number | undefined;
  let totalUnits: number | undefined;

  if (cursor == null) {
    const [fetched, count, unitGroups] = await Promise.all([
      db.projectRow.findMany({
        where,
        orderBy,
        take,
        include: PROJECT_ROW_INCLUDE,
      }),
      db.projectRow.count({ where: baseWhere }),
      db.projectRow.groupBy({
        by: ["building", "level", "unit"],
        where: baseWhere,
        _count: { _all: true },
      }),
    ]);
    units = fetched;
    total = count;
    totalUnits = unitGroups.length;
  } else {
    units = await db.projectRow.findMany({
      where,
      orderBy,
      take,
      include: PROJECT_ROW_INCLUDE,
    });
  }

  const hasMore = units.length > pageLimit;
  const slice = hasMore ? units.slice(0, pageLimit) : units;
  const rows = await enrichUnitRowsWithGridInspection(
    id,
    slice.map((u) => serializeUnitRow(u, buildIssueMeta, { projectScopeOverrides })),
  );
  const last = slice[slice.length - 1];
  const nextCursor = hasMore && last ? encodeUnitsCursor({ rowIndex: last.rowIndex, id: last.id }) : null;

  const payload: Record<string, unknown> = {
    units: rows,
    hasMore,
    nextCursor,
  };
  if (total !== undefined) {
    payload.total = total;
  }
  if (totalUnits !== undefined) {
    payload.totalUnits = totalUnits;
  }

  logApi(
    "GET",
    `/api/projects/${id}/units`,
    200,
    `Returned ${rows.length} unit rows (paginated, hasMore=${hasMore})`,
    elapsed(),
    null
  );
  return NextResponse.json(payload);
}

/**
 * POST /api/projects/[id]/units
 *
 * Add rows to an existing project. Accepts UPM spreadsheet format.
 * Body: { rows: Record<string, string>[], mode?: "add" | "merge" | "overwrite" }
 * - add: append all rows to the bottom
 * - merge: only add rows that don't already exist (by building+level+unit+description)
 * - overwrite: delete all existing rows, then insert file rows
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const elapsed = apiTimer();
  const session = await getSession();
  if (!session?.user) {
    logApi("POST", "/api/projects/[id]/units", 401, "Unauthorized", elapsed(), { error: "Unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = session.user.role;
  if (!userRole || (!hasPermission(userRole, PERMISSIONS.EDIT_UPM) && !hasPermission(userRole, PERMISSIONS.MANAGE_PROJECTS))) {
    logApi("POST", "/api/projects/[id]/units", 403, `Forbidden — role "${userRole}" lacks EDIT_UPM or MANAGE_PROJECTS`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const prodBlock = await enforceProductionProjectMutation(id, session);
  if (prodBlock) return prodBlock;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = AddUnitsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  const { rows: rawRows, mode, forceOverwrite, source } = parsed.data;

  // Sanitize rows: coerce to Record<string, string>, skip empty rows
  const unitsRows: Record<string, string>[] = [];
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (typeof k === "string" && k.trim()) {
        clean[k] = v == null || v === "" ? "" : String(v);
      }
    }
    const allEmpty = Object.values(clean).every((v) => !String(v).trim());
    if (allEmpty) {
      if (rawRows.length === 1) unitsRows.push(clean); // Allow single empty row for "Add row"
      continue;
    }
    unitsRows.push(clean);
  }

  if (unitsRows.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0, message: "No rows to add" }, { status: 200 });
  }

  // Overwrite mode is destructive (deletes all existing rows). Require EDIT_UPM —
  // MANAGE_PROJECTS alone (e.g. INSTALL_MANAGER) is intentionally insufficient.
  if (mode === "overwrite" && !hasPermission(userRole, PERMISSIONS.EDIT_UPM)) {
    logApi("POST", `/api/projects/${id}/units`, 403, `Forbidden — overwrite requires EDIT_UPM, role "${userRole}" lacks it`, elapsed(), { error: "Forbidden" });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = session.user.id;

  let rowsToInsert = unitsRows;
  let skipped = 0;

  if (mode === "overwrite") {
    const blockStatus = await getOverwriteBlockStatus(db, id);
    const isAdminForce = forceOverwrite === true && userRole === "ADMIN";
    if (blockStatus.blocked && !isAdminForce) {
      logApi(
        "POST",
        `/api/projects/${id}/units`,
        409,
        "Overwrite blocked — field data exists on project",
        elapsed(),
        blockStatus.counts,
      );
      return NextResponse.json(
        {
          error: "overwrite_blocked",
          reason: "field_data_exists",
          counts: blockStatus.counts,
        },
        { status: 409 },
      );
    }

    const deletedCount = await db.projectRow.count({ where: { projectId: id } });
    if (deletedCount > 0) {
      const userName = await resolveActorName(actorId);
      void logActivity(id, actorId, userName, {
        eventType: "UNIT_ROWS_BULK_DELETED",
        count: deletedCount,
        unitRefs: [],
        mode: "overwrite",
        ...getActivityReplayMetadata(request.headers),
      });
    }

    await db.projectRow.deleteMany({ where: { projectId: id } });
  } else if (mode === "merge") {
    const existing = await db.projectRow.findMany({
      where: { projectId: id },
      select: { building: true, level: true, unit: true, description: true },
    });
    const existingKeys = new Set(
      existing.map((r) =>
        fullRowKeyFromParts({
          building: r.building,
          level: r.level,
          unit: r.unit,
          description: r.description,
        }),
      ),
    );
    rowsToInsert = unitsRows.filter((r) => {
      const key = fullRowKeyFromSpreadsheetRow(r);
      if (existingKeys.has(key)) {
        skipped++;
        return false;
      }
      existingKeys.add(key);
      return true;
    });
  }

  if (rowsToInsert.length === 0) {
    logApi("POST", `/api/projects/${id}/units`, 200, `Merge: 0 new rows (${skipped} already existed)`, elapsed(), { added: 0, skipped });
    return NextResponse.json({ added: 0, skipped, message: "All rows already exist" }, { status: 200 });
  }

  const maxRow =
    mode === "overwrite"
      ? { _max: { rowIndex: -1 as number } }
      : await db.projectRow.aggregate({
          where: { projectId: id },
          _max: { rowIndex: true },
        });
  const startRowIndex = (maxRow._max.rowIndex ?? -1) + 1;

  // Call insertProjectRows directly on db — no interactive transaction.
  // PgBouncer in transaction pooling mode drops the connection between
  // Prisma's transaction keepalive and the next query.
  let unlinkedScopeTypes: import("@/lib/project-rows").UnlinkedScopeType[] = [];
  try {
    const result = await insertProjectRows(db, id, rowsToInsert, startRowIndex);
    unlinkedScopeTypes = result.unlinkedScopeTypes;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logApi("POST", `/api/projects/${id}/units`, 500, `Insert failed: ${message}`, elapsed(), { error: message });
    return NextResponse.json({ error: "Failed to add rows", detail: message }, { status: 500 });
  }

  let addedRowIds: string[] = [];
  try {
    const newRows = await db.projectRow.findMany({
      where: { projectId: id, rowIndex: { gte: startRowIndex } },
      select: { id: true },
      orderBy: { rowIndex: "asc" },
    });
    addedRowIds = newRows.map((r) => r.id);
    if (newRows.length > 0) {
      await autoCreateInstancesForNewRows(db, id, addedRowIds);
    }
  } catch (err) {
    console.warn("[POST /api/projects/[id]/units] sub-scope instance backfill failed:", err);
  }

  if (mode === "merge" || mode === "add") {
    try {
      await relinkScopeTagsForProject(db, id);
    } catch (err) {
      console.warn("[POST /api/projects/[id]/units] scope tag relink failed:", err);
    }
  }

  const userName = await resolveActorName(actorId);
  void logActivity(id, actorId, userName, {
    eventType: "UNIT_ROW_CREATED",
    count: rowsToInsert.length,
    mode,
    unitRefs: [],
    ...(source ? { source } : {}),
    ...getActivityReplayMetadata(request.headers),
  });

  logApi("POST", `/api/projects/${id}/units`, 201, `Added ${rowsToInsert.length} rows${skipped > 0 ? ` (${skipped} skipped as duplicates)` : ""}`, elapsed(), { added: rowsToInsert.length, skipped });

  return NextResponse.json(
    {
      added: rowsToInsert.length,
      skipped,
      addedRowIds,
      message: `Added ${rowsToInsert.length} row${rowsToInsert.length !== 1 ? "s" : ""}`,
      unlinkedScopeTypes,
    },
    { status: 201 },
  );
}
