#!/usr/bin/env bun
// rebase.ts — re-derive {feature}-reconcile on top of the new {feature}-merge.
//
// Usage:
//   bun rebase.ts [--message "<commit subject>"]
//
// Behavior:
//   - Captures the tree at the current tip of -reconcile (the squashed
//     working state, before this rebase).
//   - Resets -reconcile to -merge.
//   - Re-applies the captured tree as a single commit on top of -merge.
//   - The diff at -reconcile is now exactly (old reconcile tree vs new
//     merge tree) — i.e. the extracted hunks have dropped out and only the
//     leftover exploration remains.
//   - If after the reset the captured tree equals -merge's tree (everything
//     was extracted), the rebase is a no-op and reconcile becomes empty.
//
// This avoids any 3-way merge: we are not replaying commits, we are
// re-pinning the working state on top of the new truth.

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
  requireBranch(cfg.reconcile);

  const { flags } = parseArgs(process.argv.slice(2));
  const message =
    typeof flags.message === "string"
      ? flags.message
      : `xr: rebased reconcile onto ${cfg.merge}`;

  // Capture the tree at the current tip of -reconcile.
  const reconcileTree = gitOK(["rev-parse", `${cfg.reconcile}^{tree}`]);
  const reconcileShaBefore = gitOK(["rev-parse", cfg.reconcile]);
  const mergeSha = gitOK(["rev-parse", cfg.merge]);
  const mergeTree = gitOK(["rev-parse", `${cfg.merge}^{tree}`]);

  // Re-pin reconcile's tree onto merge using PURE PLUMBING — no working-tree
  // scan, so stray untracked files cannot leak into the commit.
  //
  // Fast path: the prior reconcile tree equals merge's tree => nothing left.
  if (reconcileTree === mergeTree) {
    // Reset the reconcile branch to merge so its tip matches (empty leftover).
    const co = git(["checkout", cfg.reconcile]);
    if (co.status !== 0) xrDie(`checkout ${cfg.reconcile} failed: ${co.stderr.trim()}`);
    const rs = git(["reset", "--hard", cfg.merge]);
    if (rs.status !== 0) xrDie(`reset ${cfg.reconcile} to ${cfg.merge} failed: ${rs.stderr.trim()}`);
    xrInfo("nothing left to rebase: prior reconcile tree equals merge tree");
    xrStatus(`rebase empty reconcile=${cfg.reconcile} sha=${gitOK(["rev-parse", cfg.reconcile])}`);
    xrStatus(`rebase from=${reconcileShaBefore} onto-merge=${mergeSha}`);
    return;
  }

  // Build a commit whose TREE is exactly the prior reconcile tree, parented on
  // the new merge. commit-tree reads only the named tree object — it never
  // touches the index or working directory, so untracked files are irrelevant.
  const newCommit = gitOK(["commit-tree", reconcileTree, "-p", cfg.merge, "-m", message]);

  // Point the reconcile branch at the new commit.
  const upd = git(["update-ref", `refs/heads/${cfg.reconcile}`, newCommit]);
  if (upd.status !== 0) xrDie(`update-ref ${cfg.reconcile} failed: ${upd.stderr.trim()}`);

  // Sync the working tree/index to the rewritten branch tip (we are likely on
  // reconcile; this makes the checkout reflect the new commit cleanly).
  const co = git(["checkout", cfg.reconcile]);
  if (co.status !== 0) xrDie(`checkout ${cfg.reconcile} failed: ${co.stderr.trim()}`);
  const rs = git(["reset", "--hard", cfg.reconcile]);
  if (rs.status !== 0) xrDie(`reset working tree to ${cfg.reconcile} failed: ${rs.stderr.trim()}`);

  const reconcileShaAfter = gitOK(["rev-parse", cfg.reconcile]);
  xrStatus(`rebase ok reconcile=${cfg.reconcile} sha=${reconcileShaAfter}`);
  xrStatus(`rebase from=${reconcileShaBefore} onto-merge=${mergeSha}`);
}

main();
