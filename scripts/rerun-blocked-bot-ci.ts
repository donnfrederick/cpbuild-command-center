#!/usr/bin/env npx tsx
/**
 * Rerun workflows stuck at action_required on open PRs targeting dev.
 * Equivalent to clicking "Approve and run" in GitHub Actions UI — uses a
 * token with actions:write (Phil's gh auth or COPILOT_REVIEWER_PAT).
 *
 * Same-repo PRs (contributors + Dependabot) often stall after auto-rebase
 * because github-actions[bot] becomes the triggering actor.
 *
 * Usage:
 *   npx tsx scripts/rerun-blocked-bot-ci.ts              # all open dev PRs
 *   npx tsx scripts/rerun-blocked-bot-ci.ts --bots-only  # trusted bot PRs only
 *   npx tsx scripts/rerun-blocked-bot-ci.ts 1636 1645    # specific PR numbers
 */

import { execSync } from "node:child_process";
import {
  isTrustedBotPrForAutoMerge,
  type BotPrTrustInput,
} from "@/lib/bot-pr-trusted";

const REPO = "cp-build-dev-ops/command-center-reboot";

interface PrRow {
  number: number;
  authorLogin: string;
  headRefOid: string;
  labels: string[];
  changedFiles: string[];
}

interface RunRow {
  databaseId: number;
  conclusion: string | null;
  status: string;
  headSha: string;
  name: string;
}

function ghJson<T>(args: string): T {
  return JSON.parse(
    execSync(`gh ${args} --repo ${REPO}`, { encoding: "utf8" })
  ) as T;
}

function ghRun(args: string): void {
  execSync(`gh ${args}`, {
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, GH_REPO: REPO },
  });
}

function parseArgs(argv: string[]): { botsOnly: boolean; prNumbers: number[] } {
  const prNumbers: number[] = [];
  let botsOnly = false;

  for (const arg of argv) {
    if (arg === "--bots-only") {
      botsOnly = true;
      continue;
    }
    const n = Number(arg);
    if (Number.isFinite(n) && n > 0) {
      prNumbers.push(n);
    }
  }

  return { botsOnly, prNumbers };
}

function fetchOpenPrs(numbers?: number[]): PrRow[] {
  if (numbers && numbers.length > 0) {
    return numbers.map((n) => {
      const row = ghJson<{
        author: { login: string };
        headRefOid: string;
        labels: { name: string }[];
        files: { path: string }[];
      }>(`pr view ${n} --json author,headRefOid,labels,files`);
      return {
        number: n,
        authorLogin: row.author.login,
        headRefOid: row.headRefOid,
        labels: row.labels.map((l) => l.name),
        changedFiles: row.files.map((f) => f.path),
      };
    });
  }

  const list = ghJson<{ number: number }[]>(
    `pr list --base dev --state open --json number`
  );

  return list.map(({ number }) => {
    const row = ghJson<{
      author: { login: string };
      headRefOid: string;
      labels: { name: string }[];
      files: { path: string }[];
    }>(`pr view ${number} --json author,headRefOid,labels,files`);
    return {
      number,
      authorLogin: row.author.login,
      headRefOid: row.headRefOid,
      labels: row.labels.map((l) => l.name),
      changedFiles: row.files.map((f) => f.path),
    };
  });
}

function findBlockedRuns(headSha: string): RunRow[] {
  const runs = ghJson<RunRow[]>(
    `run list --commit ${headSha} --json databaseId,conclusion,status,headSha,name`
  );
  return runs.filter((r) => r.conclusion === "action_required");
}

function rerunRun(runId: number): "rerun" | "skip" {
  try {
    ghRun(`run rerun ${runId}`);
    return "rerun";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already running") || msg.includes("Cannot rerun")) {
      return "skip";
    }
    throw err;
  }
}

function shouldProcessPr(
  pr: PrRow,
  botsOnly: boolean
): boolean {
  if (!botsOnly) {
    return true;
  }

  const input: BotPrTrustInput = {
    authorLogin: pr.authorLogin,
    labels: pr.labels,
    changedFiles: pr.changedFiles,
  };
  return isTrustedBotPrForAutoMerge(input);
}

function main(): void {
  const { botsOnly, prNumbers } = parseArgs(process.argv.slice(2));
  const prs = fetchOpenPrs(prNumbers.length > 0 ? prNumbers : undefined);

  let rerunCount = 0;
  const seenRunIds = new Set<number>();

  for (const pr of prs) {
    if (!shouldProcessPr(pr, botsOnly)) {
      continue;
    }

    const blocked = findBlockedRuns(pr.headRefOid);
    if (blocked.length === 0) {
      console.log(`PR #${pr.number}: no action_required runs on HEAD`);
      continue;
    }

    for (const run of blocked) {
      if (seenRunIds.has(run.databaseId)) {
        continue;
      }
      seenRunIds.add(run.databaseId);

      const action = rerunRun(run.databaseId);
      if (action === "rerun") {
        rerunCount += 1;
        console.log(
          `PR #${pr.number}: reran ${run.name} #${run.databaseId}`
        );
      } else {
        console.log(
          `PR #${pr.number}: skipped ${run.name} #${run.databaseId} (already running or not rerunnable)`
        );
      }
    }
  }

  console.log(`Done — ${rerunCount} run(s) re-triggered.`);
}

main();
