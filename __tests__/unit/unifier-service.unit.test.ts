import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapUnifierStatus } from "@/lib/unifier/service";
import { MOCK_UNIFIER_PROJECTS } from "@/lib/unifier/mock-data";

/**
 * Unit tests for the Unifier service layer.
 * Tests status mapping, mock mode, and cache behaviour.
 * Network calls are mocked via the client module.
 */

describe("mapUnifierStatus()", () => {
  it.each([
    ["Active", "Active"],
    ["active", "Active"],
    ["ACTIVE", "Active"],
    ["On Hold", "OnHold"],
    ["on hold", "OnHold"],
    ["Inactive", "Completed"],
    ["inactive", "Completed"],
    ["Complete", "Completed"],
    ["Completed", "Completed"],
    ["completed", "Completed"],
  ])("maps %s → %s", (input, expected) => {
    expect(mapUnifierStatus(input)).toBe(expected);
  });

  it('defaults unknown values to "Planning"', () => {
    expect(mapUnifierStatus("Bidding")).toBe("Planning");
    expect(mapUnifierStatus("Pending")).toBe("Planning");
    expect(mapUnifierStatus("")).toBe("Planning");
  });

  it('defaults null to "Planning"', () => {
    expect(mapUnifierStatus(null)).toBe("Planning");
  });

  it('defaults undefined to "Planning"', () => {
    expect(mapUnifierStatus(undefined)).toBe("Planning");
  });
});

describe("unifierDateStringToIso()", () => {
  it("returns null for empty input", async () => {
    const { unifierDateStringToIso } = await import("@/lib/unifier/service");
    expect(unifierDateStringToIso(null)).toBeNull();
    expect(unifierDateStringToIso(undefined)).toBeNull();
    expect(unifierDateStringToIso("")).toBeNull();
    expect(unifierDateStringToIso("   ")).toBeNull();
  });

  it("parses ISO-like strings to YYYY-MM-DD", async () => {
    const { unifierDateStringToIso } = await import("@/lib/unifier/service");
    expect(unifierDateStringToIso("2026-06-15T00:00:00.000Z")).toBe("2026-06-15");
    expect(unifierDateStringToIso("2024-01-10")).toBe("2024-01-10");
  });
});

describe("getProjects() cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.stubEnv("UNIFIER_MOCK", "false"); // Use real API path (fetch mocked)
    vi.stubEnv("UNIFIER_BASE_URL", "https://example.com");
    vi.stubEnv("UNIFIER_USERNAME", "u");
    vi.stubEnv("UNIFIER_PASSWORD", "p");
  });

  it("calls the API once and returns cached result on second call", async () => {
    const mockRow = {
      PID: "42",
      UE_PRJ_PROJNUMSSN: "CP-001",
      UE_PRJ_PROJNAMESSN: "Test Project",
      UUU_SHELL_STATUS: "Active",
      UUU_LOCATION: "1000",
      CP_GEN_ADDRESS_TB2000: "123 Rio Grande St, Austin, TX",
      CP_GEN_STATE_PD: "TX",
      CP_CL_CLIENTNAME_TB50: null,
      CP_OP_PROJECTTYPE_PD: null,
      CP_PROJECT_PHASEPD: null,
      CP_OP_STAGE_PD: null,
      CP_OP_ESTIMATINGSTAGE_PD: null,
      CP_GEN_PROJMANAGER_NAME: "Jane Smith",
      CP_GEN_ESTIMATOR_NAME: null,
      CP_OP_FDD_DOP: null,
      CP_AP_SAGEPROJECTID_TB: null,
      CP_AP_RFMSPROJECTID_TB: null,
      CP_OP_PROJECTTRACK_PD: null,
    };

    const pagination = [{ nextTableName: "-1", nextKey: "" }];
    vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String((init as RequestInit).body ?? "{}")) as {
        tables?: { tableName: string }[];
      };
      const table = body.tables?.[0]?.tableName ?? "";
      if (table === "UNIFIER_US_XPRJ") {
        return {
          ok: true,
          json: async () => ({
            data: {
              UNIFIER_US_XPRJ: [mockRow],
              pagination,
            },
            message: [],
            status: 200,
          }),
        } as Response;
      }
      if (table === "UNIFIER_SYS_PROJECT_INFO") {
        return {
          ok: true,
          json: async () => ({
            data: {
              UNIFIER_SYS_PROJECT_INFO: [{ PID: "42", STARTDATE: null }],
              pagination,
            },
            message: [],
            status: 200,
          }),
        } as Response;
      }
      throw new Error(`unexpected PDS table in test: ${table}`);
    });

    const { getProjects } = await import("@/lib/unifier/service");

    const first = await getProjects();
    const second = await getProjects();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(first).toHaveLength(1);
    expect(first[0].pid).toBe("42");
    expect(first[0].projectName).toBe("Test Project");
    expect(first[0].location).toBe("123 Rio Grande St, Austin, TX");
    expect(first[0].address).toBe("123 Rio Grande St, Austin, TX");
    expect(second).toBe(first);
  });

  it("returns mock data when UNIFIER_MOCK=true without calling fetch", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");
    const fetchSpy = vi.spyOn(global, "fetch");

    const { getProjects } = await import("@/lib/unifier/service");
    const projects = await getProjects();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(projects).toEqual(MOCK_UNIFIER_PROJECTS);
  });
});
