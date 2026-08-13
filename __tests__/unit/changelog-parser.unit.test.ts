import { describe, it, expect } from "vitest";
import { parseChangelog, inferRoute } from "@/lib/changelog-parser";

// ── inferRoute ────────────────────────────────────────────────────────────────

describe("inferRoute()", () => {
  it("returns /projects for project-hub branches", () => {
    expect(inferRoute("feat/project-hub-navigation", "")).toBe("/projects");
  });

  it("returns /projects for unit-related descriptions", () => {
    expect(inferRoute(null, "Unit cards with scope pills")).toBe("/projects");
  });

  it("returns /projects for project descriptions", () => {
    expect(inferRoute(null, "ProjectsTable mobile card view")).toBe("/projects");
  });

  it("returns /users for team/invite descriptions", () => {
    expect(inferRoute(null, "Admin can invite teammates")).toBe("/users");
  });

  it("returns /feedback for feedback descriptions", () => {
    expect(inferRoute(null, "Feedback report admin view")).toBe("/feedback");
  });

  it("returns /login for auth-related descriptions", () => {
    expect(inferRoute(null, "Password reset token generation")).toBe("/login");
  });

  it("returns / for dashboard description", () => {
    expect(inferRoute(null, "Dashboard overview improvements")).toBe("/");
  });

  it("returns empty string when no match", () => {
    expect(inferRoute(null, "Miscellaneous chore work")).toBe("");
  });
});

// ── parseChangelog ────────────────────────────────────────────────────────────

const SAMPLE_CHANGELOG = `
# Changelog

## [Merged] feat/open-project-flow — 2026-02-20 · PR #55

- New project creation form with Unifier linking
- ProjectsTable search and filter

---

## [Merged] chore/copilot-instructions — 2026-02-18 · PR #50

- Project scope Cursor rule added
- DevTools static imports fix

---

## [In Progress] feat/units-page — 2026-03-01

**Branch:** \`feat/units-page\` — targeting \`dev\`.

### Changes
- Unit cards with scope pills
- Unit Detail Modal with stage/status toggles

---

## [Something Else] ignored-entry — 2026-01-01

- This should not be parsed
`;

describe("parseChangelog() — merged entries only (default)", () => {
  const releases = parseChangelog(SAMPLE_CHANGELOG);

  it("parses the correct number of merged entries", () => {
    expect(releases).toHaveLength(2);
  });

  it("extracts title including PR number", () => {
    expect(releases[0].title).toContain("PR #55");
  });

  it("extracts prNumber as integer", () => {
    expect(releases[0].prNumber).toBe(55);
    expect(releases[1].prNumber).toBe(50);
  });

  it("extracts branch name", () => {
    expect(releases[0].branch).toBe("feat/open-project-flow");
  });

  it("parses mergedAt as a valid Date", () => {
    expect(releases[0].mergedAt).toBeInstanceOf(Date);
    expect(releases[0].mergedAt.getFullYear()).toBe(2026);
  });

  it("sets environment to 'all' for merged entries", () => {
    releases.forEach((r) => expect(r.environment).toBe("all"));
  });

  it("extracts change bullets as individual items", () => {
    expect(releases[0].changes).toHaveLength(2);
    expect(releases[0].changes[0].description).toContain("project creation form");
  });

  it("assigns a route to each change item", () => {
    expect(releases[0].changes[0].route).toBe("/projects");
  });

  it("gives each change a unique non-empty id", () => {
    const ids = releases.flatMap((r) => r.changes.map((c) => c.id));
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("does not include [In Progress] entries by default", () => {
    const branches = releases.map((r) => r.branch);
    expect(branches).not.toContain("feat/units-page");
  });

  it("does not include unrecognized status entries", () => {
    const branches = releases.map((r) => r.branch);
    expect(branches).not.toContain("ignored-entry");
  });
});

describe("parseChangelog() — with includeInProgress: true", () => {
  const releases = parseChangelog(SAMPLE_CHANGELOG, { includeInProgress: true });

  it("includes in-progress entries when flag is set", () => {
    const inProg = releases.find((r) => r.branch === "feat/units-page");
    expect(inProg).toBeDefined();
  });

  it("sets environment to 'development' for in-progress entries", () => {
    const inProg = releases.find((r) => r.branch === "feat/units-page")!;
    expect(inProg.environment).toBe("development");
  });

  it("sets prNumber to null for in-progress entries (no PR yet)", () => {
    const inProg = releases.find((r) => r.branch === "feat/units-page")!;
    expect(inProg.prNumber).toBeNull();
  });

  it("parses bullets for in-progress entries", () => {
    const inProg = releases.find((r) => r.branch === "feat/units-page")!;
    expect(inProg.changes.length).toBeGreaterThan(0);
  });
});

describe("parseChangelog() — edge cases", () => {
  it("returns empty array for empty string", () => {
    expect(parseChangelog("")).toHaveLength(0);
  });

  it("returns empty array when no [Merged] sections exist", () => {
    expect(parseChangelog("# Changelog\n\nNo releases yet.\n")).toHaveLength(0);
  });

  it("handles entries with no bullets gracefully", () => {
    const content = `
## [Merged] feat/empty — 2026-01-01 · PR #1

---
`;
    const releases = parseChangelog(content);
    expect(releases).toHaveLength(1);
    expect(releases[0].changes).toHaveLength(0);
  });

  it("skips structural lines (### headings, **Branch:** lines, --- separators)", () => {
    const content = `
## [Merged] feat/example — 2026-01-15 · PR #99

**Branch:** \`feat/example\`

### Changes
- Actual change bullet
- Another real change

---
`;
    const releases = parseChangelog(content);
    expect(releases[0].changes).toHaveLength(2);
    expect(releases[0].changes[0].description).toBe("Actual change bullet");
  });
});
