---
name: rust-safety
description: Audit Rust changes for bugs the compiler and Clippy do not catch (TOCTOU, panic surfaces, UTF-8 issues, error suppression, and trust-boundary mistakes) before finalizing work
compatibility: opencode
metadata:
  language: rust
  stage: pre-finalize
---

## What I do

I perform a **pre-finalization audit of Rust code** focusing on real-world bug classes that pass the borrow checker and typical linting:

- TOCTOU (time-of-check/time-of-use) filesystem races
- Path-based operations instead of file-descriptor–based safety
- Permissions set after creation (race windows)
- UTF-8 assumptions at OS boundaries
- Panic paths reachable from external input
- Silent error suppression (`.ok()`, `let _ =`)
- Behavioral drift (CLI / API compatibility)
- Trust-boundary ordering issues (`chroot`, `setuid`, etc.)

I produce **concrete findings with severity and fixes**, not general advice.

---

## When to use me

Use this **before finalizing any Rust changes**, especially when:

- Filesystem operations are involved
- Code touches OS boundaries (paths, env, IO)
- External input is processed
- Privilege or environment changes occur
- You are replacing or emulating existing tools

If unsure, run me anyway.

---

## How to execute

Given the current diff (and surrounding context if available), perform the following audit:

### 1. TOCTOU / path re-resolution

- Detect multiple operations on the same path:
  - `metadata`, `remove_file`, `create`, `set_permissions`, etc.
- Flag any sequence where the path is re-used across syscalls

Output:
- severity: **critical**
- explanation: path may be swapped between calls
- fix: use file descriptors or atomic APIs (`create_new`, `open` + operate via fd)

---

### 2. Permission race conditions

- Detect:
  - create → chmod / set_permissions

Output:
- severity: **high**
- explanation: race window allows attacker-controlled perms
- fix: set mode at creation (`OpenOptionsExt::mode`, `DirBuilderExt::mode`)

---

### 3. UTF-8 boundary violations

- Detect:
  - `String` / `from_utf8_lossy` / implicit UTF-8 assumptions
  - printing or transforming OS data as text

Output:
- severity: **high or medium**
- explanation: OS interfaces are byte-oriented, not UTF-8 safe
- fix: use `OsStr`, `OsString`, or raw bytes (`&[u8]`, `write_all`)

---

### 4. Panic surfaces (DoS class)

- Detect:
  - `unwrap`, `expect`, indexing, `panic!`
  - reachable from external or untrusted input

Output:
- severity: **high**
- explanation: panic = crash = denial-of-service vector
- fix: propagate errors (`Result`, `?`, structured handling)

---

### 5. Error suppression

- Detect:
  - `.ok()`
  - `unwrap_or_default`
  - `let _ = ...`

Output:
- severity: **medium**
- explanation: real failures are silently ignored
- fix: handle or aggregate errors explicitly

---

### 6. Path equality / identity mistakes

- Detect:
  - string or structural comparison of paths

Output:
- severity: **medium**
- explanation: paths may alias (symlinks, mount points)
- fix: canonicalize or compare via file descriptors / metadata

---

### 7. Trust-boundary ordering

- Detect:
  - `chroot`, `setuid`, `setgid`
  - resolution or IO performed after boundary change

Output:
- severity: **critical**
- explanation: attacker can influence resolution context
- fix: resolve all paths before boundary transition

---

### 8. Behavioral compatibility drift

- Check:
  - CLI flags
  - exit codes
  - error semantics
  - edge-case handling

Output:
- severity: **low–high depending on impact**
- explanation: breaks downstream assumptions
- fix: match expected semantics exactly or document change

---

## Output format

For each issue found:

- **Title**
- **Severity**: critical | high | medium | low
- **Location**: file + snippet
- **Failure mode**
- **Concrete fix**

If no issues:
- explicitly state: `no preflight issues detected`

---

## Enforcement rule

If any issue is:
- severity **critical** or **high**

Then:
- block finalization
- require fixes before proceeding

Medium/low issues:
- report but do not block
