# ETL Advanced Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the ETL parser distinct, first-class handling for `Group`, `StartProcess`, `Script`, and `DTS` step types instead of generic fallbacks.

**Architecture:** Extract a new `StepDescriptors.ts` module holding one pure descriptor function per target step type (helpers injected from `EtlParser`). `EtlParser.traverse()` delegates these four types to the module inside a try/catch, merging the result into the existing `EtlStep` object; all other types keep their current inline logic. Render paths (`EtlGenerator`, `MermaidGenerator`) gain icons/shapes for the three new standard-step types — `Group` already renders as a container.

**Tech Stack:** TypeScript, Vitest, fast-xml-parser tree shapes (`XmlNode`/`XmlValue`/`asNode`), Vite.

**Confidence tiers:** `Group` is verified against real sample data. `StartProcess`/`Script`/`DTS` field names are UNVERIFIED (proprietary T1 schema, no samples) — extraction is defensive multi-key, de-risked by tests modeling the assumed shapes.

**Spec:** `docs/superpowers/specs/2026-06-07-etl-advanced-logic-design.md`

**Test command:** `pnpm vitest run <file>` (project uses `vitest`). Tests build plain JS mock objects (already-parsed XML), call `EtlParser.parseSteps`, and assert on the returned tree — see `tests/EtlParser.test.ts`.

---

## File Structure

- **Create** `src/lib/parsers/StepDescriptors.ts` — descriptor lookup + helpers interface. One responsibility: turn a step's storage into display/lineage fields for the four target types.
- **Create** `tests/StepDescriptors.test.ts` — unit tests for the descriptor module + integration tests through `parseSteps`.
- **Modify** `src/lib/parsers/EtlParser.ts` — export `RawStep`; delegate the four types to descriptors inside `traverse()`; delegate `getExplicitOutput` for these types.
- **Modify** `src/lib/parsers/types.ts` — add optional `Icon?: string` to `EtlStep`.
- **Modify** `src/lib/generators/EtlGenerator.ts` — icon map for `Script`/`StartProcess`/`DTS`.
- **Modify** `src/lib/generators/MermaidGenerator.ts` — shape/class for `Script`/`StartProcess`/`DTS`.
- **Modify** `docs/FILE_FORMATS.md` — document Tier-B UNVERIFIED candidate keys.

---

### Task 1: Add `Icon` field + export `RawStep`

**Files:**
- Modify: `src/lib/parsers/types.ts:37-41`
- Modify: `src/lib/parsers/EtlParser.ts:5-6`

- [ ] **Step 1: Add optional `Icon` to `EtlStep`**

In `src/lib/parsers/types.ts`, inside the `EtlStep` interface, after the `Value?: string;` line (line 41), add:

```ts
    /** Display glyph for this step type (single source of truth for HTML + Mermaid). */
    Icon?: string;
```

- [ ] **Step 2: Export `RawStep` from `EtlParser`**

In `src/lib/parsers/EtlParser.ts`, change line 6 from:

```ts
type RawStep = XmlNode & { children?: RawStep[] };
```

to:

```ts
export type RawStep = XmlNode & { children?: RawStep[] };
```

- [ ] **Step 3: Verify the project still type-checks**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors). `Icon` is optional and additive; `export` is additive.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parsers/types.ts src/lib/parsers/EtlParser.ts
git commit -m "feat(etl): add optional Icon field and export RawStep"
```

---

### Task 2: Create `StepDescriptors` module with the `Group` descriptor (Tier A)

**Files:**
- Create: `src/lib/parsers/StepDescriptors.ts`
- Test: `tests/StepDescriptors.test.ts`

- [ ] **Step 1: Write the failing test for the Group descriptor**

Create `tests/StepDescriptors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { STEP_DESCRIPTORS, makeHelpers } from '../src/lib/parsers/StepDescriptors';
import type { RawStep } from '../src/lib/parsers/EtlParser';

const h = makeHelpers();

describe('StepDescriptors', () => {
    describe('Group', () => {
        it('uses the step Name as label and counts children', () => {
            const step: RawStep = {
                StepType: 'Group',
                Name: 'Prep Chart of Accounts',
                Definition: { StorageObject: { DefKey: 'abc' } },
                children: [{ StepType: 'RunDirectQuery' }, { StepType: 'AddColumn' }],
            };
            const storage = { DefKey: 'abc' };
            const d = STEP_DESCRIPTORS['Group'](storage, step, h);
            expect(d.contextText).toBe('Prep Chart of Accounts');
            expect(d.flowLabel).toBe('Prep Chart of Accounts');
            expect(d.smartDesc).toBe('Groups 2 steps');
            expect(d.icon).toBe('🗂️');
            expect(d.inputs).toEqual([]);
            expect(d.outputs).toEqual([]);
            expect(d.explicitOutput).toBeNull();
        });

        it('falls back to "Group" when Name is empty', () => {
            const step: RawStep = { StepType: 'Group', Name: '', children: [] };
            const d = STEP_DESCRIPTORS['Group']({}, step, h);
            expect(d.contextText).toBe('Group');
            expect(d.smartDesc).toBe('Groups 0 steps');
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: FAIL — cannot resolve module `StepDescriptors` (not created yet).

- [ ] **Step 3: Create the module with helpers + Group descriptor**

Create `src/lib/parsers/StepDescriptors.ts`:

```ts
import type { XmlNode, XmlValue } from './types';
import { asNode } from './types';
import type { RawStep } from './EtlParser';

/** Display + lineage fields a descriptor produces for one step. */
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

/** Leaf/list readers injected by EtlParser so this module stays decoupled. */
export interface DescriptorHelpers {
    getTextSafe: (v: XmlValue) => string;
    getListSafe: (v: XmlValue, key: string) => XmlNode[];
    /** Returns the first non-empty text value among the candidate keys. */
    firstOf: (storage: XmlNode, keys: string[]) => string;
}

export type DescriptorFn = (storage: XmlNode, step: RawStep, h: DescriptorHelpers) => StepDescriptor;

/**
 * Standalone helper factory (used by tests and as a fallback). EtlParser passes
 * its own statics in production so behavior matches the rest of the parser.
 */
export function makeHelpers(): DescriptorHelpers {
    const getTextSafe = (val: XmlValue): string => {
        if (val == null || val === '') return '';
        if (typeof val === 'string') return val;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        const node = asNode(val);
        if (node && typeof node['#text'] === 'string') return node['#text'];
        return '';
    };
    const getListSafe = (obj: XmlValue, key: string): XmlNode[] => {
        const node = asNode(obj);
        if (!node || node[key] == null) return [];
        const v = node[key];
        return (Array.isArray(v) ? v : [v]) as XmlNode[];
    };
    const firstOf = (storage: XmlNode, keys: string[]): string => {
        for (const k of keys) {
            const t = getTextSafe(storage[k]);
            if (t && t.trim().length > 0) return t.trim();
        }
        return '';
    };
    return { getTextSafe, getListSafe, firstOf };
}

const groupDescriptor: DescriptorFn = (_storage, step, h) => {
    const name = h.getTextSafe(step.Name) || 'Group';
    const count = (step.children || []).length;
    return {
        contextText: name,
        flowLabel: name,
        details: [],
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '🗂️',
        smartDesc: `Groups ${count} steps`,
    };
};

export const STEP_DESCRIPTORS: Record<string, DescriptorFn> = {
    Group: groupDescriptor,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: PASS (both Group tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/StepDescriptors.ts tests/StepDescriptors.test.ts
git commit -m "feat(etl): add StepDescriptors module with Group descriptor"
```

---

### Task 3: Add `Script`, `StartProcess`, `DTS` descriptors (Tier B — defensive)

**Files:**
- Modify: `src/lib/parsers/StepDescriptors.ts`
- Test: `tests/StepDescriptors.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/StepDescriptors.test.ts` inside the top-level `describe('StepDescriptors', ...)` block (before its closing `});`):

```ts
    describe('Script', () => {
        it('extracts language and truncates body preview', () => {
            const body = 'x'.repeat(200);
            const storage = { ScriptLanguage: 'VBScript', ScriptText: body };
            const d = STEP_DESCRIPTORS['Script'](storage, { StepType: 'Script' }, h);
            expect(d.flowLabel).toBe('Script: VBScript');
            expect(d.icon).toBe('📜');
            expect(d.details.some((l) => l.startsWith('Language: VBScript'))).toBe(true);
            expect(d.details.some((l) => l.includes('...'))).toBe(true);
        });

        it('reads alternate keys and degrades without language', () => {
            const storage = { Language: 'PowerShell', Script: 'Get-Date' };
            const d = STEP_DESCRIPTORS['ExecuteScript'](storage, { StepType: 'ExecuteScript' }, h);
            expect(d.flowLabel).toBe('Script: PowerShell');
            const bare = STEP_DESCRIPTORS['Script']({}, { StepType: 'Script' }, h);
            expect(bare.flowLabel).toBe('Script');
        });
    });

    describe('StartProcess', () => {
        it('extracts process name, params, and output token', () => {
            const storage = {
                ProcessName: 'NightlyRollup',
                Parameters: { ParameterItem: [{ Name: 'Year', Value: '2026' }] },
            };
            const d = STEP_DESCRIPTORS['StartProcess'](storage, { StepType: 'StartProcess' }, h);
            expect(d.flowLabel).toBe('Run: NightlyRollup');
            expect(d.icon).toBe('▶');
            expect(d.explicitOutput).toEqual({ type: 'PROCESS', name: 'NightlyRollup' });
            expect(d.details.some((l) => l === 'Param: Year = 2026')).toBe(true);
        });

        it('reads alternate process key', () => {
            const d = STEP_DESCRIPTORS['RunProcess']({ ProcessToRun: 'P2' }, { StepType: 'RunProcess' }, h);
            expect(d.flowLabel).toBe('Run: P2');
        });
    });

    describe('DTS', () => {
        it('extracts package name and connection', () => {
            const storage = { DTSPackageName: 'LoadGL', ConnectionString: 'Server=x' };
            const d = STEP_DESCRIPTORS['DTS'](storage, { StepType: 'DTS' }, h);
            expect(d.flowLabel).toBe('DTS: LoadGL');
            expect(d.icon).toBe('🔀');
            expect(d.details.some((l) => l.startsWith('Connection: Server=x'))).toBe(true);
        });

        it('degrades to bare label when package missing', () => {
            const d = STEP_DESCRIPTORS['RunDTS']({}, { StepType: 'RunDTS' }, h);
            expect(d.flowLabel).toBe('DTS');
        });
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: FAIL — `STEP_DESCRIPTORS['Script']` (and `StartProcess`/`DTS` and their aliases) are `undefined`.

- [ ] **Step 3: Implement the three descriptors + register aliases**

In `src/lib/parsers/StepDescriptors.ts`, add these three descriptor functions after `groupDescriptor`:

```ts
const scriptDescriptor: DescriptorFn = (storage, _step, h) => {
    const lang = h.firstOf(storage, ['ScriptLanguage', 'Language']);
    const body = h.firstOf(storage, ['ScriptText', 'Script']);
    const details: string[] = [];
    if (lang) details.push(`Language: ${lang}`);
    if (body) {
        const preview = body.length > 150 ? body.substring(0, 150) + '...' : body;
        details.push(`Script: ${preview}`);
    }
    const label = lang ? `Script: ${lang}` : 'Script';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '📜',
    };
};

const startProcessDescriptor: DescriptorFn = (storage, _step, h) => {
    const proc = h.firstOf(storage, ['ProcessName', 'ProcessToRun', 'Process', 'SubProcessName']);
    const details: string[] = [];
    if (proc) details.push(`Process: ${proc}`);
    h.getListSafe(storage.Parameters, 'ParameterItem').forEach((p) => {
        details.push(`Param: ${h.getTextSafe(p.Name)} = ${h.getTextSafe(p.Value)}`);
    });
    const label = proc ? `Run: ${proc}` : 'Run Process';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: proc ? [proc] : [],
        explicitOutput: proc ? { type: 'PROCESS', name: proc } : null,
        icon: '▶',
    };
};

const dtsDescriptor: DescriptorFn = (storage, _step, h) => {
    const pkg = h.firstOf(storage, ['DTSPackageName', 'PackageName', 'DTSPackage', 'Package']);
    const conn = h.firstOf(storage, ['ConnectionString', 'Connection', 'DTSConnection']);
    const details: string[] = [];
    if (pkg) details.push(`Package: ${pkg}`);
    if (conn) details.push(`Connection: ${conn}`);
    const label = pkg ? `DTS: ${pkg}` : 'DTS';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '🔀',
    };
};
```

Then replace the `STEP_DESCRIPTORS` export with:

```ts
export const STEP_DESCRIPTORS: Record<string, DescriptorFn> = {
    Group: groupDescriptor,
    Script: scriptDescriptor,
    ExecuteScript: scriptDescriptor,
    StartProcess: startProcessDescriptor,
    RunProcess: startProcessDescriptor,
    DTS: dtsDescriptor,
    ExecuteDTS: dtsDescriptor,
    RunDTS: dtsDescriptor,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: PASS (all Group/Script/StartProcess/DTS tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/StepDescriptors.ts tests/StepDescriptors.test.ts
git commit -m "feat(etl): add Script/StartProcess/DTS descriptors (defensive)"
```

---

### Task 4: Wire descriptors into `EtlParser.traverse()`

**Files:**
- Modify: `src/lib/parsers/EtlParser.ts` (imports near top; `getExplicitOutput` ~181-201; inside `traverse` ~367-543)
- Test: `tests/StepDescriptors.test.ts`

- [ ] **Step 1: Write the failing integration tests**

Append a new top-level block to `tests/StepDescriptors.test.ts` (after the `describe('StepDescriptors', ...)` block):

```ts
import { EtlParser } from '../src/lib/parsers/EtlParser';

describe('parseSteps integration — advanced step types', () => {
    const wrap = (steps: any[]) => ({ ArrayOfStep: { Step: steps } });

    it('labels a Group by its Name with a child count', () => {
        const tree = EtlParser.parseSteps(
            wrap([
                { StepId: '1', ParentStepId: '0', Sequence: '1', StepType: 'Group', Name: 'Prep COA',
                  Definition: { StorageObject: { DefKey: 'g1' } } },
                { StepId: '2', ParentStepId: '1', Sequence: '1', StepType: 'AddColumn', Name: 'Calc',
                  Definition: { StorageObject: { Columns: { ColumnItemDef: { ColumnName: 'X', Expression: '1' } } } } },
            ])
        ).executionTree;
        const group = tree[0];
        expect(group.RawType).toBe('Group');
        expect(group.FlowLabel).toBe('Prep COA');
        expect(group.Context).toBe('Prep COA');
        expect(group.SmartDesc).toBe('Groups 1 steps');
        expect(group.Icon).toBe('🗂️');
        expect(group.children).toHaveLength(1);
    });

    it('describes a StartProcess step', () => {
        const tree = EtlParser.parseSteps(
            wrap([
                { StepId: '1', ParentStepId: '0', Sequence: '1', StepType: 'StartProcess', Name: 'Kick',
                  Definition: { StorageObject: { ProcessName: 'NightlyRollup' } } },
            ])
        ).executionTree;
        expect(tree[0].FlowLabel).toBe('Run: NightlyRollup');
        expect(tree[0].Icon).toBe('▶');
        expect(tree[0].Output).toEqual({ type: 'PROCESS', name: 'NightlyRollup' });
    });

    it('does not crash on a malformed StartProcess (no candidate keys)', () => {
        const tree = EtlParser.parseSteps(
            wrap([
                { StepId: '1', ParentStepId: '0', Sequence: '1', StepType: 'StartProcess', Name: 'Empty',
                  Definition: { StorageObject: {} } },
            ])
        ).executionTree;
        expect(tree[0].RawType).toBe('StartProcess');
        expect(tree[0].FlowLabel).toBe('Run Process');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: FAIL — `FlowLabel` for Group is `"Group"`, `Icon` is `undefined`, StartProcess `Output` is `null` (descriptors not wired into parser yet).

- [ ] **Step 3: Import descriptors in `EtlParser`**

In `src/lib/parsers/EtlParser.ts`, after the existing imports (after line 3), add:

```ts
import { STEP_DESCRIPTORS, makeHelpers, type StepDescriptor } from './StepDescriptors';
```

Then, immediately after the `export class EtlParser {` line (line 8), add a shared helpers instance bound to the parser's own statics:

```ts
    private static descriptorHelpers = {
        getTextSafe: (v: XmlValue) => EtlParser.getTextSafe(v),
        getListSafe: (v: XmlValue, key: string) => EtlParser.getListSafe(v, key),
        firstOf: makeHelpers().firstOf,
    };
```

- [ ] **Step 4: Delegate `getExplicitOutput` for the four types**

In `src/lib/parsers/EtlParser.ts`, at the very start of the `getExplicitOutput` method body (right after line 181 `getExplicitOutput(stepType: string, storage: XmlNode, _step: XmlValue) {`), add:

```ts
        const descriptor = STEP_DESCRIPTORS[stepType];
        if (descriptor) {
            try {
                return descriptor(storage, _step as RawStep, this.descriptorHelpers).explicitOutput;
            } catch {
                return null;
            }
        }
```

- [ ] **Step 5: Delegate display fields inside `traverse`**

In `src/lib/parsers/EtlParser.ts`, inside `traverse`, locate the block that sets `info.FlowLabel = fl;` (line ~590). Immediately **after** that line, add:

```ts
            // --- Advanced step descriptors (Group / Script / StartProcess / DTS) ---
            const advDescriptor = STEP_DESCRIPTORS[stepType];
            if (advDescriptor) {
                try {
                    const d: StepDescriptor = advDescriptor(storage, step, this.descriptorHelpers);
                    info.Context = d.contextText;
                    info.FlowLabel = d.flowLabel;
                    if (d.icon) info.Icon = d.icon;
                    if (d.smartDesc) info.SmartDesc = d.smartDesc;
                    if (d.inputs.length) info.Inputs = d.inputs;
                    if (d.outputs.length) info.Outputs = d.outputs;
                    d.details.forEach((line) => {
                        if (!info.Details.includes(line)) info.Details.push(line);
                    });
                } catch (e) {
                    console.error(`Descriptor failed for ${stepType}:`, e);
                    // Fall back to the generic context already set above.
                }
            }
```

> Note: this runs after the existing `switch`/detail logic, so for `Script`/`StartProcess`/`DTS` it *augments* (and overrides label/context) the prior inline handling rather than removing it. Duplicate detail lines are de-duped by the `includes` guard. The old inline `else if` blocks for `Script`/`StartProcess` (lines ~797–822) stay in place — harmless, deduped — and are removed in Task 5.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: PASS (all integration tests).

- [ ] **Step 7: Run the full parser suite for regressions**

Run: `pnpm vitest run tests/EtlParser.test.ts tests/EtlParser.KitchenSink.test.ts`
Expected: PASS (no regressions — other step types untouched).

- [ ] **Step 8: Commit**

```bash
git add src/lib/parsers/EtlParser.ts tests/StepDescriptors.test.ts
git commit -m "feat(etl): wire advanced descriptors into traverse and getExplicitOutput"
```

---

### Task 5: Remove now-duplicated inline `Script`/`StartProcess` detail blocks

**Files:**
- Modify: `src/lib/parsers/EtlParser.ts:797-823`

- [ ] **Step 1: Delete the superseded inline blocks**

In `src/lib/parsers/EtlParser.ts`, remove the three `else if` branches that the descriptors now own — the `Script`/`ExecuteScript` block, and the `StartProcess`/`RunProcess` block (lines ~797–823, beginning `else if (stepType === 'Script' || stepType === 'ExecuteScript')` through the end of the `StartProcess`/`RunProcess` branch).

Leave the `ExecuteSQL`/`RunSQL` branch between them **in place** (descriptors do not cover SQL). After deletion, the chain should flow from the `Loop` details branch → `ExecuteSQL`/`RunSQL` branch → `FilterTable` branch, with `Script` and `StartProcess` details now produced solely by the descriptors.

> If the surrounding `else if` chain breaks (a dangling `else`), re-join the neighbors so `ExecuteSQL`/`RunSQL` and `FilterTable` remain reachable.

- [ ] **Step 2: Run the descriptor + integration tests**

Run: `pnpm vitest run tests/StepDescriptors.test.ts`
Expected: PASS — Script/StartProcess details now come only from descriptors; assertions (`Language:`, `Param:`) still hold.

- [ ] **Step 3: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/parsers/EtlParser.ts
git commit -m "refactor(etl): drop inline Script/StartProcess blocks now in descriptors"
```

---

### Task 6: Render icons in the HTML flow view

**Files:**
- Modify: `src/lib/generators/EtlGenerator.ts:605-614`
- Test: `tests/EtlGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/EtlGenerator.test.ts` mocks both `db.reports.get` and `EtlParser.parseSteps`
(see the `vi.mock` calls at the top). So the test supplies a pre-built tree via the
`parseSteps` mock — it does NOT parse real XML. Add this test inside the
`describe('EtlGenerator', ...)` block, mirroring the existing "renders recursive
groups correctly" test:

```ts
it('shows a script icon for Script steps', async () => {
    const mockReport = {
        id: 1,
        metadata: { name: 'Test', version: '1.0' },
        rawSteps: {},
        dateAdded: new Date(),
    };
    vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

    const mockFlow = {
        executionTree: [
            { id: 's1', Step: 'Transform', RawType: 'Script', Phase: 'Script',
              Context: 'Script: VBScript', Details: [] },
        ],
        executionFlow: [],
        variables: [],
        variableSet: new Set(),
        tableSet: new Set(),
    };
    vi.mocked(EtlParser.parseSteps).mockReturnValue(mockFlow as any);

    const html = await EtlGenerator.generateHtmlView(1);
    expect(html).toContain('📜');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/EtlGenerator.test.ts`
Expected: FAIL — `📜` not present (no icon mapped for `Script`).

- [ ] **Step 3: Extend the `filenameIcon` map**

In `src/lib/generators/EtlGenerator.ts`, find the `filenameIcon` ternary (lines ~605-614, ending `: '';`). Replace its final `: ''` fallback with cases for the new types. The existing chain ends:

```ts
                      : item.RawType === 'SendEmail'
                          ? '📧'
                          : '';
```

Change to:

```ts
                      : item.RawType === 'SendEmail'
                          ? '📧'
                          : item.RawType === 'Script' || item.RawType === 'ExecuteScript'
                            ? '📜'
                            : item.RawType === 'StartProcess' || item.RawType === 'RunProcess'
                              ? '▶'
                              : item.RawType === 'DTS' ||
                                  item.RawType === 'ExecuteDTS' ||
                                  item.RawType === 'RunDTS'
                                ? '🔀'
                                : item.Icon || '';
```

> Note the final fallback is now `item.Icon || ''` so any descriptor-supplied icon flows through automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/EtlGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generators/EtlGenerator.ts tests/EtlGenerator.test.ts
git commit -m "feat(etl): render distinct icons for Script/StartProcess/DTS in HTML view"
```

---

### Task 7: Distinct shapes in the Mermaid diagram

**Files:**
- Modify: `src/lib/generators/MermaidGenerator.ts:166-174`
- Test: `tests/MermaidGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/MermaidGenerator.test.ts` (mirror the file's existing flow-array shape — items are plain objects with `RawType`, `Step`, `FlowLabel`):

```ts
it('gives Script/StartProcess/DTS steps an icon label', () => {
    const syntax = MermaidGenerator.generateMermaidSyntax([
        { RawType: 'Script', Step: 'Transform', FlowLabel: 'Script: VBScript', Details: [] },
        { RawType: 'StartProcess', Step: 'Kick', FlowLabel: 'Run: Rollup', Details: [] },
        { RawType: 'DTS', Step: 'Load', FlowLabel: 'DTS: LoadGL', Details: [] },
    ]);
    expect(syntax).toContain('📜');
    expect(syntax).toContain('▶');
    expect(syntax).toContain('🔀');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/MermaidGenerator.test.ts`
Expected: FAIL — none of the icons present (types fall to default `process` shape with bare label).

- [ ] **Step 3: Add a mapping branch**

In `src/lib/generators/MermaidGenerator.ts`, inside `generateMermaidSyntax`, find the shape-mapping `if/else if` chain (lines ~140-174). After the `CalculateVariable`/`SetVariable` branch (ends line ~174 `className = 'process';` then `}`), add:

```ts
                } else if (['Script', 'ExecuteScript'].includes(item.RawType)) {
                    shape = '[/';
                    shapeEnd = '/]';
                    className = 'process';
                    label = '📜 ' + label.trim();
                } else if (['StartProcess', 'RunProcess'].includes(item.RawType)) {
                    shape = '[[';
                    shapeEnd = ']]';
                    className = 'process';
                    label = '▶ ' + label.trim();
                } else if (['DTS', 'ExecuteDTS', 'RunDTS'].includes(item.RawType)) {
                    shape = '[/';
                    shapeEnd = '/]';
                    className = 'process';
                    label = '🔀 ' + label.trim();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/MermaidGenerator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generators/MermaidGenerator.ts tests/MermaidGenerator.test.ts
git commit -m "feat(etl): distinct Mermaid shapes for Script/StartProcess/DTS"
```

---

### Task 8: Document UNVERIFIED Tier-B field names

**Files:**
- Modify: `docs/FILE_FORMATS.md`

- [ ] **Step 1: Append a section to `docs/FILE_FORMATS.md`**

At the end of `docs/FILE_FORMATS.md`, add:

```markdown
## Advanced step types — UNVERIFIED field names

`StartProcess`, `Script`, and `DTS` step types are parsed defensively because no
sample `.t1etlp` in this repo contains them and TechnologyOne's ETL XML schema is
not publicly documented. The parser (`src/lib/parsers/StepDescriptors.ts`) tries
multiple candidate keys per field and degrades gracefully if none match. **These
key names are assumptions — correct them against a real file when available.**

| Step type      | Field        | Candidate keys (first non-empty wins)                          |
| -------------- | ------------ | -------------------------------------------------------------- |
| StartProcess   | process name | `ProcessName`, `ProcessToRun`, `Process`, `SubProcessName`     |
| Script         | language     | `ScriptLanguage`, `Language`                                   |
| Script         | body         | `ScriptText`, `Script`                                         |
| DTS            | package      | `DTSPackageName`, `PackageName`, `DTSPackage`, `Package`       |
| DTS            | connection   | `ConnectionString`, `Connection`, `DTSConnection`             |

`Group` handling is verified against real sample data (the step `<Name>` is the
label; children attach via `ParentStepId`).
```

- [ ] **Step 2: Commit**

```bash
git add docs/FILE_FORMATS.md
git commit -m "docs(etl): document UNVERIFIED StartProcess/Script/DTS field keys"
```

---

### Task 9: Full verification + branch finish

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm vitest run`
Expected: PASS — all prior tests green plus the new `StepDescriptors` / generator tests.

- [ ] **Step 2: Type-check + build**

Run: `pnpm tsc --noEmit`
Expected: PASS.

(Optional full build, slower) Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Manual sanity via the running app (optional but recommended)**

Use the project's run/preview workflow to load a sample `.t1etlp` that contains a
`Group` (e.g. `AFRG_I&E_CHART...t1etlp`) and confirm the group now shows its real
name ("Prep Chart of Accounts") instead of "Group" in both the flow view and the
Mermaid diagram.

- [ ] **Step 4: Update the README roadmap checkbox**

In `README.md`, change the line:

```markdown
- [ ] **Advanced Logic**: Better distinct handling for `StartProcess`, `Script`, and `DTS` tasks.
```

to `- [x]`.

Then commit:

```bash
git add README.md
git commit -m "docs: mark Advanced Logic roadmap item complete"
```

- [ ] **Step 5: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to choose merge/PR/cleanup.

---

## Self-Review notes

- **Spec coverage:** Group label+count (T2/T4), Script/StartProcess/DTS extraction (T3), defensive try/catch + fallback (T4 step 5, malformed test T4 step 1), `Icon` field (T1), HTML icons (T6), Mermaid shapes (T7), EtlSummary unchanged (no task — by design), fixture/mock tests (T2-T4), docs UNVERIFIED note (T8). All spec sections mapped.
- **Type consistency:** `StepDescriptor`/`DescriptorFn`/`DescriptorHelpers`/`makeHelpers`/`STEP_DESCRIPTORS` names identical across T2-T4. `explicitOutput` shape `{ type, name } | null` matches `getExplicitOutput`'s existing return contract. `Icon` field name consistent T1/T4/T6.
- **No placeholders:** every code step shows full code; the two soft spots (T6 DB-seed helper, T7 flow-array shape) explicitly instruct mirroring the existing test file rather than inventing APIs.
