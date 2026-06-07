# CLAUDE.md

Guidance for Claude Code working in this repo. User instructions override this file.

## What this is

**TechnologyOne Analyser** (`t1-analyser`) — browser-only utility that parses TechnologyOne
`.t1etlp` (ETL) and `.t1dm` (Data Model) files, stores them locally in IndexedDB, and renders
technical views + downloadable `.docx` reports. **Local-first, air-gapped, zero data
exfiltration** — `OfflineVerifier` blocks the UI until the device is confirmed offline. No
backend, no telemetry, no network calls in the data path.

## Stack

- **Vite** (rolldown-vite) + **TypeScript** (strict-ish, no framework — vanilla DOM)
- **Tailwind v4** styling
- **Dexie** (IndexedDB) — `src/lib/db.ts`, stores `reports` + `dataModels`
- **fast-xml-parser** — XML ingestion
- **docx** — Word export; **mermaid** — flow diagrams (lazy-loaded); **jszip** — archive reads
- **Vitest** + jsdom tests; **pnpm@11.1.2** (pinned)

## Architecture

`src/main.ts` = central controller (state, routing, `render()` loop, HTML template fns,
`window.*` global event handlers). Core logic in `src/lib/`:

- `FileProcessor.ts` — ingestion gateway: detect type → parse → store
- `parsers/` — `EtlParser`, `DataModelParser`, `DashboardParser`, `StepDescriptors`, shared `types.ts`
- `generators/` — return **HTML strings** (`EtlGenerator`, `DataModelGenerator`, `DashboardGenerator`),
  `DocxGenerator` (+`DocxPrimitives`), `MermaidGenerator`, `EtlSummary`
- `formatters/ExpressionFormatter.ts` — text colourising + **`escapeHtml`**
- `ux/OfflineVerifier.ts` — air-gap enforcement overlay

See `docs/ARCHITECTURE.md`, `docs/API_REFERENCE.md`, `docs/FILE_FORMATS.md` for depth.

## Conventions — follow these

### Security: escape ALL file-derived text in HTML
Generators build HTML via string concatenation. Every file-derived value interpolated into an
HTML string (incl. `innerHTML`/`insertAdjacentHTML` sinks) **MUST** pass through
`ExpressionFormatter.escapeHtml()` — UNLESS it goes through `colouriseTextHTML` (which escapes
internally). XSS has regressed here 3× (SmartDesc, `main.ts` itemRow, `EtlGenerator`). Treat
unescaped interpolation of parsed XML as a bug.

### Typing: no `any` on the XML spine
Deep XML is typed via `XmlNode`/`XmlValue`/`asNode()` in `parsers/types.ts`. Don't reintroduce
`any` in parsers/generators. Guard falsy values explicitly (`val == null`, not `!val`) — `0`,
`''`, and seq-`0` are valid data. Extract text via `EtlParser.getTextSafe` / `#text` handling.

### Tests: fixture-driven
Tests live in `tests/`, named `<Module>.test.ts`. Pattern is fixture-based — feed XML, assert
parsed/rendered output (see `EtlParser.KitchenSink.test.ts`, `StepDescriptors.test.ts`). Sample
files in `samples/{ETLs,Data Models,Dashboards,...}`. Add a fixture + expected output for every
new step type or edge case.

### Commits / releases
Conventional Commits enforced by commitlint + Husky. `semantic-release` cuts versions from
commit history — `feat:`/`fix:` matter. lint-staged runs `eslint --fix` + `prettier` on commit.

### Never hand-edit lockfiles
`pnpm-lock.yaml` and `pnpm-workspace.yaml` regenerate via pnpm. Hand-edits have caused
`ERR_PNPM_IGNORED_BUILDS` and broken CI repeatedly. Change deps via `pnpm` commands, not by
editing these files.

## Commands

```bash
pnpm dev            # vite dev server (port 5173)
pnpm build          # tsc + vite build + service-worker build
pnpm test           # vitest (watch)
pnpm test:coverage  # vitest run --coverage
pnpm lint           # eslint src
pnpm lint:fix       # eslint --fix
pnpm format         # prettier --write src
```

## Verifying UI changes

App is browser-rendered. To verify a render change: start `pnpm dev`, load a sample from
`samples/ETLs/` (e.g. `FPR_TRANS_*.t1etlp`), check the flow diagram renders + console is clean.
Chrome DevTools MCP is available for real screenshots / console / network / Lighthouse — prefer
it over DOM-only assertions. See the `verify-app` skill.

## Style

Prettier: 4-space indent, single quotes, semicolons, 120 print width, ES5 trailing commas.
