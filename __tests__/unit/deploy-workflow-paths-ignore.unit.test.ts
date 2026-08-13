import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard against accidentally removing the `paths-ignore` entries in
 * `.github/workflows/deploy.yml` that prevent docs-only commits from
 * `.github/workflows/track-copilot-rounds.yml` from triggering a full
 * deploy cycle.
 *
 * Background (see COPILOT_LEARNINGS.md — 2026-04-20 | PR #672 |
 * github-actions/paths-ignore): the metrics workflow auto-commits to
 * `dev` after every merge to append a metric record + regenerate the
 * dashboard. Without these `paths-ignore` entries, every merge would
 * fire a full deploy twice (once for the merge commit, once for the
 * metrics commit), doubling CI + Railway load and undoing the deploy
 * cuts shipped in PR #664.
 *
 * If someone edits `deploy.yml` and drops these paths, this test fails
 * locally and in CI before the regression can reach `dev`.
 *
 * This test parses the YAML structurally (not with a regex that can be
 * fooled by comments or a stray `paths-ignore` elsewhere in the file) —
 * the guard specifically verifies the list lives under `on.push` and
 * handles quoted or unquoted YAML list items. See PR #677 Copilot
 * review for the brittleness motivation.
 */

/**
 * Extract the YAML list items under `on.push.paths-ignore` from a
 * workflow file. Returns the list items with surrounding quotes and
 * inline comments stripped. Returns an empty array if the block is not
 * present under `on.push` (which is the failure mode we want the tests
 * to catch).
 *
 * We parse indentation manually rather than pulling in a YAML library
 * to keep the test dependency-free and because the YAML structure of
 * the deploy workflow is simple and stable.
 */
function getOnPushPathsIgnore(yml: string): string[] {
  const lines = yml.split(/\r?\n/);

  // Find the `on:` top-level key (column 0).
  const onIndex = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (onIndex === -1) return [];

  // Find `push:` nested directly under `on:` — it must be indented more
  // than `on:` (which is at column 0) and less than any `paths-ignore:`
  // that might live under a different trigger (e.g. `pull_request:`).
  let pushIndex = -1;
  let pushIndent = -1;
  for (let i = onIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    // Stop at the next top-level key (indent 0, non-empty, non-comment).
    if (/^\S/.test(line) && !/^\s*#/.test(line)) break;
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    const match = line.match(/^(\s*)push:\s*$/);
    if (match) {
      pushIndex = i;
      pushIndent = match[1].length;
      break;
    }
  }
  if (pushIndex === -1) return [];

  // Find `paths-ignore:` inside the `push:` block — indented strictly
  // more than `push:`.
  let pathsIgnoreIndex = -1;
  let pathsIgnoreIndent = -1;
  for (let i = pushIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    // Leaving the `push:` block.
    if (currentIndent <= pushIndent) break;
    const match = line.match(/^(\s*)paths-ignore:\s*$/);
    if (match) {
      pathsIgnoreIndex = i;
      pathsIgnoreIndent = match[1].length;
      break;
    }
  }
  if (pathsIgnoreIndex === -1) return [];

  // Collect list items strictly indented more than `paths-ignore:`.
  const entries: string[] = [];
  for (let i = pathsIgnoreIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*$/.test(line)) continue;
    if (/^\s*#/.test(line)) continue;
    const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (currentIndent <= pathsIgnoreIndent) break;
    const itemMatch = line.match(/^\s*-\s*(.*?)\s*$/);
    if (!itemMatch) continue;
    const normalized = itemMatch[1]
      .replace(/\s+#.*$/, "") // strip trailing inline comment
      .replace(/^['"](.*)['"]$/, "$1") // strip surrounding quotes
      .trim();
    if (normalized.length > 0) entries.push(normalized);
  }
  return entries;
}

describe("deploy.yml paths-ignore — metrics-bot commits must not trigger a deploy", () => {
  const deployYml = readFileSync(
    join(process.cwd(), ".github/workflows/deploy.yml"),
    "utf8",
  );

  const REQUIRED_IGNORED_PATHS = [
    "docs/COPILOT_ROUNDS_METRICS.jsonl",
    "docs/agent-context/copilot-rounds-dashboard.md",
  ] as const;

  const entries = getOnPushPathsIgnore(deployYml);

  it("has a paths-ignore block under on.push", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  for (const p of REQUIRED_IGNORED_PATHS) {
    it(`includes ${p} in on.push.paths-ignore`, () => {
      expect(entries).toContain(p);
    });
  }
});
