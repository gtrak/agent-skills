#!/usr/bin/env bun
// install.ts — symlink every skill in this repo into ~/.config/opencode/skills.
//
// Usage:
//   bun install.ts            # create/refresh symlinks
//   bun install.ts --dry-run  # print actions, write nothing
//   bun install.ts --force    # replace an existing REAL dir/file (not a symlink)
//
// A "skill" is any immediate subdirectory of the repo root containing a
// SKILL.md. For each, we create an absolute symlink
//   ~/.config/opencode/skills/<skill>  ->  <repo>/<skill>
// so edits in the repo are live with no reinstall.
//
// Existing destination handling:
//   - symlink already pointing at the correct target  -> "already linked", skip
//   - symlink pointing elsewhere                       -> replaced
//   - real dir/file                                    -> refused unless --force
//                                                         (--force removes it first)
//
// Output: machine-readable "XR:" lines on stdout, human prose on stderr, matching
// the workflow scripts. Exits non-zero if any skill could not be linked.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function xrStatus(msg: string): void {
  process.stdout.write(`XR: ${msg}\n`);
}
function xrInfo(msg: string): void {
  process.stderr.write(`${msg}\n`);
}
function xrDie(msg: string): never {
  process.stderr.write(`XR-ERROR: ${msg}\n`);
  process.exit(1);
}

const repoRoot = dirname(fileURLToPath(import.meta.url));
const destRoot = join(homedir(), ".config", "opencode", "skills");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
for (const a of args) {
  if (a !== "--dry-run" && a !== "--force") {
    xrDie(`unknown flag '${a}'. Use --dry-run and/or --force.`);
  }
}

// Discover skill directories: immediate subdirs containing a SKILL.md.
const IGNORE = new Set([".git", "node_modules"]);
function discoverSkills(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(repoRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORE.has(entry.name)) continue;
    if (existsSync(join(repoRoot, entry.name, "SKILL.md"))) out.push(entry.name);
  }
  return out.sort();
}

const skills = discoverSkills();
if (skills.length === 0) {
  xrDie(`no skills found in ${repoRoot} (looked for immediate subdirs with SKILL.md)`);
}

xrInfo(`repo:  ${repoRoot}`);
xrInfo(`dest:  ${destRoot}`);
xrInfo(`skills: ${skills.join(", ")}${dryRun ? "  (dry-run)" : ""}`);

if (!dryRun) mkdirSync(destRoot, { recursive: true });

let failed = 0;
for (const skill of skills) {
  const target = join(repoRoot, skill); // absolute symlink target
  const link = join(destRoot, skill);

  // Inspect the existing destination without following symlinks.
  let info: ReturnType<typeof lstatSync> | null = null;
  try {
    info = lstatSync(link);
  } catch {
    info = null; // does not exist
  }

  if (info?.isSymbolicLink()) {
    const current = readlinkSync(link);
    if (current === target) {
      xrStatus(`already-linked skill=${skill} -> ${target}`);
      continue;
    }
    if (dryRun) {
      xrStatus(`would-relink skill=${skill} from=${current} to=${target}`);
      continue;
    }
    rmSync(link);
    symlinkSync(target, link);
    xrStatus(`relinked skill=${skill} from=${current} to=${target}`);
    continue;
  }

  if (info) {
    // Real file or directory occupying the destination.
    if (!force) {
      xrInfo(
        `refusing to replace real path ${link} (not a symlink). ` +
          `Re-run with --force to remove and symlink it.`,
      );
      xrStatus(`blocked skill=${skill} reason=real-path-exists`);
      failed++;
      continue;
    }
    if (dryRun) {
      xrStatus(`would-replace skill=${skill} real-path=${link} with=${target}`);
      continue;
    }
    rmSync(link, { recursive: true, force: true });
    symlinkSync(target, link);
    xrStatus(`replaced skill=${skill} -> ${target}`);
    continue;
  }

  // Nothing there: create the link.
  if (dryRun) {
    xrStatus(`would-link skill=${skill} -> ${target}`);
    continue;
  }
  symlinkSync(target, link);
  xrStatus(`linked skill=${skill} -> ${target}`);
}

if (failed > 0) {
  xrDie(`${failed} skill(s) could not be linked (see messages above; --force to replace real paths)`);
}
xrInfo(dryRun ? "dry-run complete; no changes written." : "install complete.");
