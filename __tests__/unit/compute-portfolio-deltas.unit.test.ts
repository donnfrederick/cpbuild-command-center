import { describe, expect, it } from "vitest";
import type { ActivityLog } from "@prisma/client";
import { computePortfolioDeltas } from "@/lib/reports/compute-portfolio-deltas";
import type { PortfolioProgressDbRow } from "@/lib/reports/compute-portfolio-progress";

function row(overrides: Partial<PortfolioProgressDbRow> = {}): PortfolioProgressDbRow {
  return {
    id: "row-1",
    building: "A",
    level: "3",
    unit: "301",
    qty: 10,
    scopeStage: "INSTALL",
    scopeStatus: "COMPLETE",
    inspectionStatus: null,
    hasOpenIssue: false,
    unifierSubId: null,
    scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
    installer: { name: "Premier Cabinets LLC" },
    subScopeInstances: [],
    ...overrides,
  };
}

function activity(
  overrides: Partial<ActivityLog> & { metadata: Record<string, unknown> },
): ActivityLog {
  return {
    id: "log-1",
    projectId: "proj-1",
    userId: null,
    userName: null,
    eventType: "SCOPE_STATUS_UPDATED",
    metadata: overrides.metadata,
    createdAt: new Date("2025-06-01T12:00:00Z"),
    testSeedBatchId: null,
    ...overrides,
  } as ActivityLog;
}

describe("computePortfolioDeltas", () => {
  it("returns null verified delta when status unchanged in period", () => {
    const dbRows = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
    ];
    const result = computePortfolioDeltas(dbRows, [], []);
    expect(result.scopeDeltas.Cabinets?.verifiedDelta ?? null).toBeNull();
  });

  it("computes positive verified delta when row completes in period", () => {
    const dbRows = [
      row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
    ];
    const periodEvents = [
      activity({
        eventType: "SCOPE_STATUS_UPDATED",
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.scopeDeltas.Cabinets?.verifiedDelta).toBe(100);
    expect(result.updatedUnitKeys.has("row:row-1")).toBe(true);
  });

  it("reverse replay yields lower pct at period start", () => {
    const dbRows = [
      row({ qty: 10, scopeStage: "INSTALL", scopeStatus: "COMPLETE" }),
    ];
    const periodEvents = [
      activity({
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    const startPct = result.startReportRows[0]?.scopeStage === "INSTALL" &&
      result.startReportRows[0]?.scopeStatus === "IN_PROGRESS";
    expect(startPct).toBe(true);
  });

  it("computes sub delta when row moves into pending verification", () => {
    const dbRows = [
      row({ qty: 10, scopeStage: "INSTALL", scopeStatus: "PENDING_VERIFICATION" }),
    ];
    const periodEvents = [
      activity({
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "PENDING_VERIFICATION",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.scopeDeltas.Cabinets?.subDelta).toBe(100);
    expect(result.updatedUnitKeys.has("row:row-1")).toBe(true);
  });

  it("handles bulk scope update events for unit refs", () => {
    const dbRows = [
      row({
        id: "row-1",
        building: "A",
        level: "3",
        unit: "301",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      }),
    ];
    const periodEvents = [
      activity({
        eventType: "SCOPE_STATUS_BULK_UPDATED",
        metadata: {
          unitRefs: [{ building: "A", level: "3", unit: "301" }],
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.updatedUnitKeys.has("row:row-1")).toBe(true);
    expect(result.scopeDeltas.Cabinets?.verifiedUnitDelta).toBe(1);
  });

  it("counts one location per transition even when row qty is large", () => {
    const dbRows = [
      row({
        id: "row-1",
        qty: 137,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
    ];
    const periodEvents = [
      activity({
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.scopeDeltas.Cabinets?.verifiedUnitDelta).toBe(1);
    expect(result.cellDeltas["3|Cabinets"]?.verifiedUnitDelta).toBe(1);
  });

  it("reverse-replays bulk updates when DB already reflects bulk target status", () => {
    const dbRows = [
      row({
        id: "row-1",
        building: "A",
        level: "3",
        unit: "301",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
    ];
    const periodEvents = [
      activity({
        eventType: "SCOPE_STATUS_BULK_UPDATED",
        metadata: {
          unitRefs: [{ building: "A", level: "3", unit: "301" }],
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.scopeDeltas.Cabinets?.verifiedDelta).toBe(100);
    expect(result.updatedUnitKeys.has("row:row-1")).toBe(true);
  });

  it("reverse-replays bulk complete assuming in-progress prior when metadata omits from state", () => {
    const dbRows = [
      row({
        id: "row-1",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "COMPLETE",
      }),
    ];
    const periodEvents = [
      activity({
        eventType: "SCOPE_STATUS_BULK_UPDATED",
        metadata: {
          unitRefs: [{ building: "A", level: "3", unit: "301" }],
          scopeStage: "INSTALL",
          scopeStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.startReportRows[0]?.scopeStatus).toBe("IN_PROGRESS");
  });

  it("marks updatedUnitKeys when bulk undo occurs in period", () => {
    const dbRows = [
      row({
        id: "row-1",
        qty: 10,
        scopeStage: "INSTALL",
        scopeStatus: "IN_PROGRESS",
      }),
    ];
    const periodEvents = [
      activity({
        eventType: "SCOPE_STATUS_BULK_UNDONE",
        metadata: {
          unitRefs: [{ building: "A", level: "3", unit: "301" }],
          count: 1,
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.updatedUnitKeys.has("row:row-1")).toBe(true);
  });

  it("tracks lastUpdatedOnByCell for any status change in history", () => {
    const dbRows = [row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" })];
    const historyEvents = [
      activity({
        createdAt: new Date("2025-05-01T10:00:00Z"),
        metadata: {
          rowId: "row-1",
          fromStage: null,
          fromStatus: "NOT_STARTED",
          toStage: "INSTALL",
          toStatus: "IN_PROGRESS",
        },
      }),
      activity({
        id: "log-2",
        createdAt: new Date("2025-06-01T12:00:00Z"),
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, [], historyEvents);
    // Most recent event (Jun 1) should win
    expect(result.lastUpdatedOnByCell.get("3|Cabinets")).toBe("2025-06-01");
  });

  it("lastUpdatedOnByCell reflects the most recent event when multiple events occur", () => {
    const dbRows = [row({ scopeStage: "INSTALL", scopeStatus: "COMPLETE" })];
    const historyEvents = [
      activity({
        id: "log-a",
        createdAt: new Date("2025-04-10T09:00:00Z"),
        metadata: {
          rowId: "row-1",
          fromStage: null,
          fromStatus: "NOT_STARTED",
          toStage: "INSTALL",
          toStatus: "IN_PROGRESS",
        },
      }),
      activity({
        id: "log-b",
        createdAt: new Date("2025-05-20T15:00:00Z"),
        metadata: {
          rowId: "row-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, [], historyEvents);
    expect(result.lastUpdatedOnByCell.get("3|Cabinets")).toBe("2025-05-20");
    // Older date must not appear
    expect(result.lastUpdatedOnByCell.get("3|Cabinets")).not.toBe("2025-04-10");
  });

  it("aggregates sub-scope instance unit deltas under parent scope display name", () => {
    const dbRows = [
      row({
        id: "row-1",
        qty: null,
        scopeStage: null,
        scopeStatus: null,
        scopeType: { name: "Cabinets", canonicalScopeType: { displayName: "Cabinets" } },
        subScopeInstances: [
          {
            id: "inst-1",
            qty: 5,
            scopeStage: "INSTALL",
            scopeStatus: "COMPLETE",
            subScope: { name: "Upper Cabinets" },
          },
        ],
      }),
    ];
    const periodEvents = [
      activity({
        eventType: "SUB_SCOPE_INSTANCE_UPDATED",
        metadata: {
          instanceId: "inst-1",
          fromStage: "INSTALL",
          fromStatus: "IN_PROGRESS",
          toStage: "INSTALL",
          toStatus: "COMPLETE",
        },
      }),
    ];
    const result = computePortfolioDeltas(dbRows, periodEvents, periodEvents);
    expect(result.scopeDeltas.Cabinets?.verifiedUnitDelta).toBe(1);
    expect(result.cellDeltas["3|Cabinets"]?.verifiedUnitDelta).toBe(1);
  });
});
