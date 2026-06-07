# ETL Advanced Logic — StartProcess / Script / DTS / Group

**Date:** 2026-06-07
**Roadmap item:** *Advanced Logic — Better distinct handling for `StartProcess`, `Script`, and `DTS` tasks.*
**Status:** Approved design, pre-implementation.

## Problem

The ETL parser renders four step types poorly:

- **`Group`** — a labeled container holding child steps. Currently shows the literal
  word "Group" instead of its real name (e.g. *"Prep Chart of Accounts"*). Verified
  against sample data.
- **`StartProcess` / `Script` / `DTS`** — control-flow tasks that run a sub-process,
  execute a script, or invoke a DTS package. They fall to the generic fallback
  (`contextText = stepType`), get no icon, no flow label, no inputs/outputs, and no
  explicit-output lineage. DTS has zero handling at all.

## Confidence tiers

This work splits into two tiers with different verification stories.

### Tier A — verified (`Group`)

Backed by real sample data
(`samples/extraction/AFRG_I&E_CHART_.../Steps.xml`, StepId 22). The `Group`
`StorageObject` carries only a `DefKey`; the display label is the step's `<Name>`.
Children attach via `ParentStepId`. This is a provable bug-fix.

### Tier B — inferred (`StartProcess` / `Script` / `DTS`)

**No sample files contain these step types**, and a web search confirmed
TechnologyOne's ETL XML field names are proprietary and undocumented. The existing
parser code for `Script` / `StartProcess` (EtlParser.ts lines ~797–822) is the prior
author's guesswork.

Tier B is therefore built as **defensive multi-key extraction**: each field is read
by trying several candidate names, the whole descriptor is wrapped in try/catch, and
an unexpected shape degrades to today's generic behavior rather than crashing the
report. Correctness is locked in by **fixture-based tests** that model the *assumed*
schema; when a real file is supplied, the fixtures get corrected and the failing test
is the verification signal. Candidate field names are documented as UNVERIFIED.

## Architecture

Three focused units. The parser's `traverse()` is already ~470 lines; rather than
add four more `else if` blocks, the four target types move into a dedicated
descriptor module. Unrelated step types are left untouched.

### Unit 1 — `src/lib/parsers/StepDescriptors.ts` (new)

A lookup keyed by step type. Each entry is a pure function returning a descriptor.

```ts
export interface StepDescriptor {
  contextText: string;
  flowLabel: string;
  details: string[];
  inputs: string[];
  outputs: string[];
  explicitOutput: { type: string; name: string } | null;
  icon?: string;
  smartDesc?: string;
}

export interface DescriptorHelpers {
  getTextSafe: (v: XmlValue) => string;
  getListSafe: (v: XmlValue, key: string) => XmlNode[];
  firstOf: (storage: XmlNode, keys: string[]) => string; // defensive multi-key reader
}

// `step` is the raw step node with the parser-grafted `children` array
// (RawStep = XmlNode & { children?: RawStep[] }), so the Group descriptor can
// read its child count. RawStep is exported from EtlParser for this purpose.
export type DescriptorFn =
  (storage: XmlNode, step: RawStep, h: DescriptorHelpers) => StepDescriptor;

export const STEP_DESCRIPTORS: Record<string, DescriptorFn>;
```

Helpers are injected so the module stays decoupled from `EtlParser` statics and is
unit-testable in isolation.

### Unit 2 — `src/lib/parsers/EtlParser.ts` (edit)

In `traverse()`, when `STEP_DESCRIPTORS[stepType]` exists, call it (inside try/catch)
and merge the descriptor into the existing `info` object. All other types keep their
current inline logic. `getExplicitOutput()` delegates to the descriptor's
`explicitOutput` for these four types.

Fallback: on a descriptor throw, retain today's generic `contextText = stepType`
behavior.

`RawStep` (currently a private `type` alias in `EtlParser.ts`) is exported so the
descriptor module and its signature can reference it.

### Unit 3 — render paths (edit)

- **`EtlGenerator.renderStep`** — add `StartProcess`/`Script`/`DTS` to the icon map.
  `Group` already renders as a container via the `isGroup` array; it now receives a
  real label through `Step`/`Context`.
- **`MermaidGenerator.generateMermaidSyntax`** — add shape + class for the three new
  standard-step types. `Group` already renders as a subgraph; no change needed.
- **`EtlSummary`** — **no change.** `StartProcess`/`Script`/`DTS` are control-flow,
  not data I/O, so they correctly contribute nothing to sources/targets.

## Data flow

```
Steps.xml → FileProcessor → report.rawSteps
  → EtlParser.parseSteps()
      → traverse(step):
          STEP_DESCRIPTORS[type] present? → describe() (try/catch) → merge into info
          else → existing inline logic
  → executionTree / executionFlow
      → EtlGenerator (HTML + icons)
      → MermaidGenerator (shapes/classes)
      → EtlSummary (narrative — unchanged)
```

## Type changes

One additive, optional field on `EtlStep`:

```ts
/** Display glyph for this step type (single source of truth for HTML + Mermaid). */
Icon?: string;
```

No other `EtlStep` changes. Descriptors fill existing fields
(`Context`, `FlowLabel`, `Details`, `Inputs`, `Outputs`, `Output`, `SmartDesc`).

## Per-type detail

### Group (Tier A — verified)

- `contextText` / `flowLabel` = step `Name` (e.g. *"Prep Chart of Accounts"*)
- `smartDesc` = `"Groups N steps"` (child count)
- no inputs/outputs, no `explicitOutput`
- icon `🗂️`

### StartProcess / RunProcess (Tier B — inferred)

- process name: `firstOf(['ProcessName','ProcessToRun','Process','SubProcessName'])`
- parameters: `getListSafe(storage.Parameters, 'ParameterItem')` → `Param: <name> = <value>`
- `flowLabel` = `"Run: <proc>"`
- `explicitOutput` = `{ type: 'PROCESS', name: <proc> }`
- icon `▶`

### Script / ExecuteScript (Tier B — inferred)

- language: `firstOf(['ScriptLanguage','Language'])`
- body preview: `firstOf(['ScriptText','Script'])`, truncated to 150 chars
- `flowLabel` = `"Script: <lang>"` (or `"Script"` if no language)
- icon `📜`

### DTS / ExecuteDTS / RunDTS (Tier B — inferred, currently zero handling)

- package name: `firstOf(['DTSPackageName','PackageName','DTSPackage','Package'])`
- connection/config: `firstOf(['ConnectionString','Connection','DTSConnection'])`
- `flowLabel` = `"DTS: <pkg>"`
- icon `🔀`

## Error handling

Each descriptor invocation is wrapped in try/catch inside `traverse()`. A throw
(malformed or unexpected Tier-B shape) falls back to today's generic behavior —
the step still renders with its type name; the report never crashes. This mirrors
the existing `flattenLogic` try/catch philosophy.

## Testing

Extend `src/lib/parsers/EtlParser.test.ts` (and/or a new
`StepDescriptors.test.ts`):

- **Group (real data):** parse the `AFRG_I&E_CHART` sample, assert the Group step's
  label is *"Prep Chart of Accounts"*, children are attached, and `smartDesc`
  reflects the child count.
- **StartProcess / Script / DTS (fixtures):** hand-authored fixture XML under
  `src/lib/parsers/__fixtures__/` modeling the inferred shapes. Tests prove the
  descriptor extracts correctly *given the assumed schema*.
- **Defensive:** a `StartProcess` step missing every candidate key → asserts graceful
  fallback with no throw.

## Documentation

Add a note (in `docs/FILE_FORMATS.md` or a new `docs/ETL_STEP_TYPES.md`) marking the
Tier-B field names as **UNVERIFIED**, listing the candidate-key sets, so the
assumption is explicit and easy to correct when a real file arrives.

## YAGNI cuts

- No new `EtlStep` fields beyond optional `Icon`.
- No narrative change for sub-processes (control-flow ≠ data lineage).
- No Mermaid Group rewrite (already works).
- Scope limited to the four named types; no broad `traverse()` refactor.

## Out of scope / follow-ups

- Migrating other inline step types into `StepDescriptors.ts` (future cleanup once
  the pattern proves out).
- Verifying Tier-B field names against a real `.t1etlp` (blocked on sample
  availability).
