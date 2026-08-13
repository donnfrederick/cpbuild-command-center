/**
 * Same behavior as check-dev-updates.sh — works on Windows without bash/WSL.
 * Run: npm run check:dev (via predev before npm run dev)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function git(args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { ok: r.status === 0, stdout: (r.stdout ?? "").trim() };
}

spawnSync("git", ["fetch", "origin", "dev"], {
  cwd: root,
  encoding: "utf8",
  stdio: "ignore",
});

const local = git(["rev-parse", "dev"]);
const remote = git(["rev-parse", "origin/dev"]);

if (!local.ok || !remote.ok) {
  console.log(
    "⚠️  Could not determine dev vs origin/dev state (missing local 'dev' branch or 'origin/dev' ref). Skipping up-to-date check."
  );
  process.exit(0);
}

if (local.stdout !== remote.stdout) {
  const behind = git(["rev-list", "--count", "dev..origin/dev"]);
  const n = behind.ok ? behind.stdout : "?";
  console.log(`⚠️  dev is behind origin/dev by ${n} commit(s). Run: git pull origin dev`);
  process.exit(0);
}

console.log("✓ dev is up to date with origin/dev");
process.exit(0);
