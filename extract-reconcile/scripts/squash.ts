#!/usr/bin/env bun
// squash.ts — collapse {feature}-proto's additive history into a single
// clean working diff on {feature}-reconcile against {feature}-merge.
//
// Usage:
//   bun squash.ts [--message "<commit subject>"]
//
// Behavior:
//   - Resets -reconcile to -merge.
//   - Computes the tree at the tip of -proto (which represents all
//     exploration to date) and applies it as a single commit on -reconcile.
//   - The result: -reconcile contains exactly one commit on top of -merge,
//     whose diff equals the full proto-vs-merge difference.
//   - Refuses to run if the working tree is dirty.

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
      : `xr: squashed proto exploration onto ${cfg.merge}`;

  const protoSha = gitOK(["rev-parse", cfg.proto]);
  const mergeSha = gitOK(["rev-parse", cfg.merge]);

  // If proto has no diff against merge, there is nothing to squash.
  const diff = git(["diff", "--quiet", `${cfg.merge}..${cfg.proto}`]);
  if (diff.status === 0) {
    xrInfo("proto has no diff against merge; resetting reconcile to merge");
    const co = git(["checkout", cfg.reconcile]);
    if (co.status !== 0) xrDie(`checkout ${cfg.reconcile} failed: ${co.stderr.trim()}`);
    const rs = git(["reset", "--hard", cfg.merge]);
    if (rs.status !== 0) xrDie(`reset ${cfg.reconcile} to ${cfg.merge} failed: ${rs.stderr.trim()}`);
    xrStatus(`squash noop reconcile=${cfg.reconcile} at merge=${mergeSha}`);
    return;
  }

  // Build a single commit whose TREE is exactly proto's tree, parented on the
  // merge tip, using PURE PLUMBING. commit-tree reads only the named tree
  // object; it never scans the index or working directory, so stray untracked
  // files cannot leak into the squashed commit.
  const protoTree = gitOK(["rev-parse", `${cfg.proto}^{tree}`]);
  const newCommit = gitOK(["commit-tree", protoTree, "-p", cfg.merge, "-m", message]);

  // Point the reconcile branch at the new commit, then sync the checkout.
  const upd = git(["update-ref", `refs/heads/${cfg.reconcile}`, newCommit]);
  if (upd.status !== 0) xrDie(`update-ref ${cfg.reconcile} failed: ${upd.stderr.trim()}`);

  const co = git(["checkout", cfg.reconcile]);
  if (co.status !== 0) xrDie(`checkout ${cfg.reconcile} failed: ${co.stderr.trim()}`);
  const rs = git(["reset", "--hard", cfg.reconcile]);
  if (rs.status !== 0) xrDie(`reset working tree to ${cfg.reconcile} failed: ${rs.stderr.trim()}`);

  const reconcileSha = gitOK(["rev-parse", cfg.reconcile]);

  xrStatus(`squash ok reconcile=${cfg.reconcile} sha=${reconcileSha}`);
  xrStatus(`squash from-proto=${protoSha} onto-merge=${mergeSha}`);
}

main();
