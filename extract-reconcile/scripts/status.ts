#!/usr/bin/env bun
// status.ts — show divergence across {feature}-{merge,proto,reconcile}.
//
// Usage:
//   bun status.ts
//
// Reports:
//   - tip sha of each branch
//   - merge..reconcile diffstat (the candidate extraction surface)
//   - merge..proto    diffstat (full exploration vs stable truth)
//   - reconcile vs proto tree equivalence (does iterate need to run?)
//   - currently checked-out branch

import {
  git,
  gitOK,
  loadConfig,
  requireBranch,
  requireGit,
  xrInfo,
  xrStatus,
} from "./lib.ts";

function diffStat(from: string, to: string): string {
  const r = git(["diff", "--shortstat", `${from}..${to}`]);
  if (r.status !== 0) return "(diffstat failed)";
  const line = r.stdout.trim();
  return line === "" ? "(no diff)" : line;
}

function commitCount(from: string, to: string): string {
  const r = git(["rev-list", "--count", `${from}..${to}`]);
  if (r.status !== 0) return "?";
  return r.stdout.trim();
}

function main(): void {
  requireGit();
  const cfg = loadConfig();
  requireBranch(cfg.merge);
  requireBranch(cfg.proto);
  requireBranch(cfg.reconcile);

  const mergeSha = gitOK(["rev-parse", cfg.merge]);
  const protoSha = gitOK(["rev-parse", cfg.proto]);
  const reconcileSha = gitOK(["rev-parse", cfg.reconcile]);
  const head = gitOK(["rev-parse", "--abbrev-ref", "HEAD"]);

  const mergeTree = gitOK(["rev-parse", `${cfg.merge}^{tree}`]);
  const protoTree = gitOK(["rev-parse", `${cfg.proto}^{tree}`]);
  const reconcileTree = gitOK(["rev-parse", `${cfg.reconcile}^{tree}`]);

  xrStatus(`name=${cfg.name} feature=${cfg.feature}`);
  xrStatus(`head=${head}`);
  xrStatus(`merge=${cfg.merge} sha=${mergeSha}`);
  xrStatus(`proto=${cfg.proto} sha=${protoSha} commits-ahead-of-merge=${commitCount(cfg.merge, cfg.proto)}`);
  xrStatus(`reconcile=${cfg.reconcile} sha=${reconcileSha} commits-ahead-of-merge=${commitCount(cfg.merge, cfg.reconcile)}`);

  xrStatus(`diff merge..reconcile ${diffStat(cfg.merge, cfg.reconcile)}`);
  xrStatus(`diff merge..proto     ${diffStat(cfg.merge, cfg.proto)}`);

  const reconcileEqProto = reconcileTree === protoTree;
  const reconcileEqMerge = reconcileTree === mergeTree;
  const protoEqMerge = protoTree === mergeTree;

  xrStatus(`tree reconcile==proto=${reconcileEqProto}`);
  xrStatus(`tree reconcile==merge=${reconcileEqMerge}`);
  xrStatus(`tree proto==merge=${protoEqMerge}`);

  if (reconcileEqMerge && protoEqMerge) {
    xrInfo("All three branches agree. No exploration in flight.");
  } else if (reconcileEqMerge && !protoEqMerge) {
    xrInfo("Reconcile is at merge but proto has unmerged exploration. Run squash.ts.");
  } else if (!reconcileEqProto) {
    xrInfo("Reconcile has diverged from proto. Run iterate.ts to append the new exploration.");
  }
}

main();
