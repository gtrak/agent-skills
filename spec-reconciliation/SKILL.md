---
name: spec-reconciliation
description: Reconcile lat.md spec against implementation and tests, find contradictions, remove trash, and produce a verified truth table
license: MIT
compatibility: opencode
---

## When to Use

Use this skill when:
- The spec (lat.md) may not match the implementation
- Tests claim coverage but don't actually enforce invariants
- You need to audit a domain for alignment between spec, tests, and code
- You're preparing for a major refactor and need to know what's real
- Tests are half-assed (inverted assertions, documenting gaps, testing obvious truths)
- Dead code, spec fiction, or orphaned invariants have accumulated

## Prerequisites

- lat.md files exist and describe the domain
- Implementation code exists and compiles
- Tests exist (even if weak)
- Time and patience to review contradictions interactively

## Process Overview

```
Phase 1: EXCAVATE          Phase 2: RECONCILE         Phase 3: PLAN
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Explore agents read │   │ Explore agents read │   │ Grill user: which   │
│ implementation to   │   │ spec + tests, build │   │ contradictions to   │
│ find real behavior: │-> │ truth table:        │-> │ fix first? Update   │
│ - Invariants        │   │ spec vs code vs     │   │ spec or code?       │
│ - Dead code         │   │ tests               │   │                     │
│ - Error paths       │   │                     │   │                     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘

Phase 4: EXECUTE           Phase 5: REVIEW            Phase 6: REPORT
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Worker agents fix   │   │ General agents      │   │ Assemble final      │
│ contradictions, add │   │ validate truth      │   │ truth table, list   │
│ missing tests,      │-> │ table is now        │-> │ remaining gaps,     │
│ remove trash        │   │ all green           │   │ next priorities     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

## Subagent Usage

| Subagent | Use For | Why |
|----------|---------|-----|
| `explore` | Excavating implementation, reading spec/tests, building truth tables | Read-only forensic analysis — cannot modify files |
| `worker` | Implementing fixes (code changes, test additions, spec updates) | Constrained executor — single task scope |
| `general` | Reviewing outcomes, validating alignment catches workers' misses | Independent validation — fresh eyes on results |

## Phase 0: Establish Context

Determine the scope of reconciliation based on available context.

### Option A: Targeted (Recommended)

Focus on one lat.md section and its corresponding implementation:

```bash
# Find the spec section
lat section "foundation/core#Transaction Model"

# Find what references it
grep -r "Transaction Model" lat.md/ --include="*.md"
grep -r "foundation/core#Transaction Model" crates/ --include="*.rs"

# Find the implementation files
# (use lat.md [[wiki links]] and @lat: comments to trace)
```

### Option B: Domain Sweep

Reconcile an entire domain (e.g., all of `foundation/core`, all of `orchestration/execution`):

```bash
# List all sections in a domain
lat section "foundation/core"

# For each subsection, repeat Phases 1-6
```

### Option C: Post-Work Audit

After completing feature work, reconcile the areas you touched:

```bash
# What changed recently?
git diff --name-only HEAD~5

# Reconcile spec sections referenced by changed code
```

## Phase 1: Excavate Implementation

**Strategy**: Read the actual source code BEFORE looking at spec or tests. Implementation is ground truth.

**Delegate to explore subagents** (2-3 parallel tasks per domain):

```
task subagent_type=explore description="Excavate [DOMAIN] implementation" prompt="
**DOMAIN**: [e.g., Transaction Model, Execution Orchestrator]

**IMPLEMENTATION FILES TO READ**:
- [list the .rs files that implement this domain]

**DO NOT READ SPEC OR TESTS YET — JUST THE IMPLEMENTATION**

**Your Task**:

Read every line of the implementation and report:

1. **What does the code actually do?**
   - Trace the happy path
   - Trace every error path (what errors are returned, when, to whom)
   - What state mutations occur?

2. **What invariants does the code enforce?**
   - `assert!`, `debug_assert!`, `unreachable!`
   - `expect`, `unwrap` with meaningful messages
   - Type system constraints (enums, newtypes, !Send/!Sync)
   - Match exhaustiveness
   - Return `Result` vs panic

3. **What invariants does the code NOT enforce?**
   - Where can invalid input slip through?
   - Where are errors silently swallowed?
   - Where can state be corrupted?
   - Race conditions, partial updates

4. **Dead code**
   - Unused methods, unreachable branches
   - Commented-out code older than 3 months
   - Error variants never constructed
   - Config options read but never used
   - Features implemented but never wired up

5. **lat.md link coverage**
    - Which functions have `// @lat:` comments pointing to spec sections?
    - Which spec sections are missing code references?
    - Which `[[wiki links]]` in spec point to nonexistent code locations?

6. **Actual API surface**
    - Public methods and their signatures
    - What can callers actually do?
    - What's internal-only but marked public?

**Output Format**:

## What The Code Actually Does
[2-3 paragraphs tracing the real behavior]

## Invariants Enforced
| Invariant | How Enforced | Location |
|-----------|-------------|----------|
| ... | type system / runtime assert / Result propagation | file:line |

## Invariants NOT Enforced
| Invariant | Spec Claims | Code Actually Does | Risk |
|-----------|-------------|-------------------|------|
| ... | ... | ... | high/medium/low |

## Dead Code
| Item | Location | Why Dead |
|------|----------|----------|
| ... | ... | ... |

## lat.md Link Coverage
| Spec Section | Has @lat: in Code? | Wiki Links Valid? |
|-------------|-------------------|--------------------|
| ... | yes/no | yes/no/broken |

## Missing Links (Code → Spec)
Functions that lack `// @lat:` comments:
- [file::function] — suggested spec section

## Missing Links (Spec → Code)
Spec sections lacking code references:
- [section-id] — suggested code locations

## Broken Wiki Links
`[[wiki links]]` pointing to nonexistent code:
- [section] — broken link target

## API Surface
| Method | Visibility | Behavior | Error Types |
|--------|-----------|----------|-------------|
| ... | ... | ... | ... |
"
```

**Multiple explore agents** can work in parallel on different aspects:
- One reads the core logic
- One reads error handling paths
- One reads the public API surface

## Phase 2: Reconcile

**Strategy**: Read spec and tests, build truth table. Compare against Phase 1 findings.

**Delegate to explore subagents** (1-2 parallel tasks):

```
task subagent_type=explore description="Reconcile [DOMAIN] spec+tests" prompt="
**DOMAIN**: [same domain as Phase 1]

**INPUTS**:
- Phase 1 findings (implementation truth) — provided below
- lat.md spec section: [section id]
- Test files: [list test files]

**PHASE 1 FINDINGS**:
[paste Phase 1 output here]

**Your Task**:

Read the lat.md spec section and ALL corresponding tests. For EVERY invariant in the spec, produce a truth table row.

**Truth Table Columns**:
| Invariant | Spec Claims | Code Actually Does | Tests Enforce? | Verdict |

**Verdicts**:
- **✅ Aligned** — spec, code, and tests all agree. Invariant is real and enforced.
- **❌ Contradiction** — at least two artifacts disagree
- **⚠️ Half-assed** — spec and code agree, but tests are weak/flaky/inverted
- **🗑️ Trash** — spec describes behavior that doesn't exist, tests test nothing, or code is dead
- **❓ Silent** — spec claims invariant, code may enforce it, but no tests exist
- **🔗 Unlinked** — invariant is real but missing `// @lat:` or `[[wiki link]]` references

**Rules** (apply ruthlessly):

Rule 1 — No 'documenting gaps' tests
If a test asserts the OPPOSITE of the invariant, it's ❌ not ⚠️.

Rule 2 — Compile-time claims need proof
If spec says 'closed enumeration' but only runtime tests exist, flag ⚠️.

Rule 3 — Positive tests are not negative tests
A test that constructs a valid instance and checks fields is POSITIVE. It does not prove rejection.

Rule 4 — Structural tests are not behavioral tests
Checking `field.is_none()` on a new struct does not prove the invariant during mutation/concurrency.

Rule 5 — Count assertions
If a plan claims N tests but fewer exist, or tests exist with wrong names/assertions, flag ❌.

Rule 6 — Implementation drives truth
If spec says X but code clearly does Y, the implementation is ground truth. Flag ❌ Spec-implementation drift.

**Output Format**:

## Truth Table
| # | Invariant | Spec Claims | Code Actually Does | Tests Enforce? | Linked? | Verdict |
|---|-----------|-------------|-------------------|----------------|---------|---------|
| 1 | ... | ... | ... | ... | yes/no | ✅/❌/⚠️/🗑️/❓/🔗 |

## Spec Trash
Invariants the spec claims but code never enforces (and never will):
- [invariant] — reason it's trash

## Test Trash
Tests that add no value:
- [file::test_name] — reason it's trash

## Implementation Trash
Dead code or unreachable paths:
- [file::item] — reason it's trash

## Missing Invariants
Behaviors the code enforces but spec never documents:
- [behavior] — where enforced in code

## Over-Constraint
Spec stricter than implementation:
- [invariant] — spec says X, code does Y

## Missing Links (Code → Spec)
Functions in code that lack `// @lat:` comments:
- [file::function] — should link to [spec section]

## Missing Links (Spec → Code)
Spec sections with no code references via `// @lat:`:
- [section-id] — should reference [file::function]

## Broken Wiki Links
`[[wiki links]]` in spec pointing to nonexistent code locations:
- [section] — broken link: [[broken#Target]]

## Contradictions (NEED USER DECISION)
| # | Spec Says | Code Does | Suggested Resolution |
|---|-----------|-----------|---------------------|
| 1 | ... | ... | Fix code / Fix spec |
"
```

## Phase 3: Interactive Planning

**Strategy**: Present truth table to user. Ask decisions on contradictions. Build prioritized action list.

**Do NOT delegate this phase.** The supervisory agent (you) presents findings and grills the user.

### Presentation Format

```
## Reconciliation Summary: [DOMAIN]

**Truth Table Overview**:
- ✅ Aligned: [N] invariants
- ❌ Contradictions: [N] (NEED YOUR DECISION)
- ⚠️ Half-assed: [N] (tests need work)
- 🗑️ Trash: [N] items to remove
- ❓ Silent: [N] invariants need tests

### CRITICAL — Contradictions Needing Decision

**Contradiction 1**: [invariant name]
- **Spec says**: ...
- **Code does**: ...
- **Options**:
  a) Fix code to match spec (spec is correct)
  b) Update spec to match code (spec is outdated)
  c) Both (spec describes intent, code has workaround — document this)

Which option? [a/b/c]

[Repeat for each contradiction]

### HIGH — Trash Removal (Safe to Delete)

These items are confirmed dead/unneeded. Delete them?
- [ ] [file::item] — [reason]
- [ ] [file::test_name] — [reason]

### MEDIUM — Missing Tests

These invariants are real but untested. Add tests?
- [ ] [invariant] — [suggested test approach]

### LOW — Spec Updates

These spec sections describe behavior that doesn't exist. Update them?
- [ ] [section] — [what to change]
```

### User Decision Gathering

Use `question` tool to collect decisions:

```
question questions=[{
  "question": "For contradiction X, should we fix code or update spec?",
  "header": "Contradiction X",
  "options": [
    {"label": "Fix code", "description": "Change implementation to match spec"},
    {"label": "Update spec", "description": "Change spec to match implementation"},
    {"label": "Document workaround", "description": "Both are partially correct — document the real behavior"}
  ]
}]
```

### Build Action List

After user decisions, compile prioritized action list:

```
## Action Plan: [DOMAIN]

### 1. CRITICAL — Fix Contradictions
| # | Action | Fix Code or Spec? | Effort |
|---|--------|-------------------|--------|
| 1 | ... | ... | S/M/L |

### 2. HIGH — Remove Trash
| # | Item | Type | Effort |
|---|------|------|--------|
| 1 | ... | spec/test/code | XS/S |

### 3. HIGH — Add Missing Tests
| # | Invariant | Test Type | Effort |
|---|-----------|-----------|--------|
| 1 | ... | positive/negative | S/M |

### 4. MEDIUM — Fix Half-Assed Tests
| # | Test | Problem | Fix |
|---|------|---------|-----|
| 1 | ... | inverted/weak/flaky | ...

### 4. MEDIUM — Add Missing lat.md Links
| # | Direction | Source | Target | Effort |
|---|-----------|--------|--------|--------|
| 1 | code→spec | [file::function] | [[section-id]] | XS |
| 2 | spec→code | [[section-id]] | [file::function] | XS |
| 3 | broken link | [[section-id]] | fix [[broken#Target]] | XS |

### 5. LOW — Update Spec
| # | Section | Change | Effort |
|---|---------|--------|--------|
| 1 | ... | ... | XS |
```

## Phase 4: Execute

**Strategy**: Delegate action items to worker subagents. One task per action.

### Worker Task Template

```
task subagent_type=worker description="[Action description]" prompt="
**ACTION**: [from action plan]

**CONTEXT**:
- Domain: [domain]
- Spec section: [lat.md section]
- Implementation files: [files]
- Test files: [files]

**CURRENT STATE**:
[relevant code snippets or spec text]

**TARGET STATE**:
[what needs to change]

**ACCEPTANCE CRITERIA**:
1. [Specific, verifiable criterion]
2. [Specific, verifiable criterion]
3. All existing tests still pass
4. New tests (if any) pass
5. `cargo clippy` and `cargo test` pass
6. `lat check` passes — all wiki links and code refs valid

**STEPS**:
1. Make the changes
2. Run tests: `cargo test -p [crate] -- [filter]`
3. Run `lat check`
4. Report results

**REPORT FORMAT**:
- What was done (bullet list)
- Test results (pass/fail counts)
- Any issues or blockers
- Verification that acceptance criteria are met
"
```

### Link Repair Worker Task Template

Use this for adding `// @lat:` comments, `[[wiki links]]`, or fixing broken links:

```
task subagent_type=worker description="Add lat.md links: [description]" prompt="
**ACTION**: Add missing lat.md links

**MISSING LINKS TO ADD**:
- [file::function] → [[section-id]] (code→spec)
- [[section-id]] → [file::function] (spec→code)
- Fix broken link [[broken#Target]] in [section]

**RULES**:
- Code→Spec: add `// @lat: [[section-id]]` next to the relevant function or test
- Spec→Code: ensure the spec section has at least one code reference via `// @lat:`
- One `@lat:` comment per spec section — do not duplicate
- Broken links: fix the target to point to the correct code location
- Use full path format: [[foundation/core#Transaction Model]]

**ACCEPTANCE CRITERIA**:
1. Every listed link is added or fixed
2. `lat check` passes with no errors
3. No new broken links introduced

**REPORT FORMAT**:
- Links added (list each with file:line and section-id)
- `lat check` output showing all passed
"```

### Execution Order

1. **Remove trash first** — establishes clean foundation
2. **Fix contradictions** — resolves spec/implementation drift
3. **Add missing tests** — enforces real invariants
4. **Fix half-assed tests** — strengthens weak assertions
5. **Add missing lat.md links** — connects code to spec bidirectionally
6. **Update spec** — documents actual behavior (after links are in place)

### Parallelization

Multiple worker tasks can run in parallel if they touch different files:
- One worker removes dead code
- One worker fixes contradiction A
- One worker adds missing tests for invariant B

If workers conflict (touch same file), serialize them.

## Phase 5: Review

**Strategy**: Validate that worker changes actually resolved the issues. Independent check.

**Delegate to general subagents** (1 per domain or 1 per action batch):

```
task subagent_type=general description="Review [DOMAIN] reconciliation" prompt="
**DOMAIN**: [domain]

**CHANGES MADE** (from worker reports):
1. [change 1]
2. [change 2]
3. ...

**ORIGINAL TRUTH TABLE**:
[paste truth table from Phase 2]

**Your Task**:

Verify that the changes actually fixed the issues:

1. Read the modified files
2. Check that contradictions are resolved (spec, code, and tests now agree)
3. Check that trash was actually removed (not just commented out)
4. Check that new tests enforce the invariant (not just document behavior)
5. Check that spec updates match implementation

**For each row in the truth table, report:**
- Was the issue fixed? Yes / No / Partially
- If not fixed, what's still wrong?

**Output Format**:

## Review Results
| # | Original Verdict | Issue | Fixed? | Notes |
|---|-----------------|-------|--------|-------|
| 1 | ❌ | ... | Yes/No | ... |

## Remaining Issues
[Anything not fully resolved]

## New Issues Introduced
[Any regressions or new problems]
"
```

### Review Threshold

- If review finds >20% of actions not fully resolved, re-delegate fixes
- If review finds new issues, add them to the action plan and re-execute
- If review passes, proceed to Phase 6

## Phase 6: Report

**Strategy**: Assemble final report showing the reconciled state.

```
## Reconciliation Report: [DOMAIN]

### Before / After
| Metric | Before | After |
|--------|--------|-------|
| Aligned invariants | N | N |
| Contradictions | N | 0 |
| Half-assed tests | N | N |
| Trash items | N | 0 |
| Silent invariants | N | N |
| Unlinked code→spec | N | 0 |
| Unlinked spec→code | N | 0 |
| Broken wiki links | N | 0 |

### Truth Table (Final)
| # | Invariant | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | ... | ✅ | ... |
| 2 | ... | ❌ | [if any remain, explain why] |

### Changes Made
#### Code
- [file]: [what changed]

#### Tests
- [file]: [what changed]

#### Spec
- [lat.md file]: [what changed]

### Trash Removed
| Item | Type | Lines Removed |
|------|------|--------------|
| ... | ... | ... |

### Remaining Work
| Item | Priority | Effort | Blocker |
|------|----------|--------|---------|
| ... | ... | ... | ... |

### Next Domains to Reconcile
[Suggested next domains based on dependency order]
```

## Key Principles

### 1. Implementation Is Ground Truth
If spec says X and code does Y, the code wins unless there's a compelling reason to change it. The spec describes behavior that existed at some point. The code describes behavior that exists now.

### 2. Tests Must Enforce, Not Document
A test that says "we know this is broken, here's proof" is a bug report, not a test. Delete it or fix the code. False confidence is worse than no confidence.

### 3. Be Ruthless About Trash
- Spec invariants that no code ever enforced → delete from spec
- Tests that assert obvious compiler behavior → delete
- Dead code → delete
- Duplicated invariants stated differently in multiple sections → consolidate

### 4. Compile-Time Invariants Need Compile-Time Proof
If the spec claims "this enum is closed" or "this cannot be constructed without X", verify with `compile_fail` doctests or `ui-test`. Runtime tests that happen to work are not proof.

### 5. Behavioral Tests Over Structural Tests
Checking `field.is_none()` on a new struct is structural. Checking that a forbidden operation returns `Err` is behavioral. Behavioral tests prove invariants; structural tests prove initialization.

### 6. Workers Report, You Decide
Explore agents find truth. Workers implement fixes. General agents validate. You (the supervisory agent) make decisions on contradictions and prioritize. Never let a worker decide whether spec or code is correct.

## Example Workflow

```bash
# 1. Pick a domain
lat section "foundation/core#Transaction Model"

# 2. Phase 1: Excavate implementation
task subagent_type=explore description="Excavate transaction impl"
task subagent_type=explore description="Excavate transaction errors"

# 3. Phase 2: Reconcile
task subagent_type=explore description="Reconcile transaction spec+tests"

# 4. Phase 3: Interactive planning
# (present truth table to user, collect decisions)

# 5. Phase 4: Execute
task subagent_type=worker description="Fix contradiction: double-lock"
task subagent_type=worker description="Remove dead code: unused variant"
task subagent_type=worker description="Add missing test: zero-receiver publish"

# 6. Phase 5: Review
task subagent_type=general description="Review transaction reconciliation"

# 7. Phase 6: Report
# (assemble final report)

# 8. Move to next domain (bottom-up: Foundation -> Agency -> Orchestration -> Interface)
```

## Anti-Patterns to Avoid

### "The Spec Is Correct By Definition"
No. The spec is a snapshot of intent. The code is the living system. If they disagree, the spec is outdated until proven otherwise.

### "This Test Is Good Enough"
If a test passes when the invariant is violated, it's not good enough. If removing `#[non_exhaustive]` doesn't break any test, the test is worthless.

### "Let's Keep This Just In Case"
Dead code, orphaned tests, and spec fiction accumulate. If it hasn't been used in 3 months and no test exercises it, delete it. Git remembers.

### "The User Will Decide Everything"
No. You (the supervisory agent) should make obvious decisions:
- Trash → delete (don't ask)
- Obvious contradictions where code is clearly correct → update spec (don't ask)
- Only ask the user on genuine architectural decisions or trade-offs

## Success Criteria

You've done this well when:
- Every invariant in the spec is either ✅ aligned or explicitly marked as ❌ with a decision
- No trash remains (dead code, spec fiction, worthless tests)
- Every real invariant has at least one behavioral test
- Every function has `// @lat:` pointing to its spec section
- Every spec section is referenced by at least one `// @lat:` in code
- All `[[wiki links]]` pass `lat check`
- The truth table is the source of truth for the domain
- A new team member can read the spec and trust it matches the code

## Failure Modes & Detection Heuristics

| # | Failure Mode | How to Detect | Mitigation |
|---|-------------|---------------|------------|
| 1 | **Explore agent reads incompletely** | Two explore agents disagree on whether an invariant is enforced | Always delegate 2+ explore agents per domain; spot-check 3 random rows before Phase 3 |
| 2 | **Truth table built on false premises** | Phase 2 contradictions don't match what you see when reading the code directly | Spot-check 3 random rows yourself; re-delegate Phase 2 if any are wrong |
| 3 | **User overwhelmed by contradictions** | User picks "fix code" for everything or ignores hard decisions | Batch by severity; present only CRITICAL first; hide trivial ones behind "handle automatically?" |
| 4 | **Worker breaks things** | `cargo test --workspace` fails after worker claims "all tests pass" | Require workers to paste actual command output; always run `cargo test --workspace` between workers |
| 5 | **Phase 5 review is toothless** | Review agent agrees with worker without reading changed code | Give review agent ONLY original truth table + modified files — no worker report |
| 6 | **Circular contradictions** | Fixing A requires B, fixing B requires A; workers get stuck | Detect cycles in action plan before delegating; merge interdependent actions into single task |
| 7 | **False positives on dead code** | `cargo test --workspace` fails after "dead code" removal | Grep entire workspace for references before declaring dead; use `cargo udeps` if available |
| 8 | **Spec updates break `lat check`** | `lat check` fails after worker rewrites lat.md | Make `lat check` mandatory in every worker's acceptance criteria |
| 9 | **Scope explosion** | Excavation takes >30 min for a single domain | Timebox each phase; ask user: "Focus on specific invariant or expand scope?" |
| 10 | **User disagrees with "obvious" decisions** | User reverts agent's "obvious" deletion because code was planned for next sprint | Never delete without asking unless provably dead (no references, no tests, no docs) |
| 11 | **Workers claim tests pass without running** | Worker writes "all tests pass" but only ran `cargo check` | Require actual test command output in worker report; spot-check by re-running |
| 12 | **Parallel workers conflict** | Second worker overwrites first worker's changes | Check file overlap before delegating; `git commit` between each worker |
| 13 | **No spec exists for domain** | lat.md section missing or empty | Detect in Phase 0; pivot: "Write spec from implementation, or pick different domain?" |
| 14 | **Implementation in flux** | Another agent/developer modifies code during reconciliation | Work on a branch; reconcile against a known commit; stash changes if needed |
| 15 | **Review agents not independent** | Review agent subconsciously agrees with worker rationale | Give review minimal context — just files to review and original truth table |
| 16 | **Aspirational spec destroyed** | User wrote spec as roadmap, not current state | Distinguish "current" vs "planned" in Phase 3; mark aspirational invariants as `## Future` |
| 17 | **Acceptance criteria too vague** | Worker fixes 1 of 3 aspects and claims success | Criteria must be binary: "Double-lock returns Err" not "fix locking issues" |
| 18 | **Skill itself becomes half-assed** | User runs Phase 1-2, feels good, never executes Phase 4-6 | Commit action plan to `.planning/reconcile-[domain].md`; track with `todowrite` |
