#!/usr/bin/env bun
// iterate.ts — append {feature}-reconcile's current state onto {feature}-proto
// as a new additive commit, preserving proto as an append-only log.
//
// Usage:
//   bun iterate.ts [--message "<commit subject>"]
//
// Behavior:
//   - The agent has just done more exploration on -reconcile (after the
//     previous extract+rebase cycle). This script captures the tip tree of
//     -reconcile and snaps it onto -proto as a single new commit.
//   - -proto is never rewritten: it strictly grows. Each iterate adds one
//     commit whose tree equals the corresponding reconcile tip. The history
//     of -proto is therefore a journal of "what reconcile looked like at
//     each iterate point".
//   - If -reconcile's tip tree already equals -proto's tip tree, this is a
//     no-op (nothing new to record).

import {
  git,
  gitOK,
  loadConfig,
  parseArgs,
  requireBranch,
  requireClean,
  requireGit,
  xrDie,
  xrInfo,
  xrStatus,
} from "./lib.ts";

function main(): void {
  requireGit();
  requireClean();

  const cfg = loadConfig();
  requireBranch(cfg.merge);
  requireBranch(cfg.proto);
  requireBranch(cfg.reconcile);

  const { flags } = parseArgs(process.argv.slice(2));
  const message =
    typeof flags.message === "string"
      ? flags.message
      : `xr: iterate snapshot from ${cfg.reconcile}`;

  const reconcileTree = gitOK(["rev-parse", `${cfg.reconcile}^{tree}`]);
  const protoTree = gitOK(["rev-parse", `${cfg.proto}^{tree}`]);
  const reconcileSha = gitOK(["rev-parse", cfg.reconcile]);
  const protoShaBefore = gitOK(["rev-parse", cfg.proto]);

  if (reconcileTree === protoTree) {
    xrInfo("reconcile tip tree equals proto tip tree; nothing to append");
    xrStatus(`iterate noop proto=${cfg.proto} sha=${protoShaBefore}`);
    return;
  }

  // Append a commit whose TREE is exactly reconcile's tree, parented on the
  // current proto tip, using PURE PLUMBING. commit-tree reads only the named
  // tree object; it never scans the index or working directory, so stray
  // untracked files cannot leak into the append-only proto journal.
  const newCommit = gitOK(["commit-tree", reconcileTree, "-p", cfg.proto, "-m", message]);

  // Advance proto to the new commit (append-only: proto's prior tip is the parent).
  const upd = git(["update-ref", `refs/heads/${cfg.proto}`, newCommit]);
  if (upd.status !== 0) xrDie(`update-ref ${cfg.proto} failed: ${upd.stderr.trim()}`);

  const protoShaAfter = gitOK(["rev-parse", cfg.proto]);
  xrStatus(`iterate ok proto=${cfg.proto} sha=${protoShaAfter}`);
  xrStatus(`iterate from-reconcile=${reconcileSha} prev-proto=${protoShaBefore}`);

  // We never left reconcile (commit-tree/update-ref don't touch HEAD), but
  // checkout here defensively confirms the working tree matches reconcile and
  // preserves the status line callers grep for.
  const back = git(["checkout", cfg.reconcile]);
  if (back.status !== 0) xrDie(`checkout ${cfg.reconcile} failed: ${back.stderr.trim()}`);
  xrStatus(`iterate checked-out ${cfg.reconcile}`);
}

main();
