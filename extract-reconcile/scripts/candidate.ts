#!/usr/bin/env bun
// candidate.ts — manage the {feature}-candidate review/extraction branch.
//
// INVARIANT: This script never checks out -candidate or -merge. Both branches
// are mutated by ref updates only. The user's HEAD and working tree are not
// disturbed.
//
// The candidate branch is a constantly-reset scratch branch that always sits
// directly on top of {feature}-merge. It holds exactly one commit: the unit
// you intend to extract this cycle. You build-verify the candidate in an
// isolated worktree (e.g. `git worktree add /tmp/xr-cand <candidate>`),
// review it in Hunk (as a merge..candidate diff), and then PROMOTE it by
// fast-forwarding merge to it via a ref update — so what you verified is
// byte-identical to what lands.
//
// Promote is the only landing step: there is no separate extract step and no
// throwaway-branch bookkeeping. Review is just the optional middle step.
//
// Subcommands:
//   set --patch <file> --message "<subject>"
//       Build the candidate ref via pure plumbing: seed a temp index from
//       -merge's tree, `git apply --cached` the patch into that index,
//       `write-tree`, `commit-tree` parented on -merge, and `update-ref`
//       refs/heads/{candidate}. HEAD and working tree are NOT touched.
//       The patch should live OUTSIDE the work tree (e.g. /tmp) so it never
//       litters the repo. It must apply cleanly to the current -merge tip.
//       Verify by extracting candidate into a temp worktree.
//
//   review
//       Print the `hunk session reload` command that shows ONLY this candidate
//       (a merge..candidate diff). Hunk then equals exactly what will land.
//
//   promote
//       Fast-forward -merge to -candidate via `update-ref` (clean FF:
//       candidate's parent IS merge). No patch re-application; the verified
//       tree becomes merge. HEAD is NOT moved. Run rebase.ts then iterate.ts
//       afterward.
//
//   reset
//       Reset the -candidate ref back to -merge via `update-ref` (discard the
//       candidate commit). HEAD is NOT touched. Use to abandon a candidate or
//       start clean between cycles.
//
// The -candidate branch is lazily created on first `set` (no init change
// required for existing features).

import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  branchExists,
  currentBranch,
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
  type XrConfig,
} from "./lib.ts";

function ensureCandidateBranch(cfg: XrConfig): void {
  if (!branchExists(cfg.candidate)) {
    const r = git(["branch", cfg.candidate, cfg.merge]);
    if (r.status !== 0) {
      xrDie(`failed to create ${cfg.candidate}: ${r.stderr.trim()}`);
    }
    xrInfo(`lazily created ${cfg.candidate} at ${cfg.merge}`);
  }
}

function refuseIfHeadOnBranch(branch: string, subcmd: string): void {
  const head = currentBranch();
  if (head === branch) {
    xrDie(
      `refusing to run 'candidate.ts ${subcmd}' while HEAD is on ${branch}: ` +
        `this script mutates ${branch}'s ref via update-ref, which would silently ` +
        `move your HEAD sha and desync your working tree. Switch to -reconcile first ` +
        `(\`git checkout <reconcile-branch>\`) and re-run.`,
    );
  }
}

function cmdSet(cfg: XrConfig): void {
  requireClean();
  requireBranch(cfg.merge);

  const { flags } = parseArgs(process.argv.slice(3));
  const patch = typeof flags.patch === "string" ? flags.patch : "";
  const message = typeof flags.message === "string" ? flags.message : "";

  if (!patch) xrDie("--patch <file> is required");
  if (!message) xrDie('--message "<commit subject>" is required');
  if (!existsSync(patch)) xrDie(`patch file not found: ${patch}`);

  ensureCandidateBranch(cfg);
  refuseIfHeadOnBranch(cfg.candidate, "set");

  const mergeSha = gitOK(["rev-parse", cfg.merge]);
  const mergeTree = gitOK(["rev-parse", `${cfg.merge}^{tree}`]);

  const tmpIndex = join(tmpdir(), `xr-candidate-set-${process.pid}-${Date.now()}.index`);
  try {
    // Seed a temp index from merge's tree (does NOT touch the real index or
    // working tree because GIT_INDEX_FILE points elsewhere).
    const seed = git(["read-tree", mergeTree], { env: { GIT_INDEX_FILE: tmpIndex } });
    if (seed.status !== 0) xrDie(`read-tree from ${cfg.merge} failed: ${seed.stderr.trim()}`);

    // Verify the patch applies cleanly to the temp index (NOT the working tree).
    const check = git(["apply", "--check", "--cached", patch], {
      env: { GIT_INDEX_FILE: tmpIndex },
    });
    if (check.status !== 0) {
      xrInfo(`patch does not apply cleanly to ${cfg.merge}:`);
      xrInfo(check.stderr || check.stdout);
      xrDie("candidate set aborted: patch did not apply");
    }

    // Apply for real into the temp index.
    const apply = git(["apply", "--cached", patch], { env: { GIT_INDEX_FILE: tmpIndex } });
    if (apply.status !== 0) {
      xrInfo(apply.stderr || apply.stdout);
      xrDie("git apply --cached failed");
    }

    // Write the temp index out as a tree object.
    const newTree = gitOK(["write-tree"], { env: { GIT_INDEX_FILE: tmpIndex } });

    // Build the commit (no HEAD involvement) parented on -merge.
    const newCommit = gitOK(["commit-tree", newTree, "-p", cfg.merge, "-m", message]);

    // Advance the candidate ref.
    const upd = git(["update-ref", `refs/heads/${cfg.candidate}`, newCommit]);
    if (upd.status !== 0) xrDie(`update-ref ${cfg.candidate} failed: ${upd.stderr.trim()}`);

    const candidateSha = gitOK(["rev-parse", cfg.candidate]);
    xrStatus(`candidate set branch=${cfg.candidate} sha=${candidateSha}`);
    xrStatus(`candidate set onto-merge=${mergeSha}`);
    xrStatus("candidate set HEAD-untouched (plumbing-only)");
    xrInfo(
      `Candidate built. Verify in an isolated worktree, e.g.:\n` +
        `  git worktree add /tmp/xr-${cfg.candidate} ${cfg.candidate} && \\\n` +
        `    cd /tmp/xr-${cfg.candidate} && <build/test command> && cd - && \\\n` +
        `    git worktree remove /tmp/xr-${cfg.candidate}\n` +
        `Then 'candidate.ts review' to inspect in Hunk, or 'candidate.ts promote' to land it.`,
    );
  } finally {
    try {
      unlinkSync(tmpIndex);
    } catch (e: unknown) {
      // Best-effort cleanup: ignore ENOENT (already gone) and any other
      // unlink failure (the tmp file is in tmpdir() and will be reaped).
      const err = e as NodeJS.ErrnoException;
      if (err && err.code !== "ENOENT") {
        // Non-ENOENT errors are still non-fatal for the workflow.
      }
    }
  }
}

function cmdReview(cfg: XrConfig): void {
  requireBranch(cfg.merge);
  requireBranch(cfg.candidate);

  const mergeSha = gitOK(["rev-parse", cfg.merge]);
  const candidateSha = gitOK(["rev-parse", cfg.candidate]);
  if (mergeSha === candidateSha) {
    xrInfo(
      `${cfg.candidate} is identical to ${cfg.merge} — nothing staged. Run 'candidate.ts set' first.`,
    );
  }

  const reloadCmd = `hunk session reload --repo . -- diff ${cfg.merge}...${cfg.candidate}`;
  xrStatus(`candidate review diff=${cfg.merge}...${cfg.candidate}`);
  xrStatus(`candidate review hunk-cmd=${reloadCmd}`);
  xrInfo(
    `Reload Hunk to show ONLY this candidate (the screen equals what will land):\n  ${reloadCmd}`,
  );
}

function cmdPromote(cfg: XrConfig): void {
  requireClean();
  requireBranch(cfg.merge);
  requireBranch(cfg.candidate);
  refuseIfHeadOnBranch(cfg.merge, "promote");

  const mergeShaBefore = gitOK(["rev-parse", cfg.merge]);
  const candidateSha = gitOK(["rev-parse", cfg.candidate]);

  if (mergeShaBefore === candidateSha) {
    xrDie(`${cfg.candidate} == ${cfg.merge}; nothing to promote (run 'set' first)`);
  }

  // Candidate must be a fast-forward of merge (its parent IS merge).
  const isAncestor = git(["merge-base", "--is-ancestor", cfg.merge, cfg.candidate]);
  if (isAncestor.status !== 0) {
    xrDie(
      `${cfg.candidate} is not a fast-forward of ${cfg.merge}; ` +
        `candidate must sit directly on merge (re-run 'candidate.ts set')`,
    );
  }

  // Fast-forward -merge to -candidate via a ref update. HEAD is not touched.
  const upd = git(["update-ref", `refs/heads/${cfg.merge}`, candidateSha]);
  if (upd.status !== 0) xrDie(`update-ref ${cfg.merge} failed: ${upd.stderr.trim()}`);

  const mergeShaAfter = gitOK(["rev-parse", cfg.merge]);
  xrStatus(`candidate promote merge=${cfg.merge}`);
  xrStatus(`candidate promote before=${mergeShaBefore} after=${mergeShaAfter}`);
  xrStatus("candidate promote HEAD-untouched (plumbing-only)");
  xrInfo(
    `merge advanced to the verified candidate (HEAD untouched). Next: rebase.ts ` +
      `(drops extracted hunks from reconcile), then iterate.ts (snapshot leftover to proto).`,
  );
}

function cmdReset(cfg: XrConfig): void {
  requireClean();
  requireBranch(cfg.merge);
  ensureCandidateBranch(cfg);
  refuseIfHeadOnBranch(cfg.candidate, "reset");

  const mergeSha = gitOK(["rev-parse", cfg.merge]);
  const upd = git(["update-ref", `refs/heads/${cfg.candidate}`, mergeSha]);
  if (upd.status !== 0) xrDie(`update-ref ${cfg.candidate} failed: ${upd.stderr.trim()}`);

  xrStatus(`candidate reset branch=${cfg.candidate} to=${cfg.merge}`);
  xrInfo(`${cfg.candidate} ref reset to ${cfg.merge} (HEAD untouched).`);
}

function main(): void {
  requireGit();
  const cfg = loadConfig();

  const sub = process.argv[2];
  switch (sub) {
    case "set":
      cmdSet(cfg);
      break;
    case "review":
      cmdReview(cfg);
      break;
    case "promote":
      cmdPromote(cfg);
      break;
    case "reset":
      cmdReset(cfg);
      break;
    default:
      xrDie(
        `unknown subcommand '${sub ?? ""}'. Use one of: set | review | promote | reset`,
      );
  }
}

main();
