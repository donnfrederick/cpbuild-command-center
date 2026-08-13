import { describe, expect, it } from "vitest";
import { formatOfflineCacheDate } from "@/hooks/offline-cache-view-context";

describe("formatOfflineCacheDate", () => {
  it("returns em dash when date is missing", () => {
    expect(formatOfflineCacheDate(null)).toBe("—");
    expect(formatOfflineCacheDate(undefined)).toBe("—");
  });

  it("formats ISO timestamps as non-empty display text", () => {
    const formatted = formatOfflineCacheDate("2026-06-18T14:52:00.000Z");
    expect(formatted).not.toBe("—");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("uses document.documentElement.lang for locale-aware formatting", () => {
    const iso = "2026-01-18T14:52:00.000Z";
    const previousLang = document.documentElement.lang;
    document.documentElement.lang = "en";
    const enFormatted = formatOfflineCacheDate(iso);
    document.documentElement.lang = "es";
    const esFormatted = formatOfflineCacheDate(iso);
    document.documentElement.lang = previousLang;
    expect(enFormatted).toMatch(/Jan/i);
    expect(esFormatted).toMatch(/ene/i);
    expect(enFormatted).not.toBe(esFormatted);
  });
});
