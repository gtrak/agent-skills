#!/usr/bin/env bun
// init.ts — create the {name}/{feature}-{merge,proto,reconcile} branch trio.
//
// Usage:
//   bun init.ts --name <ns> --feature <feat> [--base <ref>]
//
// Behavior:
//   - Creates the -merge/-proto/-reconcile trio from <base> (defaults to HEAD).
//     The -candidate branch is created lazily later, by `candidate.ts set`.
//   - Persists NAME/FEATURE to .git/extract-reconcile so the other scripts pick
//     them up automatically (inside .git/, unaffected by branch checkouts).
//   - Refuses to clobber existing branches; pass --force to recreate.
//   - Leaves HEAD on the -reconcile branch (where exploration happens).

import {
  branchExists,
  git,
  gitOK,
  parseArgs,
  requireClean,
  requireGit,
  writeConfig,
  xrDie,
  xrInfo,
  xrStatus,
} from "./lib.ts";

function main(): void {
  requireGit();
  requireClean();

  const { flags } = parseArgs(process.argv.slice(2));
  const name = typeof flags.name === "string" ? flags.name : "";
  const feature = typeof flags.feature === "string" ? flags.feature : "";
  const base = typeof flags.base === "string" ? flags.base : "HEAD";
  const force = flags.force === true;

  if (!name) xrDie("--name is required");
  if (!feature) xrDie("--feature is required");

  const merge = `${name}/${feature}-merge`;
  const proto = `${name}/${feature}-proto`;
  const reconcile = `${name}/${feature}-reconcile`;

  // Resolve base to a concrete sha so all three branches start identical
  // even if HEAD moves during script execution.
  const baseSha = gitOK(["rev-parse", base]);
  xrInfo(`base commit: ${baseSha}`);

  for (const b of [merge, proto, reconcile]) {
    if (branchExists(b)) {
      if (!force) xrDie(`branch '${b}' already exists (use --force to recreate)`);
      const r = git(["branch", "-D", b]);
      if (r.status !== 0) xrDie(`failed to delete ${b}: ${r.stderr.trim()}`);
      xrInfo(`deleted existing branch ${b}`);
    }
  }

  for (const b of [merge, proto, reconcile]) {
    const r = git(["branch", b, baseSha]);
    if (r.status !== 0) xrDie(`failed to create ${b}: ${r.stderr.trim()}`);
    xrInfo(`created ${b}`);
  }

  writeConfig(name, feature);

  // Check out reconcile — that is where exploration / iteration happens.
  const co = git(["checkout", reconcile]);
  if (co.status !== 0) xrDie(`failed to checkout ${reconcile}: ${co.stderr.trim()}`);

  xrStatus(`init ok name=${name} feature=${feature} base=${baseSha}`);
  xrStatus(`branch merge=${merge}`);
  xrStatus(`branch proto=${proto}`);
  xrStatus(`branch reconcile=${reconcile}`);
  xrStatus(`checked-out ${reconcile}`);
}

main();
