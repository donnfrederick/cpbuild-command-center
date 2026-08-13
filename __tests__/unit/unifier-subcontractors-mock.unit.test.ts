import fs from "node:fs";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getSubcontractorsForPicker() mock mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 3 active mock subcontractors without calling Unifier when UNIFIER_MOCK=true", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");
    const fetchSpy = vi.spyOn(global, "fetch");

    const { getSubcontractorsForPicker } = await import("@/lib/unifier/subcontractors");
    const subs = await getSubcontractorsForPicker();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(subs).toHaveLength(3);
    expect(subs).toEqual(
      expect.arrayContaining([
        { id: "MOCK-SUB-001", name: "Apex Flooring LLC" },
        { id: "MOCK-SUB-002", name: "Summit Electrical Services" },
        { id: "MOCK-SUB-003", name: "Premier Cabinets & Millwork" },
      ])
    );
    expect(subs.map((s) => s.name)).toEqual([...subs.map((s) => s.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("excludes inactive mock subcontractors", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");

    const { getRawSubcontractors, getSubcontractorsForPicker } = await import(
      "@/lib/unifier/subcontractors"
    );

    const raw = await getRawSubcontractors();
    expect(raw.some((r) => r["STATUS"] === "Inactive")).toBe(true);

    const subs = await getSubcontractorsForPicker();
    expect(subs.every((s) => s.name !== "Legacy Drywall Co")).toBe(true);
  });

  it("merges .local/mock-subcontractors.json rows over bundled mock IDs", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify([
        {
          ID: "MOCK-SUB-001",
          STATUS: "Active",
          CP_SUB_SUBCONTRACTNAME_TB50: "Overridden Apex Flooring",
        },
        {
          ID: "MOCK-SUB-LOCAL",
          STATUS: "Active",
          CP_SUB_SUBCONTRACTNAME_TB50: "Local Dev Subcontractor",
        },
      ]),
    );

    const { getRawSubcontractors, getSubcontractorsForPicker } = await import(
      "@/lib/unifier/subcontractors"
    );

    const raw = await getRawSubcontractors();
    expect(raw.find((r) => r["ID"] === "MOCK-SUB-001")?.["CP_SUB_SUBCONTRACTNAME_TB50"]).toBe(
      "Overridden Apex Flooring",
    );
    expect(raw.some((r) => r["ID"] === "MOCK-SUB-LOCAL")).toBe(true);

    const subs = await getSubcontractorsForPicker();
    expect(subs.find((s) => s.id === "MOCK-SUB-001")?.name).toBe(
      "Overridden Apex Flooring",
    );
    expect(subs.find((s) => s.id === "MOCK-SUB-LOCAL")?.name).toBe(
      "Local Dev Subcontractor",
    );
  });

  it("ignores local mock file when NODE_ENV is production", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "development");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const readSpy = vi.spyOn(fs, "readFileSync");

    const { getSubcontractorsForPicker } = await import("@/lib/unifier/subcontractors");
    const subs = await getSubcontractorsForPicker();

    expect(readSpy).not.toHaveBeenCalled();
    expect(subs).toHaveLength(3);
    expect(subs.find((s) => s.id === "MOCK-SUB-LOCAL")).toBeUndefined();
  });
});

describe("getRawPurchaseOrders() mock mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns empty array when UNIFIER_MOCK=true", async () => {
    vi.stubEnv("UNIFIER_MOCK", "true");
    const fetchSpy = vi.spyOn(global, "fetch");

    const { getRawPurchaseOrders, getRawPayApplications } = await import(
      "@/lib/unifier/subcontractors"
    );

    expect(await getRawPurchaseOrders()).toEqual([]);
    expect(await getRawPayApplications()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
