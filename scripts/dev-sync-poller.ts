#!/usr/bin/env tsx
/**
 * Polls origin/dev every 5 minutes while the dev server is running.
 * Run via: npm run dev:with-sync
 *
 * Behaviour:
 *  - On the `dev` branch:       fetches + auto-merges if clean working tree
 *  - On a feature branch:       fetches + notifies "dev has N new commits, rebase when ready"
 *  - Uncommitted changes:       warns, never touches working tree
 */

import { execSync } from "child_process";
import * as path from "path";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ROOT = path.resolve(__dirname, "..");

function run(cmd: string, silent = false): { ok: boolean; stdout: string } {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
    });
    return { ok: true, stdout: typeof out === "string" ? out.trim() : "" };
  } catch (e: unknown) {
    const err = e as { stdout?: unknown };
    const stdout =
      typeof err.stdout === "string"
        ? err.stdout.trim()
        : Buffer.isBuffer(err.stdout)
        ? err.stdout.toString("utf-8").trim()
        : "";
    return { ok: false, stdout };
  }
}

function q(cmd: string): string {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function ts(): string {
  return new Date().toLocaleTimeString();
}

function syncFromDev(): void {
  // Always fetch so we have up-to-date remote refs
  run("git fetch origin dev", true);

  const branch = q("git branch --show-current");
  const devLocal = q("git rev-parse dev 2>/dev/null");
  const devRemote = q("git rev-parse origin/dev 2>/dev/null");

  if (!devLocal || !devRemote) {
    console.log("[dev-sync] Could not read branch state. Skipping.");
    return;
  }

  if (devLocal === devRemote) {
    console.log(`[${ts()}] dev-sync: ✓ origin/dev is up to date`);
    return;
  }

  const behind = q("git rev-list --count dev..origin/dev");
  const newCommits = q(
    "git log --oneline dev..origin/dev"
  )
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .map((l) => `    ${l}`)
    .join("\n");

  // ── On dev branch: try to auto-merge ──────────────────────────────────────
  if (branch === "dev") {
    console.log(
      `\n[${ts()}] dev-sync: ⚠️  dev is behind origin/dev by ${behind} commit(s):\n${newCommits}`
    );

    const dirty = q("git status --porcelain");
    if (dirty) {
      console.log(
        `[dev-sync] Uncommitted changes — cannot auto-merge.\n` +
          `  Stash first:  git stash\n` +
          `  Then merge:   git pull origin dev\n` +
          `  Restore:      git stash pop`
      );
      return;
    }

    const merge = run("git merge origin/dev", true);
    if (merge.ok) {
      console.log("[dev-sync] ✓ Merged origin/dev into dev automatically.");
      return;
    }

    const conflicted = q("git diff --name-only --diff-filter=U")
      .split("\n")
      .filter(Boolean);
    console.log(
      `[dev-sync] ❌ Merge conflict.\n` +
        `  Conflicted files:\n${conflicted.map((f) => `    - ${f}`).join("\n")}\n` +
        `  Resolve, then: git add . && git commit -m "Merge origin/dev"\n` +
        `  Or abort:      git merge --abort`
    );
    return;
  }

  // ── On feature branch: notify only, never touch working tree ──────────────
  console.log(
    `\n[${ts()}] dev-sync: ℹ️  origin/dev has ${behind} new commit(s) your branch hasn't seen:\n${newCommits}\n` +
      `  When you're ready to sync:\n` +
      `    git fetch origin && git rebase origin/dev\n` +
      `  (or switch to dev first:  git checkout dev && git pull origin dev)`
  );
}

function main(): void {
  const branch = q("git branch --show-current");
  console.log(
    `[dev-sync] Started on branch '${branch}'. Checking origin/dev every 5 minutes.\n`
  );
  syncFromDev();
  setInterval(syncFromDev, POLL_INTERVAL_MS);
}

main();
