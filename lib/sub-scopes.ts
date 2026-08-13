/**
 * Sub-scope service — business logic for ProjectSubScope and ProjectSubScopeInstance.
 *
 * Sub-scopes split a ScopeType within a unitType into named areas for independent tracking.
 * Example: "Cabinetry" for "2BR" units splits into "Kitchen Cabinetry" + "Bath Cabinetry".
 *
 * Key rules enforced here (not in routes):
 *  - At least 2 sub-scopes are required per group (enforced in route schema and service).
 *  - Instances are auto-created for every matching ProjectRow when definitions are saved.
 *  - Qty distribution modes:
 *      even   — each instance.qty = parentRow.qty / numSubScopes (recalculated per unit)
 *      manual — each instance.qty = the qty specified on the sub-scope definition
 *               (stored on ProjectSubScope.qty so future rows created via UPM upload
 *                can inherit the same amounts without the user re-entering them)
 *  - When instances exist for a row, direct scopeStage/scopeStatus updates are blocked.
 *  - New rows added via UPM upload get instances auto-created if definitions already exist.
 */

import type { PrismaClient } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubScopeInput {
  name: string;
  displayOrder?: number;
  /** Manual-mode qty. Required when distributionMode = "manual"; ignored for "even". */
  qty?: number;
}

export interface CreateSubScopesArgs {
  projectId: string;
  unitType: string;
  scopeTypeId: string;
  distributionMode: "even" | "manual";
  subScopes: SubScopeInput[];
  createdById: string;
}

export interface SubScopeDefinition {
  id: string;
  name: string;
  displayOrder: number;
  qty: number | null;
  unitType: string;
  scopeTypeId: string;
  scopeTypeName: string;
  createdAt: Date;
  instanceCount: number;
}

export interface SubScopeGroup {
  unitType: string;
  scopeTypeId: string;
  scopeTypeName: string;
  distributionMode: "even" | "manual";
  subScopes: SubScopeDefinition[];
  /**
   * Average qty from ProjectRow records matching (unitType, scopeTypeId) for this project.
   * Used in the management panel so installers know the total scope qty when assigning
   * manual distribution quantities. Undefined if no rows with qty exist.
   */
  unitScopeQty?: number;
}

export interface AddSubScopeToGroupArgs {
  projectId: string;
  unitType: string;
  scopeTypeId: string;
  name: string;
  /** Required when existing group is manual-mode; optional for even-mode (will be calculated). */
  qty?: number;
  createdById: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Divides a Decimal qty (may be null) evenly across numSubScopes.
 * Returns null if parent qty is null (can't split an unknown quantity).
 * Uses floating point — Decimal is converted to number for arithmetic, then
 * rounded to 4 decimal places to match the DB column precision.
 */
function evenSplitQty(
  parentQty: { toNumber(): number } | null,
  numSubScopes: number
): number | null {
  if (parentQty == null || numSubScopes === 0) return null;
  const raw = parentQty.toNumber() / numSubScopes;
  return Math.round(raw * 10000) / 10000;
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Creates sub-scope definitions for a (project, unitType, scopeType) combination
 * and auto-creates tracking instances for every matching ProjectRow.
 *
 * distributionMode controls qty allocation per instance:
 *  - "even":   instance.qty = parentRow.qty / numSubScopes
 *  - "manual": instance.qty = subScopeInput.qty (same amount on every matching row)
 *              The qty is also stored on the definition (ProjectSubScope.qty) so that
 *              future rows added via UPM upload get the same amounts automatically.
 *
 * Uses array-form $transaction (PgBouncer-safe — never use interactive form).
 * Returns the created definitions.
 */
export async function createSubScopesWithInstances(
  db: PrismaClient,
  args: CreateSubScopesArgs
): Promise<SubScopeDefinition[]> {
  const { projectId, unitType, scopeTypeId, distributionMode, subScopes, createdById } = args;

  // Find all rows matching (projectId, unitType, scopeTypeId) — include qty for even-split
  const matchingRows = await db.projectRow.findMany({
    where: { projectId, unitType, scopeTypeId },
    select: { id: true, qty: true },
  });

  const numSubScopes = subScopes.length;

  // Build definition creates — for manual mode, persist qty on the definition itself
  const definitionCreates = subScopes.map((s, idx) =>
    db.projectSubScope.create({
      data: {
        projectId,
        scopeTypeId,
        unitType,
        name: s.name,
        displayOrder: s.displayOrder ?? idx,
        qty: distributionMode === "manual" ? (s.qty ?? null) : null,
        createdById,
      },
    })
  );

  // Execute all definition creates first (needed to get IDs for instances)
  const created = await db.$transaction(definitionCreates);

  // Build instance creates: one per (definition × matching row)
  if (matchingRows.length > 0) {
    const instanceCreates = created.flatMap((def, defIdx) =>
      matchingRows.map((row) => {
        let instanceQty: number | null = null;
        if (distributionMode === "even") {
          instanceQty = evenSplitQty(row.qty, numSubScopes);
        } else {
          // manual — use the qty from the original input for this definition
          instanceQty = subScopes[defIdx]?.qty ?? null;
        }
        return db.projectSubScopeInstance.create({
          data: {
            subScopeId: def.id,
            rowId: row.id,
            qty: instanceQty,
          },
        });
      })
    );
    await db.$transaction(instanceCreates);
  }

  // Return enriched definitions with instance counts
  return created.map((def, idx) => ({
    id: def.id,
    name: def.name,
    displayOrder: def.displayOrder,
    qty: def.qty != null ? Number(def.qty) : null,
    unitType: def.unitType,
    scopeTypeId: def.scopeTypeId,
    scopeTypeName: "", // caller enriches this from the scopeType relation if needed
    createdAt: def.createdAt,
    instanceCount: matchingRows.length,
    // Pass back the input qty for manual mode (def.qty was just set from it)
    _inputQty: subScopes[idx]?.qty ?? null,
  }));
}

/**
 * Returns all sub-scope definitions for a project, grouped by (unitType, scopeType).
 * Each definition includes its instance count and qty (if manual mode).
 * distributionMode is derived: if any sub-scope in the group has a non-null qty → "manual".
 */
export async function getSubScopesForProject(
  db: PrismaClient,
  projectId: string
): Promise<SubScopeGroup[]> {
  const definitions = await db.projectSubScope.findMany({
    where: { projectId },
    include: {
      scopeType: true,
      _count: { select: { instances: true } },
    },
    orderBy: [{ unitType: "asc" }, { scopeType: { name: "asc" } }, { displayOrder: "asc" }],
  });

  // Group by (unitType, scopeTypeId)
  const groupMap = new Map<string, SubScopeGroup>();
  for (const def of definitions) {
    const key = `${def.unitType}::${def.scopeTypeId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        unitType: def.unitType,
        scopeTypeId: def.scopeTypeId,
        scopeTypeName: def.scopeType.name,
        distributionMode: "even", // default; overridden below if any def has qty set
        subScopes: [],
      });
    }
    const group = groupMap.get(key)!;
    if (def.qty != null) {
      group.distributionMode = "manual";
    }
    group.subScopes.push({
      id: def.id,
      name: def.name,
      displayOrder: def.displayOrder,
      qty: def.qty != null ? Number(def.qty) : null,
      unitType: def.unitType,
      scopeTypeId: def.scopeTypeId,
      scopeTypeName: def.scopeType.name,
      createdAt: def.createdAt,
      instanceCount: def._count.instances,
    });
  }

  // Enrich each group with the average scope qty from matching ProjectRows so the
  // management panel can display "Scope total: X per unit" as reference context.
  const groupConditions = Array.from(groupMap.values()).map((g) => ({
    unitType: g.unitType,
    scopeTypeId: g.scopeTypeId,
  }));

  if (groupConditions.length > 0) {
    const rowQtys = await db.projectRow.findMany({
      where: { projectId, qty: { not: null }, OR: groupConditions },
      select: { unitType: true, scopeTypeId: true, qty: true },
    });

    const qtyAccum = new Map<string, { sum: number; count: number }>();
    for (const row of rowQtys) {
      if (!row.scopeTypeId || row.qty == null) continue;
      const key = `${row.unitType}::${row.scopeTypeId}`;
      const cur = qtyAccum.get(key) ?? { sum: 0, count: 0 };
      cur.sum += Number(row.qty);
      cur.count += 1;
      qtyAccum.set(key, cur);
    }

    for (const [key, { sum, count }] of qtyAccum.entries()) {
      const group = groupMap.get(key);
      if (group) group.unitScopeQty = sum / count;
    }
  }

  return Array.from(groupMap.values());
}

/**
 * Returns true if a ProjectRow has any ProjectSubScopeInstance records.
 * Used by the PATCH /units/[rowId] route to block direct stage/status updates.
 */
export async function hasSubScopeInstances(
  db: PrismaClient,
  rowId: string
): Promise<boolean> {
  const count = await db.projectSubScopeInstance.count({
    where: { rowId },
  });
  return count > 0;
}

/**
 * For each newly-added row (by ID), checks if sub-scope definitions already exist
 * for that row's (projectId, unitType, scopeTypeId) combination. If so, creates
 * the missing instances.
 *
 * Qty on instances:
 *  - If the matching sub-scope definition has qty set (manual mode) → use that qty
 *  - If qty is null (even mode) → calculate parentRow.qty / numSubScopesInGroup
 *
 * Called by POST /api/projects/[id]/units after a UPM upload so that new rows
 * automatically inherit any existing sub-scope structure.
 */
export async function autoCreateInstancesForNewRows(
  db: PrismaClient,
  projectId: string,
  newRowIds: string[]
): Promise<void> {
  if (newRowIds.length === 0) return;

  // Fetch the new rows with their unitType, scopeTypeId, and qty (for even-split)
  const newRows = await db.projectRow.findMany({
    where: { id: { in: newRowIds }, projectId },
    select: { id: true, unitType: true, scopeTypeId: true, qty: true },
  });

  if (newRows.length === 0) return;

  // Collect unique (unitType, scopeTypeId) combinations present in the new rows
  const combos = new Set<string>();
  for (const row of newRows) {
    if (row.scopeTypeId) {
      combos.add(`${row.unitType}::${row.scopeTypeId}`);
    }
  }

  if (combos.size === 0) return;

  // Find existing sub-scope definitions matching those combos — include qty
  const definitions = await db.projectSubScope.findMany({
    where: {
      projectId,
      OR: Array.from(combos).map((combo) => {
        const [unitType, scopeTypeId] = combo.split("::");
        return { unitType, scopeTypeId };
      }),
    },
    select: { id: true, unitType: true, scopeTypeId: true, qty: true },
  });

  if (definitions.length === 0) return;

  // Build a lookup: "unitType::scopeTypeId" → definitions (with qty)
  const defsByCombo = new Map<string, typeof definitions>();
  for (const def of definitions) {
    const key = `${def.unitType}::${def.scopeTypeId}`;
    if (!defsByCombo.has(key)) defsByCombo.set(key, []);
    defsByCombo.get(key)!.push(def);
  }

  // Create instances for each new row × matching definitions
  const instanceCreates = newRows.flatMap((row) => {
    if (!row.scopeTypeId) return [];
    const key = `${row.unitType}::${row.scopeTypeId}`;
    const defs = defsByCombo.get(key) ?? [];
    const numSubScopes = defs.length;

    return defs.map((def) => {
      let instanceQty: number | null = null;
      if (def.qty != null) {
        // Manual mode — use the stored definition qty (.toNumber() is Prisma Decimal's method)
        instanceQty = def.qty.toNumber();
      } else {
        // Even mode — divide this row's qty across the group
        instanceQty = evenSplitQty(row.qty, numSubScopes);
      }
      return db.projectSubScopeInstance.create({
        data: { subScopeId: def.id, rowId: row.id, qty: instanceQty },
      });
    });
  });

  if (instanceCreates.length > 0) {
    await db.$transaction(instanceCreates);
  }
}

/**
 * Adds a single sub-scope to an existing (project, unitType, scopeType) group and
 * auto-creates tracking instances for every matching ProjectRow.
 *
 * Qty per instance:
 *  - Even mode (no qty on args): parentRow.qty / totalSubScopesInGroupAfterAdd
 *    (note: existing instances are not retroactively changed — only new instance gets
 *     recalculated qty; this is a known limitation of post-hoc adds in even mode)
 *  - Manual mode (qty provided on args): uses the provided qty for every instance
 *
 * The new sub-scope is appended after the last existing one (displayOrder = max + 1).
 */
export async function addSubScopeToGroup(
  db: PrismaClient,
  args: AddSubScopeToGroupArgs
): Promise<SubScopeDefinition> {
  const { projectId, unitType, scopeTypeId, name, qty, createdById } = args;

  // Count existing sub-scopes in the group so we can set displayOrder and calculate even-split
  const existingDefs = await db.projectSubScope.findMany({
    where: { projectId, unitType, scopeTypeId },
    select: { id: true, displayOrder: true },
    orderBy: { displayOrder: "asc" },
  });

  const nextDisplayOrder =
    existingDefs.length > 0
      ? Math.max(...existingDefs.map((d) => d.displayOrder)) + 1
      : 0;

  // Total group size after addition (for even-split calculation)
  const totalAfterAdd = existingDefs.length + 1;

  // Create the new definition
  const newDef = await db.projectSubScope.create({
    data: {
      projectId,
      scopeTypeId,
      unitType,
      name: name.trim(),
      displayOrder: nextDisplayOrder,
      qty: qty ?? null,
      createdById,
    },
  });

  // Find all rows matching (projectId, unitType, scopeTypeId)
  const matchingRows = await db.projectRow.findMany({
    where: { projectId, unitType, scopeTypeId },
    select: { id: true, qty: true },
  });

  if (matchingRows.length > 0) {
    const instanceCreates = matchingRows.map((row) => {
      const instanceQty =
        qty != null
          ? qty // manual mode — use the explicit qty
          : evenSplitQty(row.qty, totalAfterAdd); // even mode — recalculate for this new sub-scope
      return db.projectSubScopeInstance.create({
        data: { subScopeId: newDef.id, rowId: row.id, qty: instanceQty },
      });
    });
    await db.$transaction(instanceCreates);
  }

  return {
    id: newDef.id,
    name: newDef.name,
    displayOrder: newDef.displayOrder,
    qty: newDef.qty != null ? Number(newDef.qty) : null,
    unitType: newDef.unitType,
    scopeTypeId: newDef.scopeTypeId,
    scopeTypeName: "", // caller enriches from scopeType relation if needed
    createdAt: newDef.createdAt,
    instanceCount: matchingRows.length,
  };
}
