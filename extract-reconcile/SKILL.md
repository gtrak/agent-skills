---
name: extract-reconcile
description: Incrementally extract stable code units from exploratory work. Use when the user wants to carve a stable unit out of a messy WIP branch, promote a coherent piece to a clean branch, run an extract/reconcile loop, manage PROTO/MERGE/RECONCILE branches, or avoid post-hoc commit reconstruction. Triggers on "extract stable unit", "promote to merge", "reconcile proto onto merge", "incremental extraction", "carve out stable code", "extract-reconcile workflow".
license: MIT
compatibility: opencode
---

# Extract–Reconcile Workflow

Carve coherent stable units out of an exploratory branch one at a time, keeping
the messy exploration intact and a clean canonical branch always buildable.

## When to Use

Use when:

- A feature branch is full of exploration (dead ends, half-finished refactors,
  mixed concerns) and the user wants to ship pieces of it cleanly without
  rewriting history.
- The user wants a "stable truth" branch that grows only by accumulating
  extracted units.
- The user wants to avoid batch diff triage / post-hoc commit reconstruction.
- The user invokes the workflow ("run an extract-reconcile cycle", "promote
  this to merge", etc.).

Do NOT use when:

- The user just wants `git rebase -i` / `git commit --fixup` cleanup.
- The branch is already clean and only needs splitting into commits.
- The user wants to merge two long-lived feature branches (different problem).

## Concepts

Four branches, `{NAME}/{FEATURE}-{merge,proto,reconcile,candidate}`:

- **`-merge`** — canonical stable truth. Always buildable. Only promoted units
  land here; its history is a clean accumulation of stable commits.
- **`-proto`** — append-only exploration journal. Never rewritten; each iterate
  cycle appends one snapshot of the current reconcile tree (forensic recovery:
  "what did exploration look like at hour N?"). Never checked out by the scripts.
- **`-reconcile`** — disposable working state. Rebased onto each new `-merge`, so
  its diff against merge is always exactly the leftover not-yet-extracted work.
- **`-candidate`** — constantly-reset scratch branch. Lazily created; always sits
  directly on `-merge` holding one commit: the unit you are about to land. You
  build-verify it (in an isolated worktree) and review it as a diff, then promote
  by fast-forwarding `-merge` to it — what you verified is byte-for-byte what
  lands (no patch re-application). Never checked out by the scripts; it exists as
  a review surface (Hunk diff) and promote source.

```
                      ┌──────────────┐
                      │   -proto     │  append-only journal
                      │  (additive)  │
                      └──────┬───────┘
                             │  squash
                             ▼
   ┌──────────┐         ┌──────────────┐
   │  -merge  │◄────────┤  -reconcile  │   one commit on top of merge
   │ (stable) │ extract │  (working)   │   = current candidate diff
   └────┬─────┘         └──────┬───────┘
        │                      │
        │       rebase         │
        └──────────────────────┘
                             │  iterate (after more exploration)
                             ▼
                      ┌──────────────┐
                      │   -proto     │  ← new snapshot appended
                      └──────────────┘
```

No operation does a 3-way merge. Squash and rebase both re-pin a captured tree
onto a different parent, so there are no merge conflicts.

## Subagent Usage

| Subagent  | Use for                                                                | Why                                                |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `explore` | Survey `merge..reconcile` to propose candidate extraction units        | Read-only forensic pass over a possibly large diff |
| `general` | Identify a coherent unit when the diff is non-obvious; **validate** after each extract | Real judgment + independent fresh-eyes review      |

The supervisor (you) runs scripts and applies patches directly. Do not delegate
to a worker just to invoke `git` — delegation is for cognition: choosing what to
extract and validating the result.

## Prerequisites

- Inside a git work tree, on the branch representing the current exploration.
- Working tree is clean (commit/stash pending edits first).
- `bun` is on `PATH` (the scripts are TypeScript run via Bun).
- The user can articulate at least one stable unit to extract first — the skill
  cannot bootstrap from "I don't know what's stable yet" (Failure Mode 3).

## Installation

The scripts must live at `~/.config/opencode/skills/extract-reconcile/scripts`.
From the repo root, run the bundled installer to symlink every skill dir into
`~/.config/opencode/skills`:

```bash
bun install.ts            # symlink skills into ~/.config/opencode/skills
bun install.ts --dry-run  # show what would change, write nothing
bun install.ts --force    # replace an existing real dir (not a symlink)
```

## Bundled Scripts

All scripts live in `scripts/` next to this `SKILL.md` and run with Bun
(`lib.ts` is a shared module, not a command):

```bash
SCRIPTS=~/.config/opencode/skills/extract-reconcile/scripts
bun $SCRIPTS/init.ts      --name <ns> --feature <feat> [--base <ref>] [--force]
bun $SCRIPTS/squash.ts    [--message "..."]
bun $SCRIPTS/candidate.ts set     --patch <path> --message "..."
bun $SCRIPTS/candidate.ts review
bun $SCRIPTS/candidate.ts promote
bun $SCRIPTS/candidate.ts reset
bun $SCRIPTS/rebase.ts    [--message "..."]
bun $SCRIPTS/iterate.ts   [--message "..."]
bun $SCRIPTS/status.ts
```

`init` writes `NAME`/`FEATURE` to `.git/extract-reconcile` (inside `.git/`, so
branch checkouts never disturb it); every other script reads it automatically.

Every script prints machine-readable `XR:` status lines to stdout and human
prose to stderr. After running one, parse the `XR:` lines to confirm its effect.

## Process Overview

```
Phase 0: INIT          Phase 1: EXPLORE         Phase 2: SQUASH
┌─────────────────┐    ┌─────────────────┐      ┌─────────────────┐
│ Create the      │    │ Work freely on  │      │ Collapse proto  │
│ -merge/-proto/  │ -> │ -proto.         │ ->   │ into one commit │
│ -reconcile trio │    │ Commit often.   │      │ on -reconcile   │
└─────────────────┘    └─────────────────┘      └─────────────────┘

Phase 3: IDENTIFY      Phase 4: PROMOTE         Phase 5: VERIFY
┌─────────────────┐    ┌─────────────────┐      ┌─────────────────┐
│ Pick ONE unit;  │    │ candidate.ts    │      │ Build already   │
│ candidate.ts    │ -> │ promote: FF     │ ->   │ done in B2.5;   │
│ set + build-    │    │ -merge to the   │      │ confirm -merge  │
│ verify + review │    │ verified cand.  │      │ once (cheap)    │
└─────────────────┘    └─────────────────┘      └─────────────────┘

Phase 6: REBASE        Phase 7: VALIDATE        Phase 8: ITERATE
┌─────────────────┐    ┌─────────────────┐      ┌─────────────────┐
│ Re-pin          │    │ general agent   │      │ Continue        │
│ -reconcile onto │ -> │ reviews merge + │ ->   │ exploration on  │
│ new -merge      │    │ leftover        │      │ -reconcile, run │
│                 │    │                 │      │ iterate.ts      │
└─────────────────┘    └─────────────────┘      └─────────────────┘
                                                        │
                                                        └──> back to Phase 2
```

> Out-of-band: **Phase R** handles the exceptional case where a commit already
> landed on `-merge` (and built upon, or pushed) turns out to be wrong. It is not
> part of the loop above.

## Phase 0: Init

One-time setup for a new feature:

```bash
SCRIPTS=~/.config/opencode/skills/extract-reconcile/scripts
bun $SCRIPTS/init.ts --name $USER --feature my-feature --base main
```

This creates `$USER/my-feature-{merge,proto,reconcile}` from `main`, writes
`.git/extract-reconcile`, and checks out reconcile.

If exploration already exists on another branch, run `init` from its tip
(`--base <branch>`) and `git merge --ff-only <branch>` into `-proto` so proto
starts with the existing work.

## Phase 1: Explore

Work freely on `-proto`, committing as messily as you want — proto is never
rewritten:

```bash
git checkout {NAME}/{FEATURE}-proto
# ... edit, commit, edit, commit ...
```

On the very first cycle the user has often worked on a different branch and never
used `-proto`. That is fine: fast-forward proto to that branch, or work directly
on `-reconcile` and skip Phase 2 on the first cycle (squash is a no-op when proto
equals merge).

## Phase 2: Squash

Collapse proto's history into one clean commit on top of merge, on `-reconcile`:

```bash
bun $SCRIPTS/squash.ts
```

Afterward `merge..reconcile` is a single commit whose diff equals the full
proto-vs-merge diff — the candidate extraction surface.

If the diff is huge, an `explore` pass can map candidate units first:

```text
task subagent_type=explore description="Survey reconcile diff for extraction units" prompt="
The current reconcile branch is {NAME}/{FEATURE}-reconcile, sitting on top of
{NAME}/{FEATURE}-merge with one squash commit.

Run: git diff --stat {NAME}/{FEATURE}-merge..{NAME}/{FEATURE}-reconcile

Read the diff and propose 3-7 candidate extraction units. For each:
- A 1-line description of the stable unit
- Files / hunks involved (rough boundaries)
- Why it is coherent on its own
- Risk: low / medium / high
- Suggested order (which units block which?)

Do NOT modify anything. Output a numbered list."
```

## Phase 3: Identify a Stable Unit

Pick ONE coherent unit per cycle. "Stable" means:

- Self-contained: extractable without dragging in unrelated changes.
- Buildable in isolation: applied to merge, merge still compiles and tests pass.
- Reasoned about: describable in one sentence ("add the X validator", "extract
  the Y trait", "rename Z everywhere").

Three ways to identify, in increasing order of effort.

### Option A: Obvious — supervisor decides directly

For a small, clearly-bounded unit, generate the patch yourself and drive it
through the candidate flow (set → build-verify B2.5 → promote, skipping review):

```bash
git diff {NAME}/{FEATURE}-merge..{NAME}/{FEATURE}-reconcile -- path/to/unit/* \
  > /tmp/candidate.patch
bun $SCRIPTS/candidate.ts set --patch /tmp/candidate.patch --message "<unit>"
# build-verify the candidate in an isolated worktree (B2.5), then:
bun $SCRIPTS/candidate.ts promote
```

### Option B: Use `hunk-review` (recommended for non-obvious units)

Two distinct review goals use Hunk differently:

- **SURVEY** the whole leftover to *find* boundaries → load `merge...reconcile`.
- **REVIEW THE CANDIDATE** to *approve exactly what will land* → load a diff
  containing ONLY the chosen subset.

> CRITICAL: once you have chosen the subset, the user reviews the **candidate
> diff**, never the full `merge..reconcile` leftover with "in scope / out of
> scope" annotations. The screen must equal the patch. Making the user mentally
> filter "which of these 15 files are in scope" is the wrong workflow.

#### B1. Survey (optional — only when boundaries are non-obvious)

```bash
hunk session reload --repo . -- diff {NAME}/{FEATURE}-merge...{NAME}/{FEATURE}-reconcile
hunk session review --repo . --json    # file/hunk structure, small context
```

Use this to *decide* the unit; do not ask for line-level approval here.

#### B2. Build the candidate

Assemble a patch for exactly the chosen subset and hand it to `candidate.ts set`.
The `-candidate` branch always sits on `-merge` and holds one commit: the unit.

```bash
# 1. Assemble the patch OUTSIDE the work tree so it never litters the repo.
#    Whole-file units:
git diff {NAME}/{FEATURE}-merge..{NAME}/{FEATURE}-reconcile -- path/to/unit/* \
  > /tmp/candidate.patch
#    …or hand-assemble partial-file hunks.

# 2. Build the candidate via pure plumbing (read-tree into a temp index,
#    git apply --cached, write-tree, commit-tree, update-ref). HEAD and the
#    working tree are NOT touched. Lazily creates the branch on first use.
bun $SCRIPTS/candidate.ts set --patch /tmp/candidate.patch \
  --message "<unit description>"
```

`set` verifies the patch applies to the `-merge` tip and aborts cleanly if not.
After it runs, `-candidate` points at the new commit but HEAD is unchanged.

The candidate is **always patch-derived, never hand-edited** — see Key Principle
7. Verify it next (B2.5).

#### B2.5. Build-close the candidate BEFORE review (mandatory)

A candidate is only worth reviewing if it compiles and tests pass on top of
`-merge`. Verify in an isolated worktree (HEAD/working tree untouched):

```bash
WT=/tmp/xr-{NAME}-{FEATURE}-candidate    # any throwaway path
git worktree add "$WT" {NAME}/{FEATURE}-candidate
( cd "$WT" && <project build + test, e.g. cargo test -p <crate>> )
git worktree remove "$WT"
```

A subset that builds in `-reconcile` (where the whole feature is present) often
FAILS on the candidate because it references symbols, fields, or config that only
exist elsewhere in the leftover. This is the most common cycle-2+ surprise. When
the build fails:

1. **Diagnose the missing dependency.** Read the compiler error — almost always a
   newly-required struct field breaking an existing literal, a `use`/import of an
   unmerged module, or a trait impl referencing unmerged types.

2. **Close it with the SMALLEST addition from the leftover that builds.** Prefer
   pulling the *real* wiring from `-reconcile` over inventing a placeholder
   (`None`/`todo!()`) — a placeholder becomes a later-cycle edit-to-merged-code
   and hides the true unit boundary. Regenerate the patch and re-run `set`.

3. **Re-verify.** Repeat until green. Each addition widens the unit — correct:
   the true unit is "the smallest set of leftover changes that builds and tests
   on `-merge`," often larger than the one file you started from.

4. **STOP and ask when closure is too big.** If building the candidate would pull
   in substantial logic (a whole method, a new module, dispatch code, more than a
   handful of trivial wiring lines), do NOT silently absorb it. Report the failing
   symbol, what closing it would drag in, and the options (widen this cycle vs.
   reorder cycles so the dependency lands first vs. split differently). That
   judgment call belongs to the user.

Heuristic for "small enough to absorb without asking": pure config/struct-field
wiring, defaulted fields, one-line propagations, and their directly-attached
tests. Anything with real branching logic, new control flow, or a dependency on
an unmerged module is "too big — ask."

You may delegate the build-close to a worker, but the worker edits
**`-reconcile`**, never `-candidate` (Key Principle 7). The supervisor then
regenerates the patch and re-runs `set`. Tell the worker: edit on `-reconcile`,
do NOT touch `-candidate`, fix only minimal wiring, and **report exactly what
extra it pulled in beyond the originally-chosen files** — that report is the true
unit boundary and flags when closure exceeded the heuristic.

#### B2.6. Show the green candidate in Hunk

Only once green, load the candidate:

```bash
bun $SCRIPTS/candidate.ts review   # prints the exact reload command
hunk session reload --repo . -- diff {NAME}/{FEATURE}-merge...{NAME}/{FEATURE}-candidate
```

`hunk session review --repo . --json` now shows exactly the files/hunks that will
land — a surface that equals what gets promoted. (Reloading a branch-diff also
restores `--repo .` session selection, so subsequent `comment`/`navigate` calls
work normally.)

#### B3. Iterate, then promote

- Rework requested: refactor on `-reconcile`, regenerate the patch, re-run
  `candidate.ts set` (it hard-resets and rebuilds the candidate), re-verify, and
  `candidate.ts review` again. Repeat until approved. (`candidate.ts reset`
  discards a candidate without rebuilding.)
- Approved: **promote** — fast-forward `-merge` to the verified `-candidate` (no
  patch re-application; what you built is exactly what lands):

  ```bash
  bun $SCRIPTS/candidate.ts promote   # FF merge -> candidate, leaves HEAD on merge
  bun $SCRIPTS/rebase.ts              # drop extracted hunks from reconcile
  bun $SCRIPTS/iterate.ts             # snapshot leftover to proto
  ```

`-candidate` is reusable across cycles: each `set` hard-resets it to the new
`-merge`. Promote is the only landing step — no separate extract, no
throwaway-branch bookkeeping.

If no Hunk session exists, ask the user to launch one, or fall back to Option A
or C. (For an obvious unit, skip B2.6: `set` → verify → `promote`.)

### Option C: Delegate to `general` for ambiguous diffs

When the diff is large and boundaries are unclear, hand the judgment to `general`:

```text
task subagent_type=general description="Identify next extraction unit" prompt="
**Branches**: {NAME}/{FEATURE}-{merge,proto,reconcile}

**Diff to analyse**:
  git diff {NAME}/{FEATURE}-merge..{NAME}/{FEATURE}-reconcile

**Your task**:
Pick ONE coherent stable unit to extract first. The unit must:
1. Be self-contained (no dangling references after extraction).
2. Leave merge buildable when applied alone.
3. Be describable in one sentence.

**Output**:
- Unit description (one sentence)
- Exact paths / hunks to include (file globs preferred for the patch)
- Why this is the best first extraction (vs alternatives)
- What the leftover diff will look like after this extraction
- Suggested next 1-2 candidates after this one

DO NOT modify anything. DO NOT extract. Just identify."
```

The supervisor then generates the patch from the agent's specification.

## Phase 4: Promote

The candidate was already built (`set`), verified (B2.5), and approved (B2.6).
Promotion just fast-forwards `-merge` to the verified candidate — no patch is
re-applied, so what you verified is byte-for-byte what lands:

```bash
bun $SCRIPTS/candidate.ts promote
```

The script: (1) checks `-candidate` is a fast-forward of `-merge` (its parent IS
merge); (2) fast-forwards `-merge` to `-candidate`; (3) leaves HEAD untouched
(ref update only). It refuses without modifying anything if `-candidate` is not a
clean fast-forward — which only happens if you forgot to `set` against the current
merge tip. Re-run `set` and retry.

## Phase 5: Verify Build (already done — confirm only)

Build verification happens in B2.5, *before* review — the whole point of the
candidate branch. By promote time, `-merge`'s tree is identical to the candidate
you already built and tested, so there is nothing new to compile.

Phase 5 is a final cheap-insurance build of `-merge`'s tip in an isolated
worktree. Since promote is byte-identical, it cannot fail in practice — if it
does, you skipped or mis-ran B2.5:

```bash
WT=/tmp/xr-{NAME}-{FEATURE}-merge
git worktree add "$WT" {NAME}/{FEATURE}-merge
( cd "$WT" && <project build + test, e.g. cargo test -p <crate>> )
git worktree remove "$WT"
```

If it fails, undo and redo the cycle (you must check out `-merge` first; this
command deliberately mutates HEAD/worktree):

```bash
git reset --hard HEAD^   # on -merge, only if confirmation fails
```

## Phase 6: Rebase Reconcile onto New Merge

```bash
bun $SCRIPTS/rebase.ts
```

This re-pins `-reconcile`'s tree on the new `-merge`. The extracted hunks drop
out; only the leftover remains. If the leftover is empty (extraction consumed the
entire delta), the script reports `rebase empty` and reconcile sits at merge —
exploration is fully integrated.

## Phase 7: Validate (delegate to `general`)

The **mandatory delegation point**. After every extract+rebase, hand the result
to a fresh `general` for independent review:

```text
task subagent_type=general description="Validate {FEATURE} extraction cycle N" prompt="
**Branches**: {NAME}/{FEATURE}-{merge,proto,reconcile}

**What just happened**:
- Identified unit: <unit description>
- Extracted patch: <patch path or summary>
- Build verification on -merge: <pass/fail with command and output>

**Your task — answer all four**:

1. Is `-merge` coherent?
   - Read the new commit on -merge. Does it stand alone? Any dangling
     references, half-extracted helpers, or imports of code that did not come
     along?
   - Run the project's build/test command on -merge and report the result.

2. Is the unit complete?
   - Read the squashed reconcile diff before extraction (git show on the prior
     reconcile tip, recorded in the XR: status line from squash) and compare to
     what landed on merge. Did anything that obviously belongs to this unit get
     left behind on -reconcile?

3. Is the leftover diff (`merge..reconcile`) consistent?
   - Should it still build conceptually (no obvious half-states like 'calls a
     function that no longer exists')?
   - Is it smaller than before? By how much?

4. What is the next stable unit?
   - Based on the new leftover, propose the next 1-2 extraction candidates.

**Output format**:

## Merge Coherence: PASS / FAIL
[evidence]

## Unit Completeness: PASS / FAIL
[evidence]

## Leftover Consistency: PASS / FAIL
[evidence and rough size]

## Next Candidates
1. ...
2. ...

DO NOT modify any branch. Read-only validation."
```

If validation fails on (1) or (2), undo the cycle:

```bash
git checkout {NAME}/{FEATURE}-merge && git reset --hard HEAD^
bun $SCRIPTS/squash.ts   # rebuild reconcile from proto
```

(3) failures are not necessarily blocking — a "wobbly" leftover is normal
mid-refactor; note it for the next cycle.

## Phase 8: Iterate

Continue exploration on `-reconcile`. When you have meaningful new exploration to
record, snapshot it onto `-proto`:

```bash
bun $SCRIPTS/iterate.ts
```

This appends one commit to `-proto` whose tree equals the current reconcile tip.
Proto stays append-only. Then loop back to Phase 2 for the next cycle.

## Phase R: Rework an Already-Landed Merge Commit

Normally `-merge` only grows: any problem with a landed commit is handled by
undo-and-redo (reset the commit, re-squash, re-extract). That assumes you catch
the problem **immediately**, while the bad commit is still the tip with nothing
built on top.

Phase R covers the different case where a commit **already landed and built upon**
(possibly pushed) needs a fix — most often a *review you thought was finished was
wrong*. You cannot `reset --hard HEAD^` (good commits are stacked above), so you
surgically fold the fix **into** the existing commit and resync the trio.

> Exceptional, out-of-band, and rewrites published history. Only for a *landed*
> commit; for a still-tip commit prefer undo-and-redo (Phase 5 / Failure Mode 2/6).

### R0. Decide: rework vs. forward-fix

- If the fix is itself a new coherent unit ("also handle case Y"), do NOT rework
  — extract it as a normal *new* cycle on top. Forward-fixes keep history
  append-only and are always preferred.
- Rework is for when the landed commit is *itself wrong* and the right history is
  "this commit should always have looked like this" — a botched review pass, a
  wrong design baked in, an intrinsic behavior bug.
- The user owns this call: rework rewrites SHAs of every commit above the target;
  surface that cost.

### R1. Re-review the landed commit in place (no history change yet)

Load *only the target commit's diff* (its content against its own parent):

```bash
hunk session reload --repo . -- diff <commit>^..<commit>
hunk session comment list --repo . --type user   # collect findings
```

Drive it like any candidate review (`hunk-review` skill). "Re-accept as-is" →
stop. Otherwise each change request becomes a scoped edit.

### R2. Snapshot SHAs and take backup tags (mandatory)

```bash
for b in merge proto reconcile candidate; do
  git tag -f backup/<label>-$b {NAME}/{FEATURE}-$b
done
```

Record current SHAs in your notes; if anything goes wrong, hard-reset each branch
to its `backup/<label>-*` tag.

### R3. Produce the corrected diff in the working tree

Check out `-merge` (or its tip), make the review-requested edits, and **verify**
with build/test. Delegate the edits to a worker and validation to a fresh
`general`, but keep the worker scoped to specific files and decompose
aggressively — large multi-directive reworks time out workers, so deliver them as
small serial tasks (one directive/file at a time), each independently verified.

> Worker gotcha: workers get confused by a working tree with unrelated
> uncommitted edits and may try to stash/checkout/reset to "clean up". Tell them
> explicitly to **work over what is present and never touch stashes or run
> reset/checkout/restore**. Give them the cargo/test workspace root if it differs
> from the repo root — a wrong `cwd` is the most common cause of an empty-diff
> no-op.

Snapshot the corrected diff **per file**, partitioned by which landed commit each
file belongs to (a single review pass can span more than one landed commit — e.g.
a type change plus its propagation into a later commit):

```bash
git diff -- path/in/commitA > /tmp/rework/A.patch
git diff -- path/in/commitB > /tmp/rework/B.patch
git stash push -m rework-temp -- <the reworked files>   # park it; clean tree
```

### R4. Fold each patch into its target commit (partitioned rebase)

Rebase the stack onto the target's parent, stopping to `edit` at each commit that
needs a piece. No new commits are added — the fix becomes part of history as
though it had always been there:

```bash
GIT_SEQUENCE_EDITOR="sed -i -e 's/^pick <commitA>/edit <commitA>/' \
                           -e 's/^pick <commitB>/edit <commitB>/'" \
  git rebase -i <commitA>^
# at each stop:
git apply /tmp/rework/<that-commit>.patch
git add -A && git commit --amend --no-edit
git rebase --continue
```

A clean continue (no conflict) for an intervening commit that does not touch the
reworked files is expected.

### R5. Verify the rewritten stack — tip AND each touched commit in isolation

The invariant is that **every** commit on `-merge` builds standalone, so fixing
only the tip is not enough:

```bash
git checkout {NAME}/{FEATURE}-merge && <build/test>   # tip
git checkout <rewritten-commitA> && <build/test>      # each rewritten commit
```

A transient `dead_code` warning on an intermediate commit is usually fine; a hard
error means the partition was wrong — fix which commit gets which hunk and redo
R4.

### R6. Force-push (if published)

```bash
git push --force-with-lease origin {NAME}/{FEATURE}-merge
```

Always `--force-with-lease`, never `--force`: it aborts if the remote moved,
protecting a reviewer's concurrent push. Tell reviewers the branch was
force-updated so they re-point / re-pull.

### R7. Resync the trio onto the rewritten merge

`-merge` was rewritten; `-proto`/`-reconcile`/`-candidate` still point at old
SHAs. Resync each per its nature. Reworked files are usually byte-identical across
branches once resynced, so these are conflict-free.

- **`-proto` (append-only): append, never rewrite.** Proto's copy of the reworked
  files is usually still the *old* content (its exploration rarely re-touches base
  files a review targets), so apply the rework patches on top of proto and commit
  as one new `iterate:`-style snapshot — recording "then we reworked cycle-1" as
  an event:

  ```bash
  git checkout {NAME}/{FEATURE}-proto
  git apply /tmp/rework/*.patch   # dry-run with --check first
  <build/test>
  git add -A && git commit -m "iterate: <rework description>"
  ```

- **`-reconcile` (disposable): rebase the squash commit onto the new `-merge`.**
  Reconcile inherits its base files from merge, so the reworked versions flow in
  automatically; confirm the reworked files byte-match the new merge, then
  build/test:

  ```bash
  git checkout {NAME}/{FEATURE}-reconcile
  git rebase --onto <new-merge-tip> <old-merge-tip> {NAME}/{FEATURE}-reconcile
  ```

  If reconcile *had* diverged on those files, re-derive it from proto
  (`squash.ts`) rather than hand-resolving (Key Principle 3).

- **`-candidate` (scratch): rebase or just re-`set`.** Any in-flight candidate on
  the old merge must be rebased onto the new merge (`--onto <new> <old>`) before
  promoting — or discarded and rebuilt with `candidate.ts set` next cycle.

### R8. Validate the whole resync (delegate to `general`)

Confirm each branch builds, the reworked files are consistent across
merge/proto/reconcile, and the `merge..reconcile` leftover is *unchanged in size*
(rework must not disturb not-yet-landed work). A behavior change discovered during
rework (e.g. the fix is actually a latent-bug fix) must be explicitly called out
and confirmed safe, not assumed.

## Failure Modes

| #  | Symptom                                                                  | Cause                                              | Mitigation                                                                                                  |
| -- | ------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1  | Patch is huge and hard to bound                                          | Trying to extract too much at once                 | Split into 2-3 smaller units; delegate to `general` for boundary suggestions                                |
| 2  | Build fails on `-merge` after extract                                    | Unit not self-contained; candidate not build-closed first | Should be caught by B2.5 (build the candidate on `-merge` BEFORE review). If it slips: `git reset --hard HEAD^` on merge; re-run squash; build-close the candidate (pull minimal wiring or ask), then re-extract |
| 3  | "No extractable units" / pure exploration only                           | Stagnation                                         | Force identification of at least ONE invariant per cycle (typed wrapper, renamed function, moved file)      |
| 4  | Patch fails to apply on merge                                            | Reconcile drifted from merge (rare)                | Re-run squash to rebuild reconcile from proto, then re-extract                                              |
| 5  | After rebase, reconcile diff still includes "extracted" hunks            | Extraction patch did not match what was identified | Re-run squash; rebase re-derives reconcile from the captured tree, so this self-heals                       |
| 6  | `general` validation flags merge as incoherent                           | Half-extracted unit                                | Undo merge commit; redo extraction with the missing hunks                                                   |
| 7  | Rebase reports `rebase empty`                                            | Last extraction consumed the entire reconcile      | Not a failure — start a new exploration cycle on reconcile                                                  |
| 8  | Working tree dirty, scripts refuse to run                                | Uncommitted edits                                  | Commit on the current branch (probably reconcile) or stash; never run with dirty state                     |
| 9  | Hunk session has no live diff to review                                  | Session not running, or wrong repo                 | Have the user launch Hunk; use `hunk session list` to find live sessions                                    |
| 10 | `.git/extract-reconcile` config missing after a `git clone`              | Config lives in `.git/`, not transferred           | Re-run `init.ts --force` with the same `--name`/`--feature`; it rewrites the config without losing branches |
| 11 | Two extractions touch the same file region                               | Cycles too coarse                                  | Validate after each extract; keep cycles small so consecutive extractions rarely conflict                   |
| 12 | A commit **already landed and built upon** needs a fix                   | Review was wrong after the fact / latent bug       | Do NOT undo (good commits stacked above). Use Phase R                                                       |
| 13 | Candidate desyncs from its patch / a regression sneaks into the landed unit | `-candidate` was edited directly, or a raw leftover patch reverted earlier-landed cleanup | Candidate is patch-derived ONLY: make content changes on `-reconcile` (or the out-of-tree patch), then re-run `candidate.ts set`. For a *contaminated* leftover (mixes the unit with reversions of landed cleanup), clean it on `-reconcile` first or hand-assemble an additive-only patch. See Key Principle 7 |
| 14 | `candidate.ts` aborts with "refusing to run while HEAD is on …"          | HEAD is on the branch the script updates via update-ref | Switch to `-reconcile` (or any other branch) and re-run. See Key Principle 8                                |

## Key Principles

### 1. Proto is append-only

A journal, not a working branch. The only mutation is the `iterate.ts` snapshot.
Forensic recovery relies on this — never `reset --hard` proto.

### 2. Merge must always be buildable

Every commit on `-merge` is a candidate "real" commit; verification is not
optional. If you think "I'll fix the build in the next extraction", stop and undo.
This also governs **rework** (Phase R): every rewritten commit, not just the tip,
must build standalone.

### 3. Reconcile is disposable

If reconcile gets confused, re-run `squash.ts`: it re-derives reconcile from proto
+ merge in one shot. Re-derivation *is* the repair workflow.

### 4. One unit per cycle

Two units in one extract = two cycles' validation rolled into one, which destroys
the ability to localize a build failure or incoherence.

### 5. Supervisor runs mechanics, agents make judgment

Do not delegate `bun $SCRIPTS/...` to a worker. Do delegate "is this unit
coherent?" and "is the post-extract merge buildable and self-contained?" to
`general`. That split keeps cycle latency low.

### 6. `hunk-review` is the right tool for boundary selection

Route a non-trivial identification step through Hunk rather than guessing. The
user reviews the **candidate diff** (only what will be extracted), never the full
`merge..reconcile` leftover with in/out annotations — see Phase 3 Option B.

### 7. The candidate is patch-derived; edits live on reconcile

`-candidate` has exactly one origin: `candidate.ts set --patch`. It is never
hand-edited and never the target of a worker's edits. The patch — generated from
`-reconcile` (whole-file `git diff` or a hand-assembled partial-file patch) — is
the source of truth, and applying it to the current `-merge` tip must reproduce
`-candidate` exactly. This guarantees the Hunk review surface (B2.6) equals what
`promote` lands.

Consequence: any change to candidate content — cleanup, build-close wiring, or
fixing a *contaminated* leftover — is made on `-reconcile` (or the out-of-tree
patch), then the candidate is rebuilt with `set`. A leftover patch is
*contaminated* when it would, besides adding the unit, revert cleanup already
landed on `-merge` (restoring stripped doc banners, swapping a constant back to a
literal, re-adding flow-narration comments). Never apply such a patch raw — clean
it on `-reconcile` or hand-assemble an additive-only patch first (Failure Mode 13).

### 8. Candidate and merge are never checked out

`candidate.ts` mutates the `-candidate` and `-merge` refs with pure plumbing
(`commit-tree`, `update-ref`, `write-tree` against a temp index). It never runs
`git checkout/merge/reset --hard`; your HEAD and working tree are untouched.
`-reconcile` is the working branch you edit and check out; `-candidate` and
`-proto` are review/journal artifacts queried (Hunk diff, log, worktree
extraction) but never inhabited. Build-verify candidates in an isolated `git
worktree add` (B2.5). If the script detects HEAD on the branch it is about to
update, it refuses with a hard error pointing back to `-reconcile`.

## Success Criteria

You are running the skill well when:

- `-merge` history reads as a clean accumulation of stable commits, each with a
  coherent message and a passing build.
- `merge..reconcile` shrinks (or stays bounded) over time.
- `-proto` is never rewritten; its log shows base + N iterate snapshots.
- Each cycle is small enough that `general` validation finds no multiple unrelated
  issues.
- The user never manually reconstructs commit structure or does a "big cleanup".

## Anti-Patterns

- **"Just one more thing in this extract."** No. Two units = two cycles. The skill
  is cheap per cycle precisely because each cycle is small.
- **"I'll skip validation this once."** You will not. One skipped validation
  poisons later debugging — you no longer know which extract broke things.
- **Rewriting proto.** Never. If proto is wrong, the whole journal is wrong. To
  abandon work, start a new feature with a fresh `init`.
- **Merging reconcile into main.** Never. Reconcile is a working state; only
  `-merge` is shippable. Open the PR from `-merge`.
- **Letting reconcile rot without iterating.** `iterate.ts` records exploration
  into proto. Many extract cycles without iterating lets proto fall behind and
  loses the journal property. Iterate at least once per session.

## Example Session

```bash
# Day 0: bootstrap
SCRIPTS=~/.config/opencode/skills/extract-reconcile/scripts
bun $SCRIPTS/init.ts --name alice --feature payments --base main
git checkout alice/payments-proto
git merge --ff-only alice/payments-wip   # bring existing exploration into proto

# Cycle 1
bun $SCRIPTS/squash.ts
# survey: hunk session reload --repo . -- diff alice/payments-merge...alice/payments-reconcile
# user + agent identify "add Money type" as the first unit
git diff alice/payments-merge..alice/payments-reconcile -- src/money.rs > /tmp/candidate.patch
bun $SCRIPTS/candidate.ts set --patch /tmp/candidate.patch --message "Money newtype"
git worktree add /tmp/xr-cand alice/payments-candidate && \
  ( cd /tmp/xr-cand && cargo test ) && git worktree remove /tmp/xr-cand   # B2.5
bun $SCRIPTS/candidate.ts review          # prints the Hunk reload cmd; user reviews
# ... user approves ...
bun $SCRIPTS/candidate.ts promote         # fast-forward merge to the verified candidate
bun $SCRIPTS/rebase.ts
# delegate validation to general agent...
bun $SCRIPTS/iterate.ts                   # if more exploration was added on reconcile
bun $SCRIPTS/status.ts

# Cycle 2: repeat from squash...
```

## See Also

- `hunk-review` skill — interactive diff selection for the identify step.
- `spec-reconciliation` skill — reconciling spec ↔ code drift after extractions.
- `refactor-consolidate` skill — cleanup passes inside `-reconcile` before
  squashing again.
