---
name: refactor-consolidate
description: Systematically refactor, tighten, and deduplicate implementation while preserving complete functionality
license: MIT
compatibility: opencode
---

## When to Use

Use this skill when:
- Code has grown organically and needs structural cleanup
- Duplication has accumulated across the codebase
- Test suites have redundant coverage
- Mechanical improvements can be safely delegated
- You need to improve maintainability without changing behavior

## Prerequisites

- Working implementation with tests
- Test suite that passes (baseline)
- Understanding of critical vs mechanical code

## Process Overview

```
Phase 1: IDENTIFY          Phase 2: DELEGATE           Phase 3: CONSOLIDATE
┌─────────────────────┐   ┌─────────────────────┐    ┌─────────────────────┐
│ Scan for:           │   │ Delegate each       │    │ Workers report      │
│ - Duplication       │   │ cleanup area with   │    │ additional          │
│ - Boilerplate       │-> │ clear acceptance    │->  │ refinement          │
│ - Redundancy        │   │ criteria            │    │ opportunities       │
│ - Structural issues │   │                     │    │                     │
└─────────────────────┘   └─────────────────────┘    └─────────────────────┘

Phase 4: EXECUTE          Phase 5: REPORT
┌─────────────────────┐   ┌─────────────────────┐
│ Workers implement   │   │ Supervisory agent   │
│ approved cleanups   │   │ assembles findings  │
│                     │   │ into final report   │
└─────────────────────┘   └─────────────────────┘
```

## Subagent Usage

| Subagent | Use for | Why |
|----------|---------|-----|
| `explore` | Scanning, analysis, finding opportunities | Fast, read-only — cannot modify files |
| `worker` | Implementation (cleanups, deduplication) | Constrained executor — no scope expansion, single response |

## Phase 0: Establish Context (Where to Look)

**Strategy**: Determine the scope of investigation based on recent work.

The skill adapts its investigation strategy based on available context:

### Option A: Supervisor Has Recent Context

If you've recently delegated work, you already know which files were modified:

```bash
# Check recent git history for files you touched
git diff --name-only HEAD~5
```

**Action**: Focus scanning on:
- Files modified in recent completed tasks
- Related modules that interface with changed code
- Test files covering the modified areas

### Option B: Extract from Git History

If supervisor context is lost, extract it from recent git activity:

```bash
# Recently modified files (last N commits)
git diff --name-only HEAD~10

# Files changed in the last day
git log --since="1 day ago" --name-only --pretty=format:

# Unique, sorted
git log --since="1 day ago" --name-only --pretty=format: | sort -u
```

**Action**: Compile a list of recently touched files and focus scanning there.

### Option C: Broad Investigation (No Recent Context)

If no recent work context exists, perform a systematic codebase scan:

```bash
# Identify major source directories
glob "**/*.rs"  # or *.py, *.ts, etc.
```

**Action**: Scan the entire codebase or major modules systematically.

### Context-Aware Scanning Strategy

Choose your Phase 1 approach based on context availability:

| Context Available | Approach | Focus Area |
|-------------------|----------|------------|
| Recent delegation history | Targeted | Recently modified files |
| Git history | Targeted | Files from recent commits |
| Neither | Broad | Entire codebase or major modules |

### Supervisor Context Management

**When to use Targeted Scanning (Phase 0A/0B)**:
- Immediately after completing feature work
- After multiple task delegations to same module
- When you know the codebase well and want focused cleanup
- For "leave it better than you found it" cleanup

**When to use Broad Scanning (Phase 0C)**:
- First cleanup pass on a codebase
- No recent work context available
- Suspect systemic duplication across codebase
- Dedicated refactoring sprint (not just opportunistic)

**Hybrid Approach**:
```bash
# 1. Start with targeted scan of recent work
# 2. Workers report "similar patterns found in [other files]"
# 3. Broaden scan to those additional files
# 4. Consolidate findings across all areas
```

## Phase 1: Identify Cleanup Opportunities

**Strategy**: Scan codebase systematically for refactorable patterns.

**Scope Selection**:
- If context available (Phase 0): Scan affected files + closely related modules
- If no context: Scan major functional areas

**Progress Tracking**: Use `todowrite` to track scan progress across categories.

```
todowrite todos='[
  {"content": "Scan for code duplication", "status": "in_progress", "priority": "high"},
  {"content": "Scan for test redundancy", "status": "pending", "priority": "high"},
  {"content": "Scan for boilerplate & ceremony", "status": "pending", "priority": "medium"},
  {"content": "Scan for structural issues", "status": "pending", "priority": "medium"},
  {"content": "Consolidate findings and prioritize", "status": "pending", "priority": "high"}
]
```

### Categories to Scan

**1. Code Duplication**
- Same logic in multiple places
- Copy-pasted functions with minor variations
- Identical error handling blocks
- Repeated setup/teardown patterns

**2. Test Duplication**
- Tests asserting identical behavior
- Setup code repeated across test files
- Same edge case tested multiple times
- Note: Test ASSERTIONS must stay; identical test FUNCTIONS can be removed

**3. Boilerplate & Ceremony**
- Unused imports
- Excessive verbosity
- Overly complex abstractions
- Redundant type annotations

**4. Structural Issues**
- Functions that should be methods
- Modules with mixed concerns
- Public APIs that should be private
- Opportunities for composition over duplication

### Scanning Pattern

For each category, delegate focused scans:

```
task subagent_type=explore description="Scan for [CATEGORY]" prompt="
**SCAN FOR**: [duplication | test redundancy | boilerplate | structural issues]

**READ IMPLEMENTATION:**
- [list files/modules to scan]

**DO NOT MODIFY ANYTHING - JUST ANALYZE**

**Your Task:**
Find all instances of [CATEGORY]. For each:

1. Location: file path and line numbers
2. Current: code snippet showing the issue
3. Impact: brief assessment of cleanup benefit
4. Risk: low | medium | high (chance of breaking something)

**Categorize by Cleanup Type:**
- Mechanical: safe to automate (renames, moves, deduplication)
- Structural: needs design decision (extract module, change API)
- Tests: duplicate assertions, redundant setup

**Output Format:**

## [Category] Findings

### Finding 1
- **Location**: `path/to/file.ext:45-67`
- **Current**: [code snippet]
- **Issue**: [description]
- **Suggested**: [brief cleanup approach]
- **Risk**: low | medium | high

### Finding 2
...

**At the end of your analysis, suggest 2-3 additional areas** that might benefit from cleanup but weren't in the original scope.
"
```

### Context-Aware Scanning Examples

**With Recent Context (Phase 0A or 0B)**:
```bash
# Files identified from recent work:
# - src/auth.rs (recently modified)
# - src/auth_test.rs (recently modified)
# - src/middleware.rs (uses auth)

# Delegate targeted scans
task subagent_type=explore description="Scan auth module for duplication" prompt="
**FOCUS FILES** (recently modified):
- src/auth.rs
- src/auth_test.rs
- src/middleware.rs

**SCAN FOR**: code duplication, test redundancy, boilerplate
...
"
```

**Without Context (Phase 0C)**:
```
# One scan per category across entire codebase
task subagent_type=explore description="Scan for code duplication"
task subagent_type=explore description="Scan for test redundancy"
task subagent_type=explore description="Scan for boilerplate"
task subagent_type=explore description="Scan for structural issues"
```

### Extracting Context from Git History

```bash
# Step 1: Get recently changed files
git log --since="1 day ago" --name-only --pretty=format: | sort -u

# Step 2: See what changed in each file
git log --oneline -10 -- src/auth.rs

# Step 3: See the actual diff for context
git diff HEAD~5 -- src/auth.rs

# Step 4: Compile affected files list and their dependents
# - src/parser.rs
# - src/validator.rs
# - Any files importing these (grep for use/import statements)
```

## Phase 2: Delegate Cleanups with Acceptance Criteria

**Strategy**: Convert findings into actionable tasks with strict acceptance criteria.

**Progress Tracking**: Update `todowrite` with specific cleanup tasks from findings.

```
todowrite todos='[
  {"content": "Scan for code duplication", "status": "completed", "priority": "high"},
  {"content": "Scan for test redundancy", "status": "completed", "priority": "high"},
  {"content": "Deduplicate process_x/process_y in file_a/file_b", "status": "in_progress", "priority": "high"},
  {"content": "Consolidate test setup in test_a/test_b", "status": "pending", "priority": "medium"},
  {"content": "Remove unused imports in module_c", "status": "pending", "priority": "low"}
]
```

### Task Structure

Each cleanup task must include:

```
**CLEANUP TASK**: [Brief description]

**Scope**: Mechanical | Structural | Test

**Current State**:
```
[code snippet showing duplication/boilerplate]
```

**Target State**:
```
[what it should look like after cleanup]
```

**Acceptance Criteria** (MUST be verifiable):
1. [Specific criterion - e.g., "Function extracted to shared module"]
2. [Specific criterion - e.g., "All existing tests still pass"]
3. [Specific criterion - e.g., "No references to old duplicated code"]

**Verification Steps**:
1. Run test suite: [command]
2. Verify no regressions: [how to check]
3. Review changed files: [what to look for]

**Preservation Requirements**:
- All test assertions must be preserved (may be reorganized)
- Public API behavior unchanged
- Error messages maintain same meaning
- Performance not degraded

**Additional Refinement Suggestions** (fill in during/after work):
[Worker notes additional opportunities discovered]
```

### Delegation Pattern

Implementation tasks use `subagent_type=worker` (constrained executor,
no scope expansion). Scanning and analysis tasks use
`subagent_type=explore` (read-only, cannot modify files).

```
task subagent_type=worker description="[Cleanup description]" prompt="
**CLEANUP TASK**: [Description from findings]

**Current**:
```
[code]
```

**Target**: [description]

**Acceptance Criteria**:
1. [Criterion 1]
2. [Criterion 2]
3. All tests pass

**Steps**:
1. Make the changes
2. Run tests to verify
3. Report any additional refinement opportunities you discover

**Report Format**:
- What was done
- Test results
- Additional refinement suggestions (if any)
- Any issues or blockers
"
```

### Cleanup Priority

**Order of operations**:
1. **Mechanical first** (safest, establishes patterns)
   - Remove unused imports
   - Deduplicate identical functions
   - Consolidate shared setup code

2. **Test consolidation** (establishes safety net)
   - Remove truly duplicate tests
   - Deduplicate test setup
   - Keep all unique assertions

3. **Structural last** (builds on clean foundation)
   - Extract modules
   - Refactor APIs
   - Composition over inheritance/duplication

## Phase 3: Execute Cleanups

**Strategy**: Implement cleanups, gather refinement suggestions.

### Worker Responsibilities

Workers must:
1. Implement the cleanup per acceptance criteria
2. Run tests and verify they pass
3. Note any additional refinement opportunities discovered
4. Report mechanical vs design opportunities separately

**Progress Tracking**: Mark each cleanup task in `todowrite` as completed or in_progress as work proceeds.

```
todowrite todos='[
  {"content": "Deduplicate process_x/process_y", "status": "completed", "priority": "high"},
  {"content": "Consolidate test setup", "status": "in_progress", "priority": "medium"},
  {"content": "Remove unused imports in module_c", "status": "pending", "priority": "low"}
]
```

### Tracking Refinement Suggestions

Workers should categorize suggestions:

```
**Additional Refinement Opportunities Discovered**:

**Mechanical** (can be delegated immediately):
- Finding 1: [description and location]
- Finding 2: [description and location]

**Design** (needs supervisory decision):
- Finding 3: [description - involves API change or architectural decision]
- Finding 4: [description - trade-offs to consider]

**Out of Scope** (noted for future):
- Finding 5: [would change behavior or too large for current scope]
```

## Phase 4: Consolidate Findings into Final Report

**Strategy**: Assemble all worker reports into actionable summary.

### Supervisory Agent Assembly

```
## Refactoring Report: [Project/Module Name]

### Completed Cleanups

| Task | Status | Test Results | Notes |
|------|--------|--------------|-------|
| [Description] | Complete | All pass | - |
| [Description] | Partial | 1 failure | See Finding X |

### Additional Mechanical Cleanups Identified

These can be safely delegated:

1. **[Description]**
   - **Location**: `path:lines`
   - **Issue**: [brief]
   - **Suggested Approach**: [how to fix]
   - **Estimated Effort**: small | medium | large

### Design-Level Refinements Identified

These need architectural decisions:

1. **[Description]**
   - **Context**: [what worker discovered]
   - **Trade-offs**: [pros/cons]
   - **Recommendation**: [supervisory agent assessment]
   - **Next Step**: [delegate for design | discuss with team | defer]

### Deferred Items

Noted but out of current scope:

1. **[Description]**
   - **Reason**: [why deferred]
   - **Future Trigger**: [when to revisit]

### Metrics

- **Duplicated code removed**: [N] lines
- **Tests consolidated**: [N] removed, [N] assertions preserved
- **Boilerplate reduced**: [N] lines
- **Test pass rate**: [X]% before, [Y]% after

### Recommendations

1. **Immediate**: [next mechanical cleanups to tackle]
2. **Short-term**: [design refinements worth exploring]
3. **Long-term**: [architectural improvements to consider]
```

### Assembly Process

1. **Gather worker outputs**: Collect all cleanup reports
2. **Categorize suggestions**:
   - Mechanical → Ready to delegate
   - Design → Needs decision
   - Out of scope → Document for future
3. **Assess patterns**: Multiple workers suggesting similar things?
4. **Prioritize**: Impact vs effort
5. **Document**: Create final report
6. **Update `todowrite`**: Mark all completed, add any follow-up items discovered

## Key Principles

### 1. Preserve Functionality Above All

**Golden Rule**: If it changes behavior, it's not a cleanup - it's a feature change.

- Deduplicate identical functions
- Extract shared setup
- Do not change algorithm (unless equivalent)
- Do not modify error messages (unless purely cosmetic)

### 2. Mechanical Cleanups are Safe

Mechanical = structural moves with no logic changes:
- Moving code between files
- Extracting functions
- Removing unused code
- Consolidating identical patterns

These can be delegated with confidence.

### 3. Tests are Guard Rails

**Test Assertions** = Feature specification
- Must be preserved (may be reorganized)
- If tests fail after "cleanup", the cleanup is wrong

**Test Functions** = Implementation detail
- Can be removed if truly identical
- Can be consolidated if testing same thing
- Setup code can be shared

### 4. Workers Report, Supervisory Agent Decides

Workers identify opportunities; supervisory agent:
- Validates suggestions
- Resolves conflicts (two workers suggest opposite approaches)
- Makes design decisions
- Prioritizes next steps

## Common Patterns

### Pattern: Extract Shared Function

```
**Current**:
// file_a.ext
fn process_x() { steps 1-2-3 }

// file_b.ext
fn process_y() { steps 1-2-3 }

**Target**:
// shared.ext
pub fn common_process() { steps 1-2-3 }

// file_a.ext
fn process_x() { common_process() }

// file_b.ext
fn process_y() { common_process() }

**Acceptance Criteria**:
1. Common function extracted to shared location
2. Original functions call common function
3. All tests pass
4. No behavior change
```

### Pattern: Consolidate Test Setup

```
**Current**:
// test_a.rs
fn setup() { /* 20 lines */ }

// test_b.rs
fn setup() { /* same 20 lines */ }

**Target**:
// test_utils.rs
pub fn common_setup() { /* 20 lines */ }

// test_a.rs
use test_utils::common_setup;

// test_b.rs
use test_utils::common_setup;

**Acceptance Criteria**:
1. Setup extracted to shared module
2. Both test files use shared setup
3. All test assertions preserved
4. All tests pass
```

### Pattern: Remove Duplicate Tests

```
**Current**:
#[test]
fn test_foo_basic() {
    let result = foo(5);
    assert_eq!(result, 10);
}

#[test]
fn test_foo_again() {
    let result = foo(5);
    assert_eq!(result, 10);
}

**Target**:
#[test]
fn test_foo_basic() {
    let result = foo(5);
    assert_eq!(result, 10);
}

**Acceptance Criteria**:
1. Identical test removed
2. Remaining test still passes
3. No unique assertions lost
4. Test coverage unchanged
```

## Safety Checks

Before declaring cleanup complete:

1. **Test Suite Passes**
   ```bash
   [run test command]
   # Must be 100% or clearly documented why not
   ```

2. **No Deleted Assertions**
   ```
   Compare before/after test counts:
   - Before: [N] assertions
   - After: [N] assertions (or more)
   ```

3. **Public API Unchanged**
   ```
   - All public functions still exist
   - Signatures unchanged (or equivalent)
   - Return values semantically identical
   ```

4. **Behavioral Equivalence**
   ```
   - Edge cases handled same way
   - Error conditions trigger same paths
   - Performance not worse (or documented)
   ```

## Example Workflow

```bash
# 1. Establish context
git diff --name-only HEAD~10

# 2. Set up tracking
todowrite todos='[
  {"content": "Scan for code duplication", "status": "in_progress", "priority": "high"},
  {"content": "Scan for test redundancy", "status": "pending", "priority": "high"},
  {"content": "Scan for boilerplate", "status": "pending", "priority": "medium"},
  {"content": "Scan for structural issues", "status": "pending", "priority": "medium"}
]

# 3. Delegate scans
task subagent_type=explore description="Scan for duplication"
task subagent_type=explore description="Scan for test redundancy"

# 4. Create cleanup tasks with acceptance criteria
# (based on scan findings)

# 5. Delegate cleanups (worker subagent for constrained execution)
task subagent_type=worker description="Deduplicate X" prompt="..."
task subagent_type=worker description="Consolidate Y" prompt="..."

# 6. Gather reports, assemble final report
# (supervisory agent synthesizes)

# 7. (Optional) Delegate mechanical follow-ups identified
```

## Success Indicators

You've done this well when:
- All tests pass (or documented exceptions)
- No assertions were removed (only reorganized)
- Public API unchanged
- Code is more maintainable (DRY, cleaner structure)
- Final report documents next opportunities
- Workers found and reported additional refinements

## Anti-Patterns to Avoid

### "While I'm here..."
Don't let cleanups turn into feature work. If you find bugs or missing features:
- Note them in the report
- Create separate tasks
- Complete the cleanup first

### Over-Engineering
Don't introduce complex abstractions to remove simple duplication:
- Simple duplication → extract function
- Complex abstraction → may not be worth it

### Silent Test Removal
Never remove tests without verifying assertions are preserved elsewhere:
- Check the test being removed
- Verify same assertions exist in remaining tests
- Document why removal is safe

### Breaking Changes Disguised as Cleanup
If cleanup requires API changes:
- It's not a cleanup
- Create a proper migration task
- Document breaking changes
