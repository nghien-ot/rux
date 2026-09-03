# Rux v1 manual QA

Run from the repository root after dependencies are installed:

```bash
bun run typecheck
bun run test
bun run build
bun run qa:manual
npm pack --dry-run
```

`qa:manual` rebuilds `dist/` and runs the package-surface smoke test at [`tests/package.test.ts`](../tests/package.test.ts). It verifies ESM and CommonJS self-imports and confirms neither output bundle contains Zod runtime code.

Confirm the packed package contains `dist/`, `README.md`, and `LICENSE`. Inspect `dist/index.d.ts` for an absence of `zod` imports. The release must retain an empty runtime `dependencies` object in `package.json`.

For a consumer smoke test, install the packed tarball into a temporary application and import `createClient` from `@nghien-ot/rux` using both ESM and CommonJS.
