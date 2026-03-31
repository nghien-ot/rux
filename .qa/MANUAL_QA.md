# Rux — manual QA (linked `dist`)

This folder exercises the **published entry** (`import … from "@nghienot/rux"` → `dist/`), not `src/`. The canonical automated suite remains in [`tests/`](../tests/).

## Prerequisites

- [Bun](https://bun.sh) installed
- From repo root: `bun install` (installs `@nghienot/rux@file:.` into `node_modules/@nghienot/rux` for local resolution)

## Build, link (optional), run

1. **Build** — always refresh `dist/` before manual QA:

   ```bash
   bun run build
   ```

2. **Link** — only if `import "@nghienot/rux"` fails (e.g. you removed `node_modules`). From repo root:

   ```bash
   bun link
   ```

   Then, in this project, `bun link @nghienot/rux` if needed so `node_modules/@nghienot/rux` resolves.

3. **Manual QA (mocked fetch)** — rebuild + run `.local/text.ts` (Bun requires an explicit `./` path when the filename has no `.test` in it):

   ```bash
   bun run qa:manual
   ```

   Or: `bun run build` then `bun test ./.local/text.ts`.

### PowerShell (Windows)

```powershell
Set-Location path\to\rux
bun run qa:manual
```

### Recording results

After a run, append a row to **Results** below (or paste `bun test` output):

```powershell
bun run qa:manual 2>&1 | Tee-Object -FilePath .local\last-run.txt
```

## Live API verification (optional, network)

**Off by default.** Requires outbound HTTPS.

| Host | Purpose |
|------|---------|
| [JSONPlaceholder](https://jsonplaceholder.typicode.com) | Real GET/POST JSON |
| [HTTPBin](https://httpbin.org) | Echo query, forced 404 |

**Unix / macOS:**

```bash
bun run build
RUN_LIVE_API=1 bun test ./.local/live-api.test.ts
```

**Windows PowerShell:**

```powershell
$env:RUN_LIVE_API = '1'
bun run build
bun test ./.local/live-api.test.ts
```

Schemas in `live-api.test.ts` were aligned to typical responses; re-check with `curl` if an API changes shape.

## Known behaviors and footguns

- **Path substitution** only replaces segments like `:id[string]`, `:n[number]`, `:flag[boolean]`. A plain `:id` in the path string is **not** replaced at runtime.
- **Typed `params`** in `CallOptions` only appear when the path uses that **bracket DSL**; legacy `:id` gives **no** required `params` at compile time.
- **Client error modes** are `"result"`, `"throw"`, `"fallback"` (with `defaultValue`). **`handleValidation`** uses `"result"`, `"throw"`, and **`"default"`** plus a **`fallback`** argument — different names on purpose.
- **`unwrapOrThrow`** throws the **`RuxError` object**, not `instanceof Error`.
- **Query values** that are plain objects (not arrays) are **skipped** when building the query string; `null` becomes an empty string for that key; `undefined` omits the key.
- **`JSON.stringify` on `body`** is not wrapped: circular structures or `BigInt` can **reject** the call promise.
- **Invalid `baseUrl`** for `new URL()` throws **before** `fetch`.
- **`resolveResult`** has no `default` branch: a bogus runtime `errorMode` yields **`undefined`**.

## Results

| Date (UTC) | Command | Outcome | Notes |
|------------|---------|---------|-------|
| | | | |

### Live API runs

| Date (UTC) | `RUN_LIVE_API=1` | Outcome | Notes |
|------------|------------------|---------|-------|
| | | | |
