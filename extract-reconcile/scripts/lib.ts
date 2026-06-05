// Shared helpers for the extract-reconcile workflow scripts.
// Imported by init.ts, squash.ts, candidate.ts, rebase.ts, iterate.ts, status.ts.
//
// Branch naming convention: {NAME}/{FEATURE}-{merge,proto,reconcile,candidate}
//
// Configuration precedence:
//   1. Environment variables NAME and FEATURE
//   2. .git/extract-reconcile (KEY=VALUE lines) — kept inside .git/ so branch
//      checkouts never disturb it (see configPath/loadConfig below).
//
// All scripts are git-only (no extra deps). They abort on a dirty working tree
// unless the operation explicitly tolerates one, and they never force-push.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// --- output helpers ----------------------------------------------------------

// Machine-readable status lines are prefixed with "XR:" so a calling agent can
// grep them deterministically. Human prose goes to stderr.
export function xrStatus(msg: string): void {
  process.stdout.write(`XR: ${msg}\n`);
}
export function xrInfo(msg: string): void {
  process.stderr.write(`${msg}\n`);
}
export function xrDie(msg: string): never {
  process.stderr.write(`XR-ERROR: ${msg}\n`);
  process.exit(1);
}

// --- git plumbing ------------------------------------------------------------

export interface GitResult {
  status: number;
  stdout: string;
  stderr: string;
}

// Run a git command, capturing stdout/stderr. Does not throw.
export function git(
  args: string[],
  opts: { cwd?: string; input?: string; env?: Record<string, string> } = {},
): GitResult {
  const r = spawnSync("git", args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

// Run git and require success; return stdout (trimmed of trailing newline).
export function gitOK(
  args: string[],
  opts: { cwd?: string; input?: string; env?: Record<string, string> } = {},
): string {
  const r = git(args, opts);
  if (r.status !== 0) {
    xrDie(`git ${args.join(" ")} failed: ${r.stderr.trim() || r.stdout.trim()}`);
  }
  return r.stdout.replace(/\n$/, "");
}

export function requireGit(): void {
  const r = git(["rev-parse", "--is-inside-work-tree"]);
  if (r.status !== 0 || r.stdout.trim() !== "true") {
    xrDie("not inside a git work tree");
  }
}

export function repoRoot(): string {
  return gitOK(["rev-parse", "--show-toplevel"]);
}

// Abort if the working tree (tracked files) has uncommitted changes.
export function requireClean(): void {
  if (git(["diff", "--quiet"]).status !== 0 || git(["diff", "--cached", "--quiet"]).status !== 0) {
    xrDie("working tree is dirty; commit or stash before running this operation");
  }
}

export function branchExists(name: string): boolean {
  return git(["show-ref", "--verify", "--quiet", `refs/heads/${name}`]).status === 0;
}

export function requireBranch(name: string): void {
  if (!branchExists(name)) {
    xrDie(`branch '${name}' does not exist (run init first)`);
  }
}

export function currentBranch(): string {
  return gitOK(["rev-parse", "--abbrev-ref", "HEAD"]);
}

// --- configuration -----------------------------------------------------------

export interface XrConfig {
  name: string;
  feature: string;
  merge: string;
  proto: string;
  reconcile: string;
  candidate: string;
}

// Config lives at .git/extract-reconcile, *outside* the working tree, so it
// is unaffected by branch checkouts. (Keeping it as a tracked file would
// vanish whenever the agent switches to a branch where it was never
// committed, e.g. -merge after init.)
export function configPath(): string {
  const gitDir = gitOK(["rev-parse", "--git-dir"]);
  // git-dir is relative to cwd in normal repos, absolute in worktrees.
  // Resolve relative paths against repoRoot for stability.
  return gitDir.startsWith("/") ? join(gitDir, "extract-reconcile") : join(repoRoot(), gitDir, "extract-reconcile");
}

export function loadConfig(): XrConfig {
  let name = process.env.NAME ?? "";
  let feature = process.env.FEATURE ?? "";

  const cfgPath = configPath();
  if (existsSync(cfgPath)) {
    const text = readFileSync(cfgPath, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key === "NAME" && !name) name = val;
      else if (key === "FEATURE" && !feature) feature = val;
    }
  }

  if (!name) xrDie("NAME is not set (env var or .git/extract-reconcile)");
  if (!feature) xrDie("FEATURE is not set (env var or .git/extract-reconcile)");

  return {
    name,
    feature,
    merge: `${name}/${feature}-merge`,
    proto: `${name}/${feature}-proto`,
    reconcile: `${name}/${feature}-reconcile`,
    candidate: `${name}/${feature}-candidate`,
  };
}

export function writeConfig(name: string, feature: string): void {
  const cfgPath = configPath();
  const body =
    "# extract-reconcile workflow config\n" +
    `NAME=${name}\n` +
    `FEATURE=${feature}\n`;
  writeFileSync(cfgPath, body);
  xrInfo(`wrote config to ${cfgPath}`);
}

// --- argument parsing --------------------------------------------------------

// Parse a minimal --key=value / --key value / positional argv slice.
// Returns { flags, positional }.
export function parseArgs(argv: string[]): {
  flags: Record<string, string | true>;
  positional: string[];
} {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}
