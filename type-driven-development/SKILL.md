---
name: type-driven-development
description: >
  Strengthen types and make invalid states unrepresentable.
  Two-phase delegation: BREAK (intentionally break compilation by
  strengthening types) then FIX (compiler-driven repair, no weakening).
  Each phase runs in an isolated subagent to prevent cross-contamination
  of incentives.
license: MIT
compatibility: opencode
---

## When to Use

- You know what type or signature to strengthen and need a disciplined workflow
- Invalid states are representable and should be made unrepresentable
- Invariants are runtime-checked but could be compile-time
- You want to go against the conservative default: LLMs weaken types to make
  things compile; this skill does the opposite

## Philosophy

Make invalid states unrepresentable. The compiler propagates constraints.
Intentional inconsistency drives change. Compile-time invariants over runtime
checks.

LLMs default to making code compile by any means — widening with Option,
sprinkling unwrap, erasing types with dyn. This skill inverts that: we
intentionally break compilation by strengthening types, then let the compiler
drive every repair. The codebase conforms to the types, not the other way
around.

The two phases are delegated to separate subagents. The BREAK agent cannot
"help" by fixing call sites because it never sees the FIX rules. The FIX
agent cannot rationalize weakening because it never sees the BREAK rationale
— only the mechanical fact of what changed and a strict prohibition on
shortcuts.

## Process

```
SPECIFY ──→ SCOPE ──→ BREAK ──→ FIX ──→ another cycle?
(you)       (subagent)  (subagent)  (subagent)
```

### Phase 0: SPECIFY

State precisely what to strengthen. This is your job — the skill executes,
it does not choose the target.

Well-specified:

  "Strengthen `UserId` from `String` to a newtype with validated construction"
  "Narrow `count: i32` to `count: NonZeroI32`"
  "Split `enum Event` into `EventRead | EventWrite` encoding permissions"

Vague (not actionable):

  "Make the types better"
  "Use stronger types everywhere"

### Phase 1: SCOPE

Delegate to a subagent to predict blast radius with cheap tool calls.

```
task subagent_type=general description="SCOPE: predict blast radius" prompt="
  <scope-prompt — see template below>
"
```

The SCOPE agent:

1. Runs the compiler to get a clean baseline (or captures current error count)
2. Greps for all usages of the type being changed
3. Counts files and estimated error volume
4. Reports raw numbers

It does NOT recommend — the supervisor decides based on the numbers.
Lean aggressive: default to GO unless the numbers are clearly unreasonable.
If scope is too large, SPLIT into smaller sequential BREAK→FIX cycles before
the first BREAK. Do not attempt to shrink scope by weakening the target.

### Phase 2: BREAK

Delegate to a subagent that edits ONLY type and signature definitions.

```
task subagent_type=general description="BREAK: strengthen types" prompt="
  <break-prompt — see template below>
"
```

The BREAK agent:

- Edits type/struct/enum/trait definitions and function signatures
- Does NOT edit call sites or implementations
- Expects compilation to break — this is the point
- Applies the change and stops

**Allowed:**

- Change type/struct/enum/trait definitions
- Change function signatures (parameter types, return types)
- Narrow types (e.g., `i32` → `NonZeroI32`, `Vec<T>` → `NonEmptyVec<T>`)
- Add lifetimes and phantom types
- Make enums more explicit/exhaustive; split variants
- Add sealed traits or make traits unimplementable outside the crate
- Make fields `pub(crate)` or private; add validated constructors
- Prefer compile-time invariants over runtime checks

**Prohibited:**

- Any edit to call sites or implementations to make code compile
- Introducing or widening with Option/Result to satisfy callers
- unwrap/expect/defaults/fallbacks
- dyn/trait objects to erase types
- #[allow(..)] or suppressing diagnostics
- Any change outside of type/signature definitions

### Phase 3: FIX

Delegate to a single long-running subagent that uses compiler errors as its
sole worklist. This agent loops internally until both the compiler and the
test suite are clean.

```
task subagent_type=general description="FIX: compiler-driven repair" prompt="
  <fix-prompt — see template below>
"
```

The FIX agent's internal loop:

```
1. Run compiler check
2. Fix reported errors exactly — no more, no less
3. Repeat 1-2 until no errors remain in affected scope
4. Run test suite
5. If tests fail:
   - Diagnose: logic error introduced during repair
   - Fix (still under no-weakening rules)
   - Go to 4
6. Report: what was repaired, test results
```

**Allowed:**

- Update call sites, constructors, pattern matches, and generics to meet new
  types
- Add explicit conversions/constructors that preserve invariants
- Refactor code paths to handle newly explicit enum cases
- Add Option/Result at construction sites of the strengthened type where the
  operation is genuinely fallible (e.g., `NonZeroI32::new(n)` validates —
  that is real fallibility, not weakening)
- Prefer exhaustiveness and explicit handling over catch-alls

**Prohibited:**

- Weakening types (no new Option/Result at use sites — changing
  `fn foo() -> T` to `fn foo() -> Option<T>` to avoid handling a newtype)
- unwrap/expect/defaults/fallbacks
- Introducing dyn/trait objects to bypass type requirements
- #[allow(..)] or ignoring errors
- Catch-all `_` patterns instead of exhaustive matching
- Introducing runtime states that the new types were meant to exclude
- Option/Result at construction sites that are not genuinely fallible
  (wrapping a value that is statically known to be valid)

**Scoping:** Fix within the affected area — the module/crate where the type
changed plus its direct dependents. Do not chase errors across the entire
workspace. Stop when errors in scope are clean and tests pass.

### Iteration

After FIX completes, the supervisor may decide another BREAK→FIX cycle is
warranted. The first strengthening often reveals further opportunities
(e.g., narrowing a field exposes that another field carries a related
invariant). Return to Phase 0 with a new target.

## Language Profiles

Multi-language. Rust examples throughout. Compiler commands per language:

| Language | Check command                | Test command          |
|----------|------------------------------|-----------------------|
| Rust     | `cargo check 2>&1`          | `cargo test`          |
| OCaml    | `dune build 2>&1`           | `dune runtest`        |
| Haskell  | `cabal build 2>&1`           | `cabal test`          |
| TypeScript | `tsc --noEmit 2>&1`        | per-project           |

Language-specific strengthening patterns:

**Rust:** newtypes, NonZero*, PhantomData, sealed traits, marker traits,
visibility, const generics.

**OCaml:** phantom types, GADTs, private types, first-class modules,
polymorphic variants for exhaustiveness.

**Haskell:** newtypes, DataKinds, TypeFamilies, closed type families,
phantom types, smart constructors.

## Common Strengthening Patterns (BREAK Recipes)

### 1. Type Narrowing

```rust
// Before
count: i32

// After
count: NonZeroI32
```

### 2. Newtype for Semantic Distinction

```rust
// Before
user_id: String

// After
pub struct UserId(String);
impl UserId {
    pub fn new(s: String) -> Result<Self, InvalidUserId> { ... }
}
```

### 3. Enum Splitting

```rust
// Before
enum Event {
    Read(PathBuf),
    Write(PathBuf, Vec<u8>),
}

// After
enum ReadEvent { Read(PathBuf) }
enum WriteEvent { Write(PathBuf, Vec<u8>) }
```

### 4. Phantom Types for State Machines

```rust
// Before
struct Connection { ... }

// After
struct Connection<S> { _marker: PhantomData<S> }
struct Connected;
struct Disconnected;
```

### 5. Lifetime Constraints

```rust
// Before
fn borrow_value(store: &Store, key: &str) -> &Value

// After
fn borrow_value<'a>(store: &'a Store, key: &str) -> &'a Value
```

### 6. Sealed Traits

```rust
// Before
pub trait Handler { ... }

// After
mod private { pub trait Sealed {} }
pub trait Handler: private::Sealed { ... }
```

### 7. Constructor Encapsulation

```rust
// Before
pub struct Config {
    pub timeout: u32,
    pub retries: u32,
}

// After
pub struct Config {
    timeout: u32,
    retries: u32,
}
impl Config {
    pub fn new(timeout: u32, retries: u32) -> Result<Self, InvalidConfig> { ... }
}
```

### 8. Removing Unnecessary Option

```rust
// Before
name: Option<String>  // always Some after construction

// After
name: String
```

## Common Repair Patterns (FIX Recipes)

### 1. Adding/Updating Constructors

```rust
// Before
let user = UserId(raw_string);

// After
let user = UserId::new(raw_string)?;
```

### 2. Pattern Match Exhaustiveness

```rust
// Before
match event {
    Event::Read(p) => ...,
    Event::Write(p, d) => ...,
}

// After (enum was split)
match event {
    ReadEvent::Read(p) => ...,
}
// and separately:
match event {
    WriteEvent::Write(p, d) => ...,
}
```

### 3. Explicit Conversions

```rust
// Before
let count: i32 = get_count();

// After
let count: NonZeroI32 = NonZeroI32::new(get_count())
    .expect("count is statically non-zero here");
// OR (if genuinely fallible at this call site):
let count: NonZeroI32 = NonZeroI32::new(get_count())?;
```

### 4. Refactoring Code Paths

```rust
// Before (single function handled both cases)
fn handle(event: Event) { ... }

// After (caller must dispatch to the correct handler)
fn handle_read(event: ReadEvent) { ... }
fn handle_write(event: WriteEvent) { ... }
```

### 5. Genuinely Fallible Construction

```rust
// Option/Result at the construction site is REAL fallibility:
let id = UserId::new(user_input)?;  // user input can be invalid

// Option/Result at a USE site is weakening — prohibited:
fn get_user(id: UserId) -> Option<User>  // was -> User, do not change
```

## Anti-Patterns

### In BREAK: "While I'm here..."

Do not fix call sites while strengthening types. The BREAK agent edits
definitions only. If you find yourself touching a function body, stop.

### In BREAK: Pre-emptive Widening

Do not change a type and simultaneously add Option/Result to "prepare" call
sites. The type change alone must create the inconsistency. The FIX agent
handles the fallout.

### In FIX: Option to Satisfy the Compiler

```rust
// Prohibited — this is weakening, not repair
fn get_name(id: UserId) -> Option<String>  // was -> String

// Allowed — this is genuine fallibility at a construction site
let id = UserId::new(raw)?;  // construction can fail, use site unchanged
```

### In FIX: unwrap as "I know it's valid"

```rust
// Prohibited — even if you believe it
NonZeroI32::new(n).unwrap()

// Allowed — propagate the fallibility or restructure to prove validity
NonZeroI32::new(n)?                    // propagate
let n: NonZeroI32 = proven_n;          // restructure so type proves it
```

### In FIX: Catch-All Patterns

```rust
// Prohibited
match event {
    ReadEvent::Read(_) => ...,
    _ => ...,
}

// Required — exhaustive
match event {
    ReadEvent::Read(_) => ...,
}
```

### In FIX: dyn Erasure

```rust
// Prohibited
let handler: Box<dyn Handler> = concrete_handler;

// Required — keep the concrete type or use a sealed trait
```

### In FIX: Suppression

```rust
// Prohibited
#[allow(dead_code)]
#[allow(unused_variables)]
```

---

## Prompt Templates

### SCOPE Agent Prompt

```
You are a SCOPE agent. Predict the blast radius of a type strengthening
change. You MUST NOT make any edits. You are read-only.

**Target change**: {SUPERVISOR: insert the strengthening specification here}

**Language**: {SUPERVISOR: insert language, e.g. Rust}

**Your task**:

1. Run the compiler to get a clean baseline:
   - {language check command, e.g. cargo check 2>&1}
   - Record current error count (should be 0; if not, note it)

2. Find all usages of the type being changed:
   - Use grep/rg to find every file that references the type
   - List each file and count of references

3. Estimate impact:
   - Direct references: files that use the type in signatures or bindings
   - Transitive references: files that depend on modules with direct references
   - Estimated new compiler errors: rough count based on reference density

4. Report:

   ## SCOPE Report

   **Target**: {the strengthening specification}

   **Baseline compiler state**: {0 errors / N errors}

   **Direct references**:
   - {file}: {count} references

   **Estimated new errors**: {N} (rough)

   **Files in scope**: {list}

   (Do NOT recommend GO/SPLIT/ABORT. Report numbers only. The supervisor
   decides.)
```

### BREAK Agent Prompt

```
You are a BREAK agent. Your sole job is to strengthen types. You will edit
ONLY type and signature definitions. The build WILL break. That is expected
and correct. Do NOT attempt to fix anything.

**Target change**: {SUPERVISOR: insert the strengthening specification here}

**Language**: {SUPERVISOR: insert language, e.g. Rust}

**Allowed edits**:
- Change type/struct/enum/trait definitions
- Change function signatures (parameter types, return types)
- Narrow types (e.g., i32 → NonZeroI32, Vec<T> → NonEmptyVec<T>)
- Add lifetimes, phantom types, sealed traits
- Make enums more explicit/exhaustive; split variants
- Make fields pub(crate) or private; add validated constructors
- Prefer compile-time invariants over runtime checks

**Prohibited edits**:
- Any edit to call sites or implementations
- Introducing or widening with Option/Result to satisfy callers
- unwrap/expect/defaults/fallbacks
- dyn/trait objects to erase types
- #[allow(..)] or suppressing diagnostics
- Any change outside of type/signature definitions

**Process**:
1. Read the current type/signature definitions you will change
2. Apply the strengthening edits
3. Stop. Do not run the compiler. Do not fix anything. Do not touch call sites.

**Output**:
- What definitions you changed (file, line, before → after)
- A brief mechanical summary of what changed, suitable for a FIX agent to
  read (no rationale, no intent — just the facts of what was strengthened)
```

### FIX Agent Prompt

```
You are a FIX agent. Compilation is broken because types were strengthened.
Your job is to restore compilation by updating call sites to satisfy the new,
stronger types. Use compiler diagnostics as your sole worklist.

**Type change summary**: {SUPERVISOR: insert the mechanical summary from the
BREAK agent here — what types changed, from what to what. No rationale.}

**Language**: {SUPERVISOR: insert language, e.g. Rust}

**Affected scope**: {SUPERVISOR: insert the files/modules in scope from the
SCOPE report. Do not chase errors outside this scope.}

**Process**:
1. Run: {language check command, e.g. cargo check 2>&1}
2. Fix the reported errors. Each fix must satisfy the new types without
   weakening.
3. Repeat 1-2 until no errors remain in the affected scope.
4. Run: {language test command, e.g. cargo test}
5. If tests fail, diagnose (logic error from repair), fix (still under
   no-weakening rules), go to 4.
6. When compiler is clean in scope and tests pass, report.

**Allowed**:
- Update call sites, constructors, pattern matches, generics
- Add explicit conversions/constructors that preserve invariants
- Refactor code paths to handle newly explicit enum cases
- Add Option/Result ONLY at construction sites of the strengthened type
  where the operation is genuinely fallible (e.g., NonZeroI32::new validates)
- Prefer exhaustiveness and explicit handling over catch-alls

**Prohibited**:
- Weakening types — no new Option/Result at use sites
  (changing fn foo() -> T to fn foo() -> Option<T> is weakening)
- unwrap/expect/defaults/fallbacks
- dyn/trait objects to bypass type requirements
- #[allow(..)] or ignoring errors
- Catch-all _ patterns instead of exhaustive matching
- Introducing runtime states that the new types were meant to exclude
- Option/Result at construction sites that are not genuinely fallible

**Scoping**: Only fix within the affected area. Do not follow errors into
unrelated modules. If a dependent module outside scope breaks, note it in
your report but do not fix it.

**Output**:
- What you repaired (files, changes)
- Compiler result: clean / remaining errors (if any, with locations)
- Test result: pass / fail (if fail, which tests and why)
- Any files outside scope that are now broken (list only, do not fix)
```
