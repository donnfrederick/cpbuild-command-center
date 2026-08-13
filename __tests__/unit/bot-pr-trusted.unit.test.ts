import { describe, expect, it } from "vitest";
import {
  isMetricsAutoPr,
  isSessionChecklistOnlyPr,
  isTrustedBotPrForAutoMerge,
  touchesSecuritySensitivePath,
} from "@/lib/bot-pr-trusted";

describe("isTrustedBotPrForAutoMerge()", () => {
  it("allows Dependabot lockfile bumps", () => {
    expect(
      isTrustedBotPrForAutoMerge({
        authorLogin: "dependabot[bot]",
        labels: ["dependencies"],
        changedFiles: ["package-lock.json"],
      })
    ).toBe(true);
  });

  it("allows metrics-auto github-actions PRs", () => {
    expect(
      isTrustedBotPrForAutoMerge({
        authorLogin: "github-actions[bot]",
        labels: ["metrics-auto", "chore"],
        changedFiles: [
          "docs/COPILOT_ROUNDS_METRICS.jsonl",
          "docs/agent-context/copilot-rounds-dashboard.md",
        ],
      })
    ).toBe(true);
  });

  it("allows session-checklist-only github-actions PRs", () => {
    expect(
      isTrustedBotPrForAutoMerge({
        authorLogin: "app/github-actions",
        labels: [],
        changedFiles: ["docs/agent-context/session-checklist.md"],
      })
    ).toBe(true);
  });

  it("rejects github-actions PRs that touch app code", () => {
    expect(
      isTrustedBotPrForAutoMerge({
        authorLogin: "github-actions[bot]",
        labels: [],
        changedFiles: ["components/users/UsersView.tsx"],
      })
    ).toBe(false);
  });

  it("rejects Dependabot PRs touching auth", () => {
    expect(
      isTrustedBotPrForAutoMerge({
        authorLogin: "dependabot[bot]",
        labels: ["dependencies"],
        changedFiles: ["lib/auth.ts"],
      })
    ).toBe(false);
  });
});

describe("touchesSecuritySensitivePath()", () => {
  it("flags prisma schema changes", () => {
    expect(touchesSecuritySensitivePath(["prisma/schema.prisma"])).toBe(true);
  });
});

describe("isSessionChecklistOnlyPr()", () => {
  it("requires exactly the session-checklist file", () => {
    expect(
      isSessionChecklistOnlyPr(["docs/agent-context/session-checklist.md"])
    ).toBe(true);
    expect(
      isSessionChecklistOnlyPr([
        "docs/agent-context/session-checklist.md",
        "docs/foo.md",
      ])
    ).toBe(false);
  });
});

describe("isMetricsAutoPr()", () => {
  it("matches metrics-auto label", () => {
    expect(isMetricsAutoPr(["chore", "metrics-auto"])).toBe(true);
  });
});
