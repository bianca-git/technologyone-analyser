---
name: gen-etl-fixture
description: Scaffold a fixture-based Vitest test for a new ETL step type or parsing edge case in the T1 Analyser. Use when adding support for a new .t1etlp step type, reproducing a parse bug from a user-reported file, or asked to "add a fixture", "write an ETL test", or "cover this step type". User-invoked.
disable-model-invocation: true
---

# Generate ETL Fixture Test

Tests here are **fixture-driven**: feed XML, assert the parsed/rendered output. This skill
scaffolds a new fixture test matching that pattern (see `tests/EtlParser.KitchenSink.test.ts`
and `tests/StepDescriptors.test.ts` for the canonical style).

## Inputs to gather

1. **Step type / scenario** — the `RawType` discriminator or the edge case (e.g. a new
   `MergeWarehouse` step, or "DTS step with empty Outputs").
2. **Source XML** — either a real snippet from a user file under `samples/ETLs/`, or a minimal
   handcrafted `.t1etlp` fragment. Prefer the smallest XML that reproduces the behaviour.
3. **Expected output** — what `EtlParser.parseSteps` (the `EtlStep` `info` object) should yield,
   or what the generator should render.

## The EtlStep shape (assert against these)

`src/lib/parsers/types.ts`:
- `RawType: string` — type discriminator
- `Step?`, `Name?`, `Value?` — labels
- `Details: string[]` — human-readable detail lines
- `Inputs?: string[]`, `Outputs?: string[]`, `Output?: {type?, name?} | null`
- `Rules?: LogicRule[]` ( `{outcome, condition}` ) — for decision/logic steps
- `children?: EtlStep[]` — nesting (groups, loops)
- `Icon?: string` — authoritative glyph (single source for HTML + Mermaid)
- `Phase?`, `Context?`, `SourceType?`, `id?`

## Watch the known traps (these have all caused bugs)

- **Falsy guards**: use `val == null`, not `!val` — `0`, `''`, seq-`0` are valid data.
- **`#text` extraction**: text nodes arrive as `#text`; use `EtlParser.getTextSafe`.
- **Control flow ≠ data lineage**: `StartProcess` outputs are control flow, NOT data outputs —
  don't assert them as `Outputs`.
- **Icon authority**: `item.Icon` is authoritative; `RawType` is only the fallback.
- **Sort stability**: steps sort by sequence; seq `0` must not be dropped or NaN-keyed.

## Scaffold

Create `tests/EtlParser.<ScenarioName>.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EtlParser } from '../src/lib/parsers/EtlParser';

// Minimal .t1etlp fragment reproducing <scenario>.
const XML = `<!-- paste minimal step XML here -->`;

describe('EtlParser — <scenario>', () => {
    it('parses <RawType> into the expected EtlStep', () => {
        const steps = EtlParser.parseSteps(/* parsed XML input — match how existing tests feed it */);
        const step = steps.find((s) => s.RawType === '<RawType>');

        expect(step).toBeDefined();
        expect(step?.Details).toContain('<expected detail>');
        expect(step?.Outputs ?? []).toEqual([/* expected, or [] for control-flow steps */]);
        // Guard the traps: seq-0 present, 0/'' preserved, Icon authoritative.
    });
});
```

Open an existing test first to copy the exact parser entry point and input-shaping (the precise
`parseSteps` call signature and how XML is pre-parsed differ — mirror the real tests, don't guess).

## Finish
Run `pnpm test` and confirm the new test passes (or fails red first if TDD-ing the parser change).
