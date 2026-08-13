import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

const DIALOG_CONTENT_BASE =
  "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 outline-none sm:max-w-lg";

const LEVEL_BREAKDOWN_MODAL_CLASS =
  "portfolio-progress-level-breakdown-modal top-[4dvh] left-1/2 translate-none sm:max-w-none";

describe("PortfolioProgressLevelBreakdownModal positioning", () => {
  it("merged DialogContent classes reset shadcn translate centering for prod-safe layout", () => {
    const merged = cn(DIALOG_CONTENT_BASE, LEVEL_BREAKDOWN_MODAL_CLASS);

    expect(merged).toContain("translate-none");
    expect(merged).not.toMatch(/translate-x/);
    expect(merged).not.toMatch(/translate-y/);
    expect(merged).toContain("top-[4dvh]");
    expect(merged).not.toContain("top-[50%]");
    expect(merged).toContain("left-1/2");
  });
});
