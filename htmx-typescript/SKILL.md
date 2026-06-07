---
name: htmx-typescript
description: Enforces disciplined HTMX + TypeScript server-driven UI development.  Focuses on HTMX lifecycle correctness, DOM mutation semantics,  runtime observability, browser-debugging methodology, and preventing  architectural drift toward imperative SPA patterns. Optimized for  workflows using browser automation/debugging agents and server-rendered  HTML fragments.
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
hidden: true
---

# HTMX + TypeScript Backend Agent Skill

## Purpose

This skill constrains and stabilizes agent behavior when working on:

- HTMX-driven frontend systems
- TypeScript backends serving HTML fragments
- Server-driven UI architectures
- Browser-debugging workflows using agent-browser tooling

This skill exists because frontier coding models frequently fail on HTMX systems due to:
- unstable DOM lifecycle reasoning,
- incorrect assumptions about HTMX initialization,
- architectural drift toward imperative SPA behavior,
- and weak runtime observability discipline.

The objective is to preserve HTMX's declarative model and avoid accidental reconstruction of a client-side framework.

---

# Core Operating Principles

## Principle 1 — HTMX Is Stateful

HTMX is not:
- React,
- Vue,
- jQuery,
- or a generic delegated event layer.

HTMX maintains lifecycle and initialization state internally.

DOM provenance matters.

The agent MUST reason about:
- when elements were inserted,
- how they were inserted,
- whether HTMX processed them,
- and whether listeners/lifecycle hooks are active.

Never assume:
- moved nodes behave like swapped nodes,
- cloned nodes preserve HTMX behavior,
- or string-assigned HTML is automatically activated.

---

## Principle 2 — Prefer Declarative HTMX

Default to HTMX primitives first:
- `hx-get`
- `hx-post`
- `hx-trigger`
- `hx-target`
- `hx-swap`
- `hx-select`
- `hx-select-oob`
- `hx-vals`
- `hx-include`
- `hx-params`

Prefer:
- HTML fragments,
- server-rendered partials,
- swap semantics,
- attribute-driven behavior.

Avoid:
- imperative fetch wrappers,
- custom AJAX orchestration,
- synthetic state layers,
- ad hoc client-side stores.

The agent MUST justify any escape from HTMX.

---

## Principle 3 — Preserve Architectural Simplicity

HTMX systems degrade rapidly when hybridized.

Do not incrementally rebuild:
- React,
- Redux,
- SPA routers,
- client-side synchronization layers.

Every imperative addition requires explicit justification.

The simplest HTMX-compatible solution is usually correct.

---

# Mandatory Runtime Verification

## Never Infer Runtime Behavior

The agent MUST NOT conclude browser behavior from static reasoning alone.

All lifecycle assumptions must be verified through instrumentation.

Before changing architecture:
1. instrument events,
2. observe actual runtime behavior,
3. inspect the DOM,
4. inspect requests,
5. then modify code.

---

## Required Event Instrumentation

When HTMX behavior is unclear, instrument:

```js
[
  "htmx:beforeRequest",
  "htmx:afterRequest",
  "htmx:beforeSwap",
  "htmx:afterSwap",
  "htmx:responseError",
  "htmx:sendError",
  "htmx:targetError"
].forEach(name => {
  document.body.addEventListener(name, e => {
    console.log("[HTMX EVENT]", name, e.target, e.detail);
  });
});
```

The agent MUST use observed evidence instead of hypothetical lifecycle reasoning.

---

## Required Runtime Assumption Audit

After major DOM-related changes, the agent MUST explicitly verify:

```md
## Runtime Assumptions
- Does the element exist in the live DOM?
- Was the element HTMX-processed?
- Which event fires first?
- Is behavior delegated or directly attached?
- Is network IO occurring?
- Is swap behavior occurring?
- Is focus preserved?
- Are duplicate IDs present?
- Was the node cloned, moved, or recreated?
```

---

# HTMX Lifecycle Rules

## Rule: Newly Inserted DOM May Require `htmx.process()`

If content is inserted via:
- `innerHTML`,
- `outerHTML`,
- template cloning,
- manual DOM APIs,
- detached fragments,
- or external rendering,

the agent MUST verify whether:
- HTMX attributes became active,
- events fire,
- requests occur.

If not, the agent MUST evaluate:
- `htmx.process(node)`

The agent MUST NOT assume automatic processing.

---

## Rule: Moving Nodes Is Semantically Significant

`appendChild`, `replaceChild`, `insertBefore`, and reparenting operations can affect:
- focus,
- listener behavior,
- HTMX state,
- browser semantics.

Moved nodes are not equivalent to:
- swapped nodes,
- recreated nodes,
- or server-returned nodes.

The agent MUST verify behavior after movement operations.

---

## Rule: Cloning Nodes Is Dangerous

`cloneNode(true)` is a red-flag operation.

Cloning duplicates:
- DOM structure,
- IDs,
- attributes,
- and some browser state assumptions,

but NOT framework runtime state.

Before cloning, the agent MUST explain:
- why cloning is required,
- why movement is insufficient,
- and what state must be preserved.

---

## Rule: Avoid OuterHTML String Mutation

Prefer:
- server swaps,
- fragment replacement,
- DOM APIs,
- HTMX swap semantics.

Avoid:
- raw `outerHTML = "..."`
- multi-line HTML string mutation.

This frequently destroys:
- listener state,
- focus state,
- HTMX initialization state.

---

# Imperative Escape Hatch Rules

## Rule: Do Not Introduce `fetch()` Prematurely

Before replacing HTMX behavior with imperative fetch logic, the agent MUST:

1. explain why HTMX cannot express the interaction,
2. verify the issue is not caused by unprocessed DOM,
3. verify lifecycle events are actually firing,
4. verify requests are actually absent,
5. verify swap configuration is correct.

The agent MUST treat manual fetch as an architectural escape hatch.

---

## Rule: Minimize Client State

Avoid:
- global mutable state,
- window-scoped coordination,
- synthetic edit-state registries,
- client-side caches,
- duplicated source-of-truth systems.

Prefer:
- DOM-derived state,
- server authority,
- attribute-driven coordination.

---

# Debugging Methodology

## Required Debugging Order

When browser behavior is unclear:

1. Verify the DOM state.
2. Verify event propagation.
3. Verify HTMX processing state.
4. Verify request emission.
5. Verify server response.
6. Verify swap behavior.
7. Verify post-swap DOM.
8. Only then modify architecture.

The agent MUST NOT skip observability steps.

---

## Anti-Pattern: Recursive Patch Stacking

The agent MUST avoid:
- layering fixes on unverified assumptions,
- preserving old hacks after root-cause discovery,
- compensating for earlier incorrect patches.

After root cause discovery:
- remove obsolete workarounds,
- simplify aggressively,
- restore declarative structure.

---

## Anti-Pattern: Placeholder Logic Drift

Comments are not implementation.

The agent MUST verify:
- every planned handler exists,
- every referenced function executes,
- every placeholder was replaced.

Especially verify:
- inline callbacks,
- deferred handlers,
- TODO placeholders,
- “handled later” comments.

---

# TypeScript Backend Guidance

## Server Responsibilities

The backend should:
- own canonical state,
- render stable HTML fragments,
- emit semantically complete responses,
- preserve deterministic IDs.

Prefer:
- typed render pipelines,
- typed route contracts,
- typed fragment generation.

Avoid:
- partial fragments with hidden assumptions,
- fragments requiring client-side repair.

---

## Fragment Stability

Server-rendered fragments should:
- be structurally complete,
- avoid duplicate IDs,
- preserve target invariants,
- support direct swap insertion.

The agent MUST validate:
- swap target correctness,
- nesting correctness,
- and HTML validity.

---

## HTML Fragment Discipline

Fragments should ideally:
- represent coherent UI regions,
- avoid partial tag structures,
- avoid invalid nesting,
- avoid “HTML surgery” patterns.

Prefer:
- whole-component swaps,
- stable container boundaries.

---

# Browser Debugging Expectations

The agent already has browser-control tooling available.

The agent MUST use browser tooling to:
- inspect live DOM,
- inspect active listeners,
- inspect requests,
- inspect console output,
- inspect computed attributes,
- inspect focus state,
- verify actual rendered layout.

Do not rely solely on static reasoning.

---

# HTMX Red Flags

The following operations are high-risk and require explicit justification:

- `cloneNode(true)`
- `outerHTML =`
- manual swap orchestration
- fetch()+HTMX hybrids
- custom client-side synchronization
- global edit state
- synthetic focus management
- nested HTMX trigger chains
- duplicate IDs
- dynamic ID generation without determinism
- inline JS state machines
- server fragments depending on client mutation repair

---

# Preferred Patterns

Prefer:
- stable IDs,
- server authority,
- declarative attributes,
- fragment swaps,
- small HTML responses,
- explicit targets,
- explicit triggers,
- isolated UI regions,
- event instrumentation,
- deterministic DOM structure.

---

# Required Post-Change Verification

After significant changes, verify:

```md
## Verification Checklist

- HTMX requests fire correctly
- Expected lifecycle events fire
- Swap targets are correct
- Re-rendered elements remain interactive
- No duplicate IDs exist
- Focus behavior is correct
- Browser history behavior is correct
- Inserted elements are HTMX-active
- No obsolete workaround code remains
- No hidden imperative state was introduced
```

---

# Final Constraint

The goal is not merely "make it work."

The goal is:
- preserve HTMX architecture,
- preserve declarative behavior,
- preserve server authority,
- preserve runtime simplicity,
- and minimize irreversible frontend complexity.

The agent MUST optimize for:
- correctness,
- observability,
- simplicity,
- and architectural integrity.
