/**
 * Unit tests for the thin Unifier data-access stub modules.
 * Each module is a thin wrapper around fetchAllRows that optionally filters
 * by PROJECT_ID. We mock fetchAllRows and getTableDef and verify the plumbing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/unifier/client", () => ({
  fetchAllRows: vi.fn(),
}));

vi.mock("@/lib/unifier/schema-definition", () => ({
  getTableDef: vi.fn(() => ({
    columns: [{ code: "COL_A" }, { code: "COL_B" }],
  })),
}));

import { fetchAllRows } from "@/lib/unifier/client";
const mockFetchAllRows = vi.mocked(fetchAllRows);

// Helper: a row with a PROJECT_ID
const rowA = { PROJECT_ID: "proj-1", VALUE: "a" };
const rowB = { PROJECT_ID: "proj-2", VALUE: "b" };
const allRows = [rowA, rowB];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchAllRows.mockResolvedValue(allRows);
});

// ── financials ──────────────────────────────────────────────────────────────

import {
  getRawContracts,
  getRawPotentialChangeOrders,
} from "@/lib/unifier/financials";

describe("lib/unifier/financials", () => {
  it("getRawContracts returns all rows when no projectId", async () => {
    const result = await getRawContracts();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXUECON", ["COL_A", "COL_B"]);
  });

  it("getRawContracts filters by projectId", async () => {
    const result = await getRawContracts("proj-1");
    expect(result).toEqual([rowA]);
  });

  it("getRawPotentialChangeOrders returns all rows when no projectId", async () => {
    const result = await getRawPotentialChangeOrders();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXPCO", ["COL_A", "COL_B"]);
  });

  it("getRawPotentialChangeOrders filters by projectId", async () => {
    const result = await getRawPotentialChangeOrders("proj-2");
    expect(result).toEqual([rowB]);
  });
});

// ── inspections ─────────────────────────────────────────────────────────────

import {
  getRawTurnAroundInspections,
  getRawClearanceInspections,
} from "@/lib/unifier/inspections";

describe("lib/unifier/inspections", () => {
  it("getRawTurnAroundInspections returns all rows when no projectId", async () => {
    const result = await getRawTurnAroundInspections();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXTACIN", expect.any(Array));
  });

  it("getRawTurnAroundInspections filters by projectId", async () => {
    const result = await getRawTurnAroundInspections("proj-1");
    expect(result).toEqual([rowA]);
  });

  it("getRawClearanceInspections returns all rows when no projectId", async () => {
    const result = await getRawClearanceInspections();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXCLEARI", expect.any(Array));
  });

  it("getRawClearanceInspections filters by projectId", async () => {
    const result = await getRawClearanceInspections("proj-2");
    expect(result).toEqual([rowB]);
  });
});

// ── locations ───────────────────────────────────────────────────────────────

import { getRawLocations } from "@/lib/unifier/locations";

describe("lib/unifier/locations", () => {
  it("returns all rows when no projectId provided", async () => {
    const result = await getRawLocations();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXLOC", expect.any(Array));
  });

  it("filters rows by projectId", async () => {
    const result = await getRawLocations("proj-2");
    expect(result).toEqual([rowB]);
  });

  it("returns empty array when no rows match the projectId", async () => {
    const result = await getRawLocations("proj-999");
    expect(result).toEqual([]);
  });
});

// ── reports ─────────────────────────────────────────────────────────────────

import {
  getRawProjectStatusReports,
  getRawDailyActivityReports,
} from "@/lib/unifier/reports";

describe("lib/unifier/reports", () => {
  it("getRawProjectStatusReports returns all rows when no projectId", async () => {
    const result = await getRawProjectStatusReports();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXPSR", expect.any(Array));
  });

  it("getRawProjectStatusReports filters by projectId", async () => {
    const result = await getRawProjectStatusReports("proj-1");
    expect(result).toEqual([rowA]);
  });

  it("getRawDailyActivityReports returns all rows when no projectId", async () => {
    const result = await getRawDailyActivityReports();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXUEDR", expect.any(Array));
  });

  it("getRawDailyActivityReports filters by projectId", async () => {
    const result = await getRawDailyActivityReports("proj-2");
    expect(result).toEqual([rowB]);
  });
});

// ── schedule ────────────────────────────────────────────────────────────────

import { getRawP6Activities } from "@/lib/unifier/schedule";

describe("lib/unifier/schedule", () => {
  it("returns all rows when no projectId provided", async () => {
    const result = await getRawP6Activities();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_P6_ACTIVITY", expect.any(Array));
  });

  it("filters rows by projectId", async () => {
    const result = await getRawP6Activities("proj-1");
    expect(result).toEqual([rowA]);
  });
});

// ── subcontractors ──────────────────────────────────────────────────────────

import {
  getRawSubcontractors,
  getRawPurchaseOrders,
  getRawPayApplications,
} from "@/lib/unifier/subcontractors";

describe("lib/unifier/subcontractors", () => {
  it("getRawSubcontractors returns all rows", async () => {
    const result = await getRawSubcontractors();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXSUB", expect.any(Array));
  });

  it("getRawPurchaseOrders returns all rows when no projectId", async () => {
    const result = await getRawPurchaseOrders();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXPOS", expect.any(Array));
  });

  it("getRawPurchaseOrders filters by projectId", async () => {
    const result = await getRawPurchaseOrders("proj-2");
    expect(result).toEqual([rowB]);
  });

  it("getRawPayApplications returns all rows when no projectId", async () => {
    const result = await getRawPayApplications();
    expect(result).toEqual(allRows);
    expect(mockFetchAllRows).toHaveBeenCalledWith("UNIFIER_UXSUM", expect.any(Array));
  });

  it("getRawPayApplications filters by projectId", async () => {
    const result = await getRawPayApplications("proj-1");
    expect(result).toEqual([rowA]);
  });
});
