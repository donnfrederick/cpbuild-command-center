import { describe, it, expect } from "vitest";
import {
  effectiveBoolean,
  nextPinnedBoolean,
} from "@/lib/projects/preserve-mobile-unit-chrome";

describe("preserve-mobile-unit-chrome", () => {
  describe("nextPinnedBoolean", () => {
    it("returns null when preserveChrome is false", () => {
      expect(
        nextPinnedBoolean({ live: true, pinned: true, preserveChrome: false }),
      ).toBeNull();
      expect(
        nextPinnedBoolean({ live: false, pinned: null, preserveChrome: false }),
      ).toBeNull();
    });

    it("snapshots live on first preserveChrome transition", () => {
      expect(
        nextPinnedBoolean({ live: true, pinned: null, preserveChrome: true }),
      ).toBe(true);
    });

    it("keeps pinned value when live flips while preserveChrome stays true", () => {
      expect(
        nextPinnedBoolean({ live: false, pinned: true, preserveChrome: true }),
      ).toBe(true);
    });
  });

  describe("effectiveBoolean", () => {
    it("uses live when pin is null", () => {
      expect(effectiveBoolean({ live: false, pinned: null })).toBe(false);
      expect(effectiveBoolean({ live: true, pinned: null })).toBe(true);
    });

    it("uses pinned when set", () => {
      expect(effectiveBoolean({ live: false, pinned: true })).toBe(true);
      expect(effectiveBoolean({ live: true, pinned: false })).toBe(false);
    });
  });
});
