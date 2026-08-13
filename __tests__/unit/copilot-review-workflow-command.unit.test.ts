import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression guard for docs/COPILOT_LEARNINGS.md 2026-04-17 entry.
//
// GitHub silently changed the behavior of the REST endpoint
//   POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers
// with `reviewers[]=copilot`: it returns 200 OK but does NOT add Copilot or
// trigger a review. The working path is `gh pr edit --add-reviewer @copilot`,
// which goes through the GraphQL `requestReviews` mutation.
//
// If anyone edits copilot-review.yml to use the old REST call again, this
// test fails so we catch it before it ships.
describe("copilot-review.yml — must use the working gh CLI command, not the dead REST endpoint", () => {
  const workflow = readFileSync(
    join(process.cwd(), ".github/workflows/copilot-review.yml"),
    "utf8",
  );

  // The workflow file contains extensive comments explaining the API drift
  // (PR #677), including the string `gh pr edit --add-reviewer @copilot`
  // inside comment blocks. All assertions below must operate on the
  // comment-stripped version so the tests fail if the `run:` command is
  // actually removed, not just if it's mentioned in prose.
  const withoutComments = workflow
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  it("uses `gh pr edit --add-reviewer @copilot` to request Copilot review (in an active run: block, not just a comment)", () => {
    expect(withoutComments).toMatch(
      /gh pr edit\b[\s\S]*?--add-reviewer[\s\S]*?@copilot/,
    );
  });

  it("does NOT call the dead REST endpoint `POST /requested_reviewers -f reviewers[]=copilot`", () => {
    // The bad pattern: any `gh api` invocation that POSTs to
    // `requested_reviewers` with `reviewers[]=copilot`. That combination is
    // the silent no-op. Uses the shared `withoutComments` constant so prose
    // mentions of the old endpoint in the workflow header don't satisfy the
    // guard.
    const hasDeadRestCall =
      /gh api[\s\S]*requested_reviewers[\s\S]*reviewers\[\]=copilot/.test(
        withoutComments,
      );
    expect(hasDeadRestCall).toBe(false);
  });

  it("surfaces a warning/error in Actions logs when the request silently fails or the PAT is missing", () => {
    // The workflow must fail loud — either when the PAT is missing or when
    // Copilot was not actually added to requested_reviewers (silent no-op).
    expect(withoutComments).toMatch(
      /::error::COPILOT_REVIEWER_PAT secret is not set/,
    );
    expect(withoutComments).toMatch(
      /::warning::Copilot was NOT added to requested_reviewers/,
    );
  });

  it("uses a user-scoped PAT, not GITHUB_TOKEN, to request Copilot", () => {
    // GITHUB_TOKEN silently no-ops for Copilot reviewer requests. See
    // docs/COPILOT_LEARNINGS.md 2026-04-17 entry. The workflow step that
    // requests Copilot MUST authenticate with COPILOT_REVIEWER_PAT.
    expect(withoutComments).toMatch(
      /GH_TOKEN:\s*\$\{\{\s*secrets\.COPILOT_REVIEWER_PAT\s*\}\}/,
    );
  });

  it("verifies the side effect by reading requested_reviewers back (does not trust gh exit code)", () => {
    // The workflow must query requested_reviewers after the request to
    // confirm Copilot was actually added — never trust `gh` exit code alone.
    expect(withoutComments).toMatch(/requested_reviewers/);
    expect(withoutComments).toMatch(/REQUESTED=\$\(gh api/);
  });
});
