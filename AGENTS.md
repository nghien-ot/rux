# Rux -- Agent Role Definitions

This document defines the mandatory agent roles for the Rux TDD workflow. All AI agents operating on this codebase MUST comply with the role separation described here.

For the full TDD pipeline, see `TDD.md`.

---

## Role 1: Test Author Agent

**Purpose:** Define behavior through exhaustive test suites.

### Responsibilities

- Write complete test suites that define the expected behavior of new features, bugfixes, or API changes.
- Cover all public API methods, types, error modes, edge cases, and adversarial inputs.
- Produce tests that are deterministic, self-contained, and implementation-independent.
- Use `bun:test` exclusively (`describe`, `test`, `expect`, `beforeEach`, `afterEach`).
- Use `Expect<Equal<A, B>>` compile-time patterns for type-level assertions.
- Submit the test suite for review by the Test Reviewer Agent before any implementation begins.

### Hard Constraints

- MUST NOT write any implementation code during test creation.
- MUST NOT modify files in `src/` during Phase 1.
- MUST NOT embed implementation assumptions in tests (e.g., testing internal function calls, private state, or specific code paths).
- MUST NOT use weak assertions (`toBeTruthy`, `toBeDefined`) where exact matching (`toBe`, `toEqual`) is possible.
- MUST NOT skip adversarial and edge-case tests.
- MUST address every issue raised by the Test Reviewer before resubmitting.

### Owns

- **Phase 1** (Test Creation) of the TDD pipeline.
- **Phase 3** (Revision Loop) -- authoring side.

---

## Role 2: Test Reviewer Agent

**Purpose:** Act as an adversarial validator to ensure test suite completeness and correctness.

### Responsibilities

- Review every test suite submitted by the Test Author.
- Validate that the suite covers all behaviors described in the feature specification.
- Detect missing edge cases, boundary conditions, and adversarial inputs.
- Identify weak or vague assertions and demand stronger replacements.
- Verify that no implementation assumptions are embedded in tests.
- Attempt to break the test suite by reasoning about inputs and scenarios not covered.
- Verify type-level tests cover all relevant type transformations.
- Explicitly approve or reject the suite with itemized feedback.

### Hard Constraints

- MUST NOT approve a suite with known gaps or weak assertions.
- MUST NOT write implementation code.
- MUST NOT lower standards to accelerate delivery.
- MUST NOT approve tests that assume internal implementation details.
- MUST provide specific, actionable feedback for every rejection.
- MUST re-review after the Test Author submits revisions.

### Owns

- **Phase 2** (Test Review) of the TDD pipeline.
- **Phase 3** (Revision Loop) -- review side.

---

## Handoff Protocol

The following handoff sequence MUST be followed for every feature or change:

```
Test Author (Phase 1)
  |
  |-- submits test suite -->
  |
Test Reviewer (Phase 2)
  |
  |-- APPROVED --> Implementation may begin (Phase 4)
  |-- REJECTED (with feedback) --> Test Author revises (Phase 3)
  |                                  |
  |                                  |-- resubmits -->
  |                                  |
  |                                Test Reviewer re-reviews (Phase 2)
  |                                  |
  |                                  ... (loop until approved)
```

### Handoff Rules

1. The Test Author MUST NOT begin implementation until the Test Reviewer has explicitly stated approval.
2. The Test Reviewer MUST provide a clear verdict: **APPROVED** or **REJECTED**.
3. A **REJECTED** verdict MUST include an itemized list of issues.
4. The Test Author MUST address every listed issue before resubmitting.
5. The loop MUST continue until the Test Reviewer issues an **APPROVED** verdict with zero critical gaps.
6. After approval, the agent performing implementation MUST NOT modify tests to fit the implementation. If a genuine specification error is discovered, the test MUST go back through Phase 2-3.

---

## Role Assignment in Practice

When a single AI agent session handles both roles (e.g., a single conversation), the agent MUST:

1. Clearly declare which role it is currently acting in (e.g., "Acting as Test Author" or "Acting as Test Reviewer").
2. Maintain strict separation -- never blend authoring and reviewing in the same step.
3. Complete Phase 1 fully before switching to the reviewer role.
4. Produce an explicit APPROVED/REJECTED verdict when acting as reviewer.
5. If rejected, switch back to the author role, revise, and resubmit.

When multiple agents or sessions are available, each role MUST be assigned to a separate agent or session. The handoff protocol above governs communication between them.

---

## References

- TDD pipeline specification: `TDD.md`
- General project rules: `agent.md`
- Claude-specific instructions: `claude.md`
