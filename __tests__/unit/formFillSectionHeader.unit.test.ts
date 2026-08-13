import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("form fill section header tokens", () => {
  const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  it("defines navy section header tokens wired to the design system", () => {
    expect(css).toContain("--form-fill-section-header-bg:      var(--color-surface-dark);");
    expect(css).toContain("--form-fill-section-header-fg:      var(--color-text-inverse);");
  });

  it("defines shared section header classes for fill mode", () => {
    expect(css).toContain(".form-fill-section-header {");
    expect(css).toContain(".form-fill-section-header__title {");
    expect(css).toContain("--form-fill-section-header-counter-bg:");
    expect(css).toContain(".form-fill-section-header__counter {");
  });
});
