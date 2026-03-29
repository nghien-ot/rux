# Rux -- Test-Driven Development Specification

This document defines the **mandatory** TDD workflow for the Rux project. Every rule here is **non-optional**. All agents, contributors, and tooling MUST comply.

---

## Core Principle

**Tests are the single source of truth.** Tests define behavior, types, and constraints. Implementation exists only to satisfy tests. Any workflow that produces implementation before validated tests is a failure.

---

## Mandatory Pipeline

Every feature, bugfix, or API change MUST follow this four-phase pipeline in order. No phase may be skipped.

### Phase 1 -- Test Creation

The **Test Author Agent** (see `AGENTS.md`) MUST produce a complete test suite before any implementation begins.

**Requirements:**

- All tests MUST use `bun:test` (`describe`, `test`, `expect`, `beforeEach`, `afterEach`).
- Test files MUST live in `tests/` with `.test.ts` extension.
- The suite MUST cover:
  - All client methods and public API surface relevant to the change
  - All declared types and their constraints
  - All edge cases (empty inputs, boundary values, null/undefined handling)
  - All invalid inputs (wrong types, missing required fields, malformed data)
  - Optional vs required field behavior
  - All error modes (`result`, `throw`, `default`) where applicable
  - Type-level assertions using `Expect<Equal<A, B>>` patterns
- Tests MUST be:
  - **Deterministic** -- identical results on every run, no timing or ordering dependencies
  - **Self-contained** -- no shared mutable state between tests; mock setup/teardown in each test or describe block
  - **Implementation-independent** -- tests MUST NOT assume internal structure; they MUST test only public behavior

**Prohibited during Phase 1:**

- Writing any implementation code
- Modifying any file in `src/`
- Referencing implementation details in test assertions

### Phase 2 -- Test Review

A **Test Reviewer Agent** (see `AGENTS.md`) MUST review the test suite before implementation begins.

**The reviewer MUST:**

- Validate completeness against the feature specification
- Detect missing edge cases and boundary conditions
- Identify weak or vague assertions (e.g., `toBeTruthy()` where `toBe(specificValue)` is appropriate)
- Ensure no implementation assumptions are embedded in tests
- Attempt to identify inputs or scenarios that could break the test suite
- Verify type-level tests cover all relevant type transformations
- Confirm tests are deterministic and self-contained

**The reviewer MUST NOT:**

- Approve a suite with known gaps
- Weaken standards to accelerate delivery
- Write implementation code

### Phase 3 -- Revision Loop

If the Test Reviewer identifies issues:

1. The Test Author MUST address every issue raised.
2. The revised suite MUST be re-submitted for review.
3. This loop MUST repeat until the reviewer finds no critical gaps.

**Exit criteria:**

- Zero critical gaps identified by the reviewer
- All edge cases addressed
- All assertions are strong and specific
- No implementation assumptions remain

### Phase 4 -- Implementation

Implementation is allowed **ONLY** after the Test Reviewer has explicitly approved the test suite.

**Rules during implementation:**

- The implementation MUST satisfy all existing tests without modification to those tests.
- If a test reveals a genuine specification error, the test MUST be updated through Phase 2-3 (reviewer approval required) before the implementation changes.
- Tests MUST NOT be weakened, loosened, or deleted to accommodate implementation.
- After implementation, run `bun test` -- all tests MUST pass.
- After tests pass, run `bun run build` -- build MUST succeed.

---

## Test Quality Standards

These standards apply to every test in the repository.

### Coverage

- **100% behavioral coverage.** Every public method, every error mode, every type constraint MUST have corresponding tests.
- Coverage means behavioral coverage, not line coverage. A test suite that exercises all behaviors is complete even if some internal code paths are unreachable.

### Assertions

- All assertions MUST be **strong and specific**. Use exact value matching (`toBe`, `toEqual`, `toStrictEqual`) over loose checks (`toBeTruthy`, `toBeDefined`).
- Error assertions MUST validate the error type discriminant (`network`, `validation`, `http`) and relevant error fields.
- Type-level assertions MUST use `Expect<Equal<A, B>>` compile-time patterns.

### Input/Output Definitions

- Every test MUST define explicit inputs and expected outputs.
- Mock data MUST be realistic and representative of actual API responses.
- `globalThis.fetch` MUST be mocked and restored per test or describe block.

### Adversarial Cases

Every test suite MUST include:

- Invalid type inputs (string where number expected, etc.)
- Missing required fields
- Extra/unexpected fields
- Empty strings, empty arrays, empty objects
- Null and undefined where applicable
- Malformed URLs, invalid HTTP methods
- Network failure simulation
- HTTP error status codes (4xx, 5xx)

---

## Enforcement

- Any pull request, commit, or agent action that introduces implementation without validated tests MUST be rejected.
- Any test suite that does not meet the quality standards above MUST NOT be approved.
- The word "should" MUST NOT appear in any rule in this document or its derivatives. All rules use "MUST" or "MUST NOT".

---

## References

- Agent roles and responsibilities: `AGENTS.md`
- General project rules: `agent.md`
- Claude-specific instructions: `claude.md`
