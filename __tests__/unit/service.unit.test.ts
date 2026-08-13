import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/unifier/client", () => ({
  fetchAllRows: vi.fn(),
}));

const { fetchAllRows } = await import("@/lib/unifier/client");

import { mapUnifierStatus } from "@/lib/unifier/service";

describe("mapUnifierStatus", () => {
  it('returns "Active" for "active"', () => {
    expect(mapUnifierStatus("active")).toBe("Active");
  });

  it('returns "Active" for "Active"', () => {
    expect(mapUnifierStatus("Active")).toBe("Active");
  });

  it('returns "OnHold" for "on hold"', () => {
    expect(mapUnifierStatus("on hold")).toBe("OnHold");
  });

  it('returns "Completed" for "inactive"', () => {
    expect(mapUnifierStatus("inactive")).toBe("Completed");
  });

  it('returns "Completed" for "complete"', () => {
    expect(mapUnifierStatus("complete")).toBe("Completed");
  });

  it('returns "Completed" for "completed"', () => {
    expect(mapUnifierStatus("completed")).toBe("Completed");
  });

  it('returns "Planning" for unknown values', () => {
    expect(mapUnifierStatus("unknown")).toBe("Planning");
    expect(mapUnifierStatus("")).toBe("Planning");
  });

  it('returns "Planning" for null/undefined', () => {
    expect(mapUnifierStatus(null)).toBe("Planning");
    expect(mapUnifierStatus(undefined)).toBe("Planning");
  });

  it("trims whitespace before matching", () => {
    expect(mapUnifierStatus("  active  ")).toBe("Active");
    expect(mapUnifierStatus("  on hold  ")).toBe("OnHold");
  });
});

/** `getProjects()` loads shells + `UNIFIER_SYS_PROJECT_INFO` in parallel via `fetchAllRows`. */
function mockFetchAllRowsForGetProjects(
  shellRows: Record<string, unknown>[],
  sysRows: { PID: string; STARTDATE: string | null }[] = []
): void {
  vi.mocked(fetchAllRows).mockImplementation(async (tableName: string) => {
    if (tableName === "UNIFIER_US_XPRJ") return shellRows as never;
    if (tableName === "UNIFIER_SYS_PROJECT_INFO") return sysRows as never;
    return [] as never;
  });
}

describe("getProjects", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns mock data when UNIFIER_MOCK=true and not production", async () => {
    process.env.UNIFIER_MOCK = "true";
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const { getProjects: getProjectsFn } = await import("@/lib/unifier/service");
    const projects = await getProjectsFn();

    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toHaveProperty("pid");
    expect(projects[0]).toHaveProperty("projectName");
    expect(fetchAllRows).not.toHaveBeenCalled();
  });

  it("fetches from API when UNIFIER_MOCK is false", async () => {
    process.env.UNIFIER_MOCK = "false";
    process.env.NODE_ENV = "development";

    const mockRows = [
      {
        PID: "UNI-1",
        UE_PRJ_PROJNUMSSN: "001",
        UE_PRJ_PROJNAMESSN: "Test Project",
        UUU_SHELL_STATUS: "Active",
        UUU_LOCATION: null,
        CP_GEN_ADDRESS_TB2000: null,
        CP_GEN_STATE_PD: null,
        CP_CL_CLIENTNAME_TB50: null,
        CP_OP_PROJECTTYPE_PD: null,
        CP_PROJECT_PHASEPD: "Construction",
        CP_OP_STAGE_PD: null,
        CP_OP_ESTIMATINGSTAGE_PD: null,
        CP_GEN_PROJMANAGER_NAME: null,
        CP_GEN_ESTIMATOR_NAME: null,
        CP_OP_FDD_DOP: null,
        CP_AP_SAGEPROJECTID_TB: null,
        CP_AP_RFMSPROJECTID_TB: null,
        CP_OP_PROJECTTRACK_PD: null,
      },
    ];

    mockFetchAllRowsForGetProjects(mockRows, [{ PID: "UNI-1", STARTDATE: null }]);

    vi.resetModules();
    const { getProjects: getProjectsFn } = await import("@/lib/unifier/service");
    const projects = await getProjectsFn();

    expect(projects).toHaveLength(1);
    expect(projects[0].pid).toBe("UNI-1");
    expect(projects[0].projectNumber).toBe("001");
    expect(projects[0].projectName).toBe("Test Project");
    expect(projects[0].status).toBe("Construction");
    expect(projects[0].shellStatus).toBe("Active");
  });

  it("refetches when cache expires", async () => {
    vi.useFakeTimers();
    process.env.UNIFIER_MOCK = "false";
    process.env.NODE_ENV = "development";

    const mockRows = [
      {
        PID: "UNI-1",
        UE_PRJ_PROJNUMSSN: "001",
        UE_PRJ_PROJNAMESSN: "Expired",
        UUU_SHELL_STATUS: null,
        UUU_LOCATION: null,
        CP_GEN_ADDRESS_TB2000: null,
        CP_GEN_STATE_PD: null,
        CP_CL_CLIENTNAME_TB50: null,
        CP_OP_PROJECTTYPE_PD: null,
        CP_PROJECT_PHASEPD: "Construction",
        CP_OP_STAGE_PD: null,
        CP_OP_ESTIMATINGSTAGE_PD: null,
        CP_GEN_PROJMANAGER_NAME: null,
        CP_GEN_ESTIMATOR_NAME: null,
        CP_OP_FDD_DOP: null,
        CP_AP_SAGEPROJECTID_TB: null,
        CP_AP_RFMSPROJECTID_TB: null,
        CP_OP_PROJECTTRACK_PD: null,
      },
    ];

    mockFetchAllRowsForGetProjects(mockRows, []);

    vi.resetModules();
    const { getProjects: getProjectsFn } = await import("@/lib/unifier/service");

    const first = await getProjectsFn();
    expect(first[0].projectName).toBe("Expired");

    // Advance time past 5-minute TTL
    vi.advanceTimersByTime(6 * 60 * 1000);
    const second = await getProjectsFn();

    expect(second).toHaveLength(1);
    // Cold load: 2 parallel fetches (shells + sys); after TTL: 2 more
    expect(fetchAllRows).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("returns cached data on second call within TTL", async () => {
    process.env.UNIFIER_MOCK = "false";
    process.env.NODE_ENV = "development";

    const mockRows = [
      {
        PID: "UNI-1",
        UE_PRJ_PROJNUMSSN: "001",
        UE_PRJ_PROJNAMESSN: "Cached",
        UUU_SHELL_STATUS: null,
        UUU_LOCATION: null,
        CP_GEN_ADDRESS_TB2000: null,
        CP_GEN_STATE_PD: null,
        CP_CL_CLIENTNAME_TB50: null,
        CP_OP_PROJECTTYPE_PD: null,
        CP_PROJECT_PHASEPD: "Construction",
        CP_OP_STAGE_PD: null,
        CP_OP_ESTIMATINGSTAGE_PD: null,
        CP_GEN_PROJMANAGER_NAME: null,
        CP_GEN_ESTIMATOR_NAME: null,
        CP_OP_FDD_DOP: null,
        CP_AP_SAGEPROJECTID_TB: null,
        CP_AP_RFMSPROJECTID_TB: null,
        CP_OP_PROJECTTRACK_PD: null,
      },
    ];

    mockFetchAllRowsForGetProjects(mockRows, []);

    vi.resetModules();
    const { getProjects: getProjectsFn } = await import("@/lib/unifier/service");

    const first = await getProjectsFn();
    const second = await getProjectsFn();

    expect(first).toEqual(second);
    expect(fetchAllRows).toHaveBeenCalledTimes(2);
  });
});

describe("getProjectByPid", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns project when pid matches", async () => {
    process.env.UNIFIER_MOCK = "true";
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const { getProjectByPid: getByPid, getProjects } = await import("@/lib/unifier/service");
    const projects = await getProjects();
    const pid = projects[0]?.pid ?? "UNI-10045";

    const project = await getByPid(pid);
    expect(project).not.toBeNull();
    expect(project?.pid).toBe(pid);
  });

  it("returns null when pid not found", async () => {
    process.env.UNIFIER_MOCK = "true";
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const { getProjectByPid: getByPid } = await import("@/lib/unifier/service");
    const project = await getByPid("NONEXISTENT-PID");
    expect(project).toBeNull();
  });
});

describe("getProjectTeams", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty array when UNIFIER_MOCK=true", async () => {
    process.env.UNIFIER_MOCK = "true";
    process.env.NODE_ENV = "development";

    vi.resetModules();
    const { getProjectTeams: getTeams } = await import("@/lib/unifier/service");
    const teams = await getTeams();
    expect(teams).toEqual([]);
  });

  it("fetches and caches teams when UNIFIER_MOCK=false", async () => {
    process.env.UNIFIER_MOCK = "false";
    process.env.NODE_ENV = "development";

    const mockRows = [
      {
        ID: "t1",
        PROJECT_ID: "p1",
        RECORD_NO: "1",
        STATUS: null,
        TITLE: null,
        UUU_CREATION_DATE: null,
        UUU_RECORD_LAST_UPDATE_DATE: null,
        CP_GEN_PREESTIMATOR_NAME: null,
        CP_OP_PREESTIMATOR_DP: null,
        CP_GEN_SALES_NAME: null,
        CP_GEN_SALES_UP: null,
        CP_GEN_PROJMANAGER_NAME: null,
        CP_OP_PROJECTMANAGER_DP: null,
        CP_GEN_DRAFTSMAN_NAME: null,
        CP_GEN_DRAFTSMAN_UP: null,
        CP_GEN_PRJCOORDINATOR_NAME: null,
        CP_OP_PROJECTCOORDINATOR_DP: null,
        CP_GEN_ORDERSPECIALIST_NAME: null,
        CP_ORDERSPECIALIST_UP: null,
        CP_GEN_QUALITYCONTROL_NAME: null,
        CP_GEN_QUALITYCONTROL_UP: null,
        CP_GEN_PROJENGINEER_NAME: null,
        CP_GEN_PROJECTENGINEER_UP: null,
        CP_GEN_INSTALLMANAGER_NAME: null,
        CP_GEN_INSTALLATIONMGR_UP: null,
        CP_GEN_ACCOUNTING_NAME: null,
        CP_GEN_ACCOUNTING_UP: null,
        CP_GEN_PROJECTCONTROLS_NAME: null,
        CP_GEN_PROJECTCONTROLS_UP: null,
        CP_GEN_SCHEDULING_NAME: null,
        CP_GEN_SCHEDULING_UP: null,
        CP_GEN_ESTIMATOR_NAME: null,
        CP_OP_ESTIMATOR_DP: null,
        CP_GEN_COSTENGINEER_NAME: null,
        CP_OP_COSTENGINEER_DP: null,
        CP_OP_PROJECTOWNERNAME_SMN: null,
        CP_OP_OPPOWNER_DP: null,
      },
    ];

    vi.mocked(fetchAllRows).mockResolvedValueOnce(mockRows as never);

    vi.resetModules();
    const { getProjectTeams: getTeams } = await import("@/lib/unifier/service");

    const allTeams = await getTeams();
    expect(allTeams).toHaveLength(1);
    expect(allTeams[0].projectId).toBe("p1");

    const filtered = await getTeams("p1");
    expect(filtered).toHaveLength(1);

    const emptyFiltered = await getTeams("other");
    expect(emptyFiltered).toHaveLength(0);
  });
});
