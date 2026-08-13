import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("entity form section header tokens", () => {
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

  it("defines navy entity-form section headers reusing form-fill tokens", () => {
    expect(css).toContain(".entity-form-section__header");
    expect(css).toContain("var(--form-fill-section-header-bg)");
    expect(css).toContain("var(--form-fill-section-header-fg)");
  });

  it("defines filled choice and type pill classes", () => {
    expect(css).toContain(".entity-form-choice-pill.is-selected");
    expect(css).toContain(".entity-form-type-pill.is-selected");
    expect(css).toContain("var(--control-active-bg)");
  });
});
