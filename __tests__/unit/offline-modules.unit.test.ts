import { describe, it, expect } from "vitest";
import {
  OFFLINE_MODULES,
  OFFLINE_MODULE_MAP,
  ALWAYS_CACHED_MODULES,
} from "@/lib/offline/modules";

describe("OFFLINE_MODULES registry", () => {
  it("contains at least one available module", () => {
    const available = OFFLINE_MODULES.filter((m) => m.available);
    expect(available.length).toBeGreaterThan(0);
  });

  it("every module has required fields", () => {
    for (const mod of OFFLINE_MODULES) {
      expect(mod.id).toBeTruthy();
      expect(mod.label).toBeTruthy();
      expect(mod.description).toBeTruthy();
      expect(mod.estimatedSize).toBeTruthy();
      expect(typeof mod.available).toBe("boolean");
      expect(["core", "projects", "reporting"]).toContain(mod.category);
    }
  });

  it("module IDs are unique", () => {
    const ids = OFFLINE_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("OFFLINE_MODULE_MAP", () => {
  it("maps every module by its id", () => {
    for (const mod of OFFLINE_MODULES) {
      expect(OFFLINE_MODULE_MAP[mod.id]).toBe(mod);
    }
  });
});

describe("ALWAYS_CACHED_MODULES", () => {
  it("includes 'my-profile'", () => {
    expect(ALWAYS_CACHED_MODULES).toContain("my-profile");
  });

  it("all always-cached modules exist in the registry", () => {
    for (const id of ALWAYS_CACHED_MODULES) {
      expect(OFFLINE_MODULE_MAP[id]).toBeDefined();
    }
  });

  it("all always-cached modules are marked available", () => {
    for (const id of ALWAYS_CACHED_MODULES) {
      expect(OFFLINE_MODULE_MAP[id].available).toBe(true);
    }
  });
});
