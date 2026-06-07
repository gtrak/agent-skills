---
name: code-drift
description: >
  Detect drift between documented invariants/interface and actual implementation.
  Multi-phase: explore docs, build code hierarchy (parallel subagents), then
  analyze each module for invariant-linked vs unexplained code. Outputs drift
  metrics per module and aggregate across the project.
license: MIT
compatibility: opencode
---

## When to Use

- You suspect implementation has drifted from its documented spec or invariants
- You want a quantitative estimate of how much code is "unexplained" (not tied to any documented invariant)
- You need to audit a codebase for dead, speculative, or legacy logic
- Before a refactor pass — use drift scores to prioritize where to look first

## Philosophy

Documentation states invariants and interface contracts. Implementation should
exist to enforce those invariants. Code that cannot be traced back to an
invariant or necessary mechanism is candidate drift — it may be dead, overly
defensive, speculative, or simply undocumented.

This skill does not judge whether code is "good" or "bad." It quantifies the
gap between spec and implementation so a human (or follow-up skill) can decide
what to do with the delta.

## Process

```
Phase 1: EXPLORE DOCS     Phase 2: BUILD HIERARCHY       Phase 3: ANALYZE MODULES
┌─────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐
│ Locate docs (lat.md │-> │ Parallel subagents:      │->  │ For each module,    │
│ or ask user)        │   │ - Code structure scan    │    │ run drift analysis   │
│ Extract invariants  │   │ - Doc coverage mapping   │    │ prompt per module    │
│ & interfaces        │   │ (in parallel)            │    │                     │
└─────────────────────┘   └──────────────────────────┘   └──────────────────────┘

Phase 4: AGGREGATE
┌────────────────────────────────────────────────────┐
│ Collect per-module metrics into project-level      │
│ drift report with rankings and top concerns        │
└────────────────────────────────────────────────────┘
```

## Subagent Usage

| Subagent | Use for | Why |
|----------|---------|-----|
| `explore` | Docs exploration, code hierarchy scan | Fast, read-only — cannot modify files |
| `general` | Per-module drift analysis (prompt execution) | Long-running analysis per module |

---

## Phase 1: Explore Documentation

**Goal**: Find and extract documented invariants and interfaces.

### Step 1.1: Locate Docs

Check if the project uses `lat.md` as its documentation convention:

```bash
# Search for lat.md at project root or docs/
glob "**/lat.md"
```

If `lat.md` is found, read it and extract invariants and interface specs.

### Step 1.2: Fallback — Ask the User

If no `lat.md` exists, ask the user:

> No `lat.md` documentation file found. Please point me to the documented
> invariants and interface contracts for this project. Options:
> - Path to a spec/doc file or directory
> - A description of where invariants are defined
> - If you want me to use README, module docstrings, or other sources as spec

If the user provides an alternative source, extract invariants from there.

### Step 1.3: Extract Spec Model

From whatever documentation is found, structure the extracted content into:

1. **Documented interfaces** — public functions, types, contracts
2. **Documented invariants** — constraints, guarantees, protocols
3. **Module-to-doc mapping** — which docs cover which modules/areas

Store this structured output as `<interface>` and `<invariants>` blocks for
use in Phase 3.

---

## Phase 2: Build Code Hierarchy

**Goal**: Understand the code structure so each documented area can be mapped
to its implementation. Launch **two subagents in parallel**.

### Subagent A — Code Structure Scan

```
task subagent_type=explore description="Scan code hierarchy" prompt="
**TASK**: Build a hierarchical map of the codebase.

1. Identify the project language and build system
2. Enumerate top-level modules/directories
3. For each, list submodules and entry points
4. Note module boundaries (file or logical)
5. Flag any obvious spec files (README, docstrings, etc.)

**DO NOT MODIFY ANYTHING — JUST ANALYZE**

**Output format**:
```
Project root: /path
Language: {rust|python|typescript|...}
Build system: {cargo|bun|npm|...}

Module tree:
├── module_a/
│   ├── entry.rs (main logic)
│   ├── types.rs (data structures)
│   └── docs/lat.md (spec)
├── module_b/
│   └── ...

Notes:
- Any observed conventions
- Module boundary markers
```
"
```

### Subagent B — Doc Coverage Mapping

```
task subagent_type=explore description="Map docs to modules" prompt="
**TASK**: Map documentation coverage to code modules.

Given the documented invariants and interfaces (see below), determine which
code regions each doc covers. For each module in the codebase, decide whether
it has corresponding documentation and what that documentation says.

Documented interfaces: {insert from Phase 1}
Documented invariants: {insert from Phase 1}

**DO NOT MODIFY ANYTHING — JUST ANALYZE**

**Output format**:
```
Doc coverage map:

Module: module_a
  Covered by: docs/lat.md section "Module A"  
  Invariants: [list]
  Interface: [list]

Module: module_b
  Covered by: NONE (undocumented)

Module: module_c
  Covered by: docs/lat.md section "Module C"
  Invariants: [list]
  Interface: [partial — some functions undocumented]

Summary:
- Fully documented modules: N
- Partially documented modules: N
- Undocumented modules: N
```
"
```

### Supervisor Assembly

After both subagents return, combine their outputs into a unified module list:

```
Modules to analyze:
1. module_a — invariants=[...], interface=[...]   (documented)
2. module_b — invariants=[], interface=[]        (undocumented, skip drift analysis)
3. module_c — invariants=[...], interface=[partial]  (partially documented)
```

Only modules with **some** documentation enter Phase 3.

---

## Phase 3: Analyze Each Module

**Goal**: For each documented module, estimate drift metrics by running the
drift analysis prompt.

### Progress Tracking

```
todowrite todos=[
  {"content": "Phase 1: Extract docs and invariants", "status": "completed", "priority": "high"},
  {"content": "Phase 2: Build code hierarchy", "status": "completed", "priority": "high"},
  {"content": "Analyze drift: module_a", "status": "in_progress", "priority": "high"},
  {"content": "Analyze drift: module_c", "status": "pending", "priority": "high"}
]
```

### Per-Module Analysis

For **each documented module**, delegate to a `general` subagent with the
following prompt:

```
task subagent_type=general description="Drift analysis: {MODULE_NAME}" prompt="
You are analyzing a single module to estimate how much of its implementation
is justified by its documented invariants and interface.

Your goal is to approximate:
- invariant-linked code (essential)
- mechanism-required code (necessary but not in spec)
- unexplained code (candidate drift)

You must be skeptical and avoid over-attributing code as \"essential.\"

---

INPUTS

1. MODULE CODE
<module_code>
{CODE}
</module_code>

2. DOCUMENTED INTERFACE
<interface>
{INTERFACE}
</interface>

3. DOCUMENTED INVARIANTS / CONTRACTS
<invariants>
{INVARIANTS}
</invariants>

---

STEP 1 — Extract Spec Model

Derive a minimal abstract model required to satisfy the invariants:

- State variables (minimal set)
- Key transitions / operations
- Constraints (explicit + implied)
- Any ordering or protocol requirements

Keep this minimal. Do NOT include implementation details.

---

STEP 2 — Map Implementation to Spec

Walk through the module and identify regions (functions, blocks, or logical
groups).

For each region, classify:

A) INVARIANT-LINKED
- Directly required to enforce or maintain invariants

B) MECHANISM-REQUIRED
- Necessary for real-world operation but not specified:
  (e.g. I/O, retries, caching, serialization, logging, error handling)

C) UNEXPLAINED
- No clear connection to invariants or necessary mechanisms
- Redundant, overly defensive, legacy-looking, or speculative logic

Be conservative:
- Prefer MECHANISM over INVARIANT if unclear
- Prefer UNEXPLAINED over forcing a weak justification

---

STEP 3 — Estimate Complexity Weights

Estimate relative weight for each region using a rough proxy:
- lines of code OR
- logical complexity (branches, paths)

You may approximate—precision is not required, consistency is.

Aggregate totals:

C_total
C_invariant
C_mechanism
C_unexplained

---

STEP 4 — Compute Metrics

R_drift = C_unexplained / C_total

Score = C_unexplained

Also compute:
Invariant coverage = C_invariant / C_total

---

STEP 5 — Sanity Check

Briefly validate:
- Are invariants under-specified?
- Is mechanism code unusually large?
- Any obvious misclassification?

Adjust estimates if clearly wrong.

---

OUTPUT (STRICT FORMAT)

Return ONLY valid JSON:

{
  \"C_total\": <number>,
  \"C_invariant\": <number>,
  \"C_mechanism\": <number>,
  \"C_unexplained\": <number>,
  \"R_drift\": <number 0.0-1.0>,
  \"Score\": <number>,
  \"notes\": [
    \"short bullet on biggest unexplained area\",
    \"short bullet on likely false positive/negative\",
    \"short bullet on spec gaps if any\"
  ]
}
"
```

Run these in parallel where possible (up to 3-4 concurrent). Collect each
module's JSON result.

---

## Phase 4: Aggregate and Report

**Goal**: Produce a project-level drift report.

### Aggregate Metrics

From per-module results, compute:

```
Project totals:
  C_total = Σ C_total_i
  C_invariant = Σ C_invariant_i
  C_mechanism = Σ C_mechanism_i
  C_unexplained = Σ C_unexplained_i
  R_drift_project = C_unexplained / C_total
```

### Report Format

```
## Code Drift Analysis: {Project Name}

### Project-Level Metrics

| Metric | Value |
|--------|-------|
| Total complexity (C_total) | {N} |
| Invariant-linked (C_invariant) | {N} ({pct}% of total) |
| Mechanism-required (C_mechanism) | {N} ({pct}% of total) |
| Unexplained / drift (C_unexplained) | {N} ({pct}% of total) |
| **Project R_drift** | **{0.00-1.00}** |

### Per-Module Breakdown

Ranked by R_drift (highest drift first):

| Module | C_total | C_invariant | C_mechanism | C_unexplained | R_drift |
|--------|---------|-------------|-------------|---------------|---------|
| {mod}  | {N}     | {N}         | {N}         | {N}           | {0.0-1.0} |

### Top Concerns

(From notes across all modules, deduplicated and prioritized):

1. {biggest unexplained area}
2. {likely false negative — drift that was attributed to mechanism but may be unexplained}
3. {spec gaps — areas where docs are too thin to judge}

### Methodology Notes

- Invariant-linked: code directly required by documented contracts
- Mechanism-required: necessary infrastructure (I/O, error handling, etc.)
- Unexplained: no traceable justification — candidate drift
- Conservative classification: unclear code is classified UNEXPLAINED, not INVARIANT
```

---

## Key Principles

### Be Skeptical

Prefer over-classifying as "unexplained" rather than under-classifying. A
false positive (flagging valid mechanism as drift) is less harmful than a
false negative (missing real drift).

### Conservative by Default

When uncertain whether code is INVARIANT-LINKED or MECHANISM-REQUIRED, choose
MECHANISM. When uncertain between MECHANISM and UNEXPLAINED, choose UNEXPLAINED.

### Consistency Over Precision

The metrics are approximations. Exact line counts don't matter. What matters
is that the classification approach is applied consistently across modules.

### Spec Gaps Are Significant

If a module's documentation is thin, drift analysis will be less reliable.
Report these as spec gaps — the issue may be undocumented code, not drifted
code.

## Anti-Patterns

### Over-Attributing to Invariants

Do not classify code as INVARIANT-LINKED unless the invariant explicitly
requires it. "It seems like this code must be needed" is not sufficient —
the spec must state it.

### Ignoring Mechanism Code

I/O, retries, serialization, logging — these are real costs but are not
part of the spec. Count them as MECHANISM, not INVARIANT.

### Skipping Undocumented Modules

Modules with no documentation cannot be analyzed for drift — they enter the
system as "unknown." Report them separately; do not silently exclude them.

### Forcing Justification

If a region of code has no clear connection to any invariant or mechanism,
classify it UNEXPLAINED. Do not invent a justification.

---

## Example Invocation

```
# Phase 1: Supervisor locates docs
> Is there a lat.md in the project?
> glob "**/lat.md" → found: docs/lat.md

# Phase 2: Parallel exploration
task subagent_type=explore description="Scan code hierarchy"
  (runs concurrently)
task subagent_type=explore description="Map docs to modules"

# Phase 3: Per-module drift analysis (parallel where possible)
task subagent_type=general description="Drift: auth module"
  prompt="<drift prompt with auth code + invariants>"

task subagent_type=general description="Drift: storage module"
  prompt="<drift prompt with storage code + invariants>"

# Phase 4: Aggregate results into report
```
