# Rux v1 Layered Standard-Schema Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development. Tests must be approved before implementation.

**Goal:** Replace Rux custom schemas and conditional error modes with a Standard Schema v1 HTTP client supporting direct Zod compatibility and layered request options.

**Architecture:** Standard Schema v1 is the only validation boundary. Zod is accepted structurally through `~standard.validate`, without a Zod import or runtime dependency. Request options merge client → endpoint → invocation; headers merge case-insensitively.

**Tech Stack:** TypeScript, Vitest, Vite, Standard Schema v1, optional dev-only Zod integration tests.

## Global Constraints

- Breaking API allowed.
- No runtime Zod dependency.
- No custom plain-object schema DSL.
- No `errorMode`; endpoint calls always return `Promise<RuxResult<Success, Failure>>`.
- No auth-specific configuration.
- No automatic retries.
- Tests use Vitest and typecheck with `vitest run --typecheck`.
- Test Author writes tests before implementation.
- Test Reviewer explicitly approves tests before implementation.
- Every implementation task receives task review before next task.
- Final whole-branch review required.

### Task 1: Test Author — define complete v1 contract

Files: modify `tests/types.test.ts`, `tests/client.test.ts`, `tests/validate.test.ts`; create `tests/standard-schema.test.ts`.

Write failing tests only. Cover Standard Schema sync/async validation, actual Zod through Standard Schema, parsed transforms, `Infer`/`InferInput`/`InferOutput`, typed body/query/response/error, layered request precedence, header merging, endpoint-only method, timeout/abort, typed bracket params, validation before fetch, empty/204 responses, typed HTTP errors, request/network/HTTP/validation failures, ESM/CJS imports, and bundle exclusion of Zod.

Run `bun run test`; confirm failures are caused by missing v1 behavior. Do not modify `src/`.

### Task 2: Test Reviewer — approve test suite

Review Task 1 tests against this plan. Reject weak assertions, missing edge cases, implementation assumptions, or type gaps. Test Author revises until explicit `APPROVED`.

### Task 3: Standard Schema core

Files: modify `src/schema/types.ts`, `src/schema/validate.ts`, `src/types/index.ts`.

Implement structural Standard Schema v1 types with `~standard.validate`, standard issue types, `InferInput<S>`, `InferOutput<S>`, and `Infer<S> = InferOutput<S>`. Add one async validation path returning parsed output and normalized `RuxResult`. Remove custom schema runtime and inference.

Public validation helper returns `Promise<RuxResult<InferOutput<S>>>`.

### Task 4: Layered HTTP client

Files: modify `src/client/index.ts`, `src/types/index.ts`.

Implement `createClient` and flat endpoint definitions:

```ts
type RequestOptions = Omit<RequestInit, "method" | "body">;

type EndpointDefinition = {
  method: HttpMethod;
  path: ValidPath;
  request?: RequestOptions;
  query?: StandardSchema;
  body?: StandardSchema;
  response?: StandardSchema;
  error?: StandardSchema;
};

type ClientConfig = {
  baseUrl: string;
  request?: RequestOptions;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  endpoints: Record<string, EndpointDefinition>;
};
```

Invocation options contain `params`, typed `query`, typed `body`, `request`, and timeout override. Scalar request options resolve invocation → endpoint → client. Headers merge case-insensitively. Method is endpoint-only. Body/query validate and serialize parsed output. Response/error validate and return parsed output. Optional response supports empty success body as `undefined`. Add `request`, `network`, `http`, and `validation` error variants.

### Task 5: Public surface and packaging

Files: modify `src/index.ts`, `package.json`, `.github/workflows/publish.yaml`, `README.md`, `.qa/MANUAL_QA.md`; create `LICENSE`.

Export v1 API. Add ESM/CJS/types `exports`. Remove old package references and QA filename mistakes. Add license metadata. CI runs install, typecheck, tests, build, and package smoke checks. Documentation covers Standard Schema/Zod, layered options, errors, and migration.

### Task 6: Verification and final review

Run `bun run test`, `bun run typecheck`, `bun run build`, `bun run qa:manual`, and `npm pack --dry-run`. Verify generated declarations contain no Zod import and bundle contains no Zod runtime code. Dispatch final whole-branch reviewer with full diff package. Fix Critical/Important findings and repeat verification.
