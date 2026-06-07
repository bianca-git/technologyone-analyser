# XlOne Reports (`.t1xl`) Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `.t1xl` (XlOne report definition) file-format module — parse the outer `Report.xml` plus the embedded `.xlsx` Definition sheet, store in IndexedDB, and render a technical HTML view, mirroring the existing Dashboard module.

**Architecture:** New `XlOneParser` (outer unzip → structured `Report.xml` + inner unzip the embedded xlsx → reconstruct the Definition-sheet grid into structured sections) and `XlOneGenerator` (parsed object → escaped HTML string). New Dexie v4 `xlReports` store. `FileProcessor` gains a `.t1xl` branch. `main.ts` wires the new type at ~10 sites. Fixture-driven Vitest tests build self-contained zips in-test. README roadmap corrected.

**Tech Stack:** Vite + TypeScript (strict), vanilla DOM, Dexie (IndexedDB), `fast-xml-parser`, `jszip`, Vitest + jsdom. No new dependency.

**Spec:** `docs/superpowers/specs/2026-06-08-xlone-reports-design.md`

---

## Reference: existing patterns (read before starting)

- `src/lib/parsers/DashboardParser.ts` — outer-unzip + `deepParseAllXml` recursion (copy the helper).
- `src/lib/generators/DashboardGenerator.ts` — HTML-string generator shape, `getList`/`getText`/`escapeHtml`/`renderTable` local helpers, cross-module Data-Model linkage idea.
- `src/lib/FileProcessor.ts:61-67,195-222` — `.t1dm`/`.t1db` branch + `processDashboard` storage pattern.
- `tests/DataModelParser.test.ts` — fixture pattern: build a `JSZip` in-test, `new File([blob], name)`, parse, assert.
- `src/lib/parsers/types.ts` — `XmlNode` / `XmlValue` / `asNode()`; add new interfaces here.

**Conventions (CLAUDE.md — do not violate):**
- Escape ALL file-derived text via `escapeHtml()` before HTML interpolation. XSS regressed 3× here.
- No `any` on the XML spine — use `XmlNode`/`XmlValue`/`asNode()`.
- Falsy guards use `== null`, not `!val` (`0`/`''`/seq-0 are valid).
- 4-space indent, single quotes, semicolons, 120 print width.
- Conventional Commits (`feat:`/`fix:`/`docs:`/`test:`).

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/parsers/types.ts` | Add `XlReportParsed` + section types | Modify |
| `src/lib/parsers/XlOneParser.ts` | Outer+inner unzip, grid reconstruction | Create |
| `src/lib/generators/XlOneGenerator.ts` | Parsed → escaped HTML | Create |
| `src/lib/db.ts` | Dexie v4 `xlReports` store + `XlReport` interface | Modify |
| `src/lib/FileProcessor.ts` | `.t1xl` branch + `processXlReport` | Modify |
| `src/main.ts` | Type union + ~10 integration sites | Modify |
| `tests/XlOneParser.test.ts` | Fixture-driven parser tests | Create |
| `tests/XlOneGenerator.test.ts` | Generator HTML + XSS escaping test | Create |
| `README.md` | Roadmap correction | Modify |

---

## Task 1: Types for the parsed XlOne shape

**Files:**
- Modify: `src/lib/parsers/types.ts` (append after `DashboardParsed`, line ~100)

- [ ] **Step 1: Add the interfaces**

Append to `src/lib/parsers/types.ts`:

```typescript
/** A resolved data-source reference parsed from a Column Definition cell. */
export interface XlDataSourceRef {
    /** Raw cell text, e.g. "Transactions (Financial System Administration) (GUID)". */
    raw: string;
    /** Leading name portion, e.g. "Transactions". */
    name: string;
    /** Parenthesised system portion, e.g. "Financial System Administration". */
    system: string;
    /** Trailing GUID, e.g. "7f09c258-8b0e-40a8-851d-9d49c0ba6215" (empty if none). */
    guid: string;
}

/** A row in the report Variables table. */
export interface XlVariableRow {
    name: string;
    description: string;
    type: string;
    value: string;
    listValues: string;
}

/** A single criteria row under a column definition. */
export interface XlCriteriaRow {
    columnName: string;
    action: string;
    field: string;
    details: string;
    display: string;
}

/** A parsed Column Definition block from the Definition sheet. */
export interface XlColumnDefn {
    name: string;
    dataSource: XlDataSourceRef | null;
    /** Parsed `key=value;` pairs from the Parameters cell. */
    parameters: Record<string, string>;
    /** Parsed `key=value;` pairs from the Runtime cell. */
    runtime: Record<string, string>;
    criteria: XlCriteriaRow[];
}

/** A row in the Row Commands table. */
export interface XlRowCommand {
    command: string;
    details: string;
    selection: string;
    search: string;
    valueFrom: string;
    valueTo: string;
}

/** The reconstructed Definition worksheet, split into structured sections. */
export interface XlDefinitionSheet {
    /** Report Settings as key/value (e.g. Description, Narration, Created By). */
    settings: Record<string, string>;
    variables: XlVariableRow[];
    columns: XlColumnDefn[];
    rowCommands: XlRowCommand[];
}

/** Parsed XlOne report package: thin Report.xml header/definition + xlsx sheet. */
export interface XlReportParsed {
    /** Fields from the MyXLOneHeader wrapper. */
    header: {
        reportId: string;
        title: string;
        description: string;
        category: string;
        type: string;
        sheetName: string;
        userId: string;
        datasource: string;
        reportingSystem: string;
        parentPath: string;
        storageType: string;
    };
    /** Selected fields from the nested DbReportDef (raw node kept for depth). */
    definition: XmlNode;
    /** Reconstructed embedded-xlsx Definition sheet. */
    sheet: XlDefinitionSheet;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/parsers/types.ts
git commit -m "feat(xlone): add XlReportParsed types"
```

---

## Task 2: XlOneParser — outer Report.xml + header

**Files:**
- Create: `src/lib/parsers/XlOneParser.ts`
- Test: `tests/XlOneParser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/XlOneParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { XlOneParser } from '../src/lib/parsers/XlOneParser';

/** Build a minimal .t1xl File with the given Report.xml and optional xlsx parts. */
async function makeT1xl(
    reportXml: string,
    sharedStrings?: string[],
    sheetXml?: string
): Promise<File> {
    const outer = new JSZip();
    outer.file('Report.xml', reportXml);

    if (sharedStrings) {
        const inner = new JSZip();
        const si = sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('');
        inner.file(
            'xl/sharedStrings.xml',
            `<?xml version="1.0"?><sst count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${si}</sst>`
        );
        inner.file('xl/worksheets/sheet1.xml', sheetXml || '<worksheet><sheetData/></worksheet>');
        const innerBlob = await inner.generateAsync({ type: 'uint8array' });
        outer.file('Report.xlsx', innerBlob);
    }

    const blob = await outer.generateAsync({ type: 'blob' });
    return new File([blob], 'Report.t1xl');
}

const HEADER_ONLY = `<?xml version="1.0" encoding="utf-8"?>
<MyXLOneHeader>
  <ReportId>0725a29d-1be8-4651-893a-9ef859fa3661</ReportId>
  <Title>Transactions</Title>
  <Type>B</Type>
  <UserId>BWILKINS</UserId>
  <Datasource>7f09c258-8b0e-40a8-851d-9d49c0ba6215</Datasource>
  <ReportingSystem>$DEFAULT</ReportingSystem>
  <ParentFileItemPath>/Home/BWILKINS</ParentFileItemPath>
  <ReportStorageType>A</ReportStorageType>
  <Definition>&lt;DbReportDef&gt;&lt;ReportSuite&gt;CES&lt;/ReportSuite&gt;&lt;/DbReportDef&gt;</Definition>
</MyXLOneHeader>`;

describe('XlOneParser — header', () => {
    it('parses MyXLOneHeader fields', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.header.title).toBe('Transactions');
        expect(result.header.type).toBe('B');
        expect(result.header.datasource).toBe('7f09c258-8b0e-40a8-851d-9d49c0ba6215');
        expect(result.header.userId).toBe('BWILKINS');
        expect(result.header.parentPath).toBe('/Home/BWILKINS');
    });

    it('unescapes and parses the nested DbReportDef', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.definition.ReportSuite).toBe('CES');
    });

    it('returns empty sheet sections when no xlsx present', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.variables).toEqual([]);
        expect(result.sheet.columns).toEqual([]);
        expect(result.sheet.rowCommands).toEqual([]);
        expect(result.sheet.settings).toEqual({});
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/XlOneParser.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/parsers/XlOneParser'`.

- [ ] **Step 3: Write minimal implementation (header + nested def + empty sheet)**

Create `src/lib/parsers/XlOneParser.ts`:

```typescript
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { asNode, type XmlNode, type XmlValue, type XlReportParsed, type XlDefinitionSheet } from './types';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

/**
 * Recursively parse any string field that looks like XML (mirrors the helper in
 * DashboardParser / FileProcessor). Handles the entity-escaped DbReportDef inside
 * the <Definition> element.
 */
function deepParseAllXml(obj: XmlNode): void {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (
            (typeof val === 'string' && val.trim().startsWith('<?xml')) ||
            (typeof val === 'string' && val.trim().startsWith('<') && val.trim().endsWith('>'))
        ) {
            try {
                const parsed = parser.parse(val as string) as XmlNode;
                obj[key] = parsed;
                deepParseAllXml(parsed);
            } catch (_e) {
                // Not valid XML, leave as string
            }
        } else if (Array.isArray(val)) {
            val.forEach((item) => deepParseAllXml(item as XmlNode));
        } else if (val && typeof val === 'object') {
            deepParseAllXml(val as XmlNode);
        }
    });
}

/** Coerce a leaf XmlValue to a string, extracting `#text` for attributed nodes. */
function getText(val: XmlValue): string {
    if (val == null) return '';
    if (typeof val === 'object') {
        const node = asNode(val);
        return node && typeof node['#text'] === 'string' ? node['#text'] : '';
    }
    return String(val);
}

function emptySheet(): XlDefinitionSheet {
    return { settings: {}, variables: [], columns: [], rowCommands: [] };
}

export class XlOneParser {
    static async parse(file: File): Promise<XlReportParsed> {
        const zip = await JSZip.loadAsync(file);

        // --- Outer Report.xml ---
        const reportFile = zip.file('Report.xml');
        let headerNode: XmlNode = {};
        if (reportFile) {
            const content = await reportFile.async('string');
            try {
                const parsed = parser.parse(content) as XmlNode;
                deepParseAllXml(parsed);
                headerNode = asNode(parsed.MyXLOneHeader) || {};
            } catch (e) {
                console.warn('Failed to parse Report.xml', e);
            }
        }

        const definition = asNode(headerNode.Definition)
            ? (asNode(asNode(headerNode.Definition)?.DbReportDef) || {})
            : {};

        const header = {
            reportId: getText(headerNode.ReportId),
            title: getText(headerNode.Title),
            description: getText(headerNode.Description),
            category: getText(headerNode.Category),
            type: getText(headerNode.Type),
            sheetName: getText(headerNode.SheetName),
            userId: getText(headerNode.UserId),
            datasource: getText(headerNode.Datasource),
            reportingSystem: getText(headerNode.ReportingSystem),
            parentPath: getText(headerNode.ParentFileItemPath),
            storageType: getText(headerNode.ReportStorageType),
        };

        // --- Embedded xlsx (Task 3 fills this in) ---
        const sheet = emptySheet();

        return { header, definition, sheet };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/XlOneParser.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parsers/XlOneParser.ts tests/XlOneParser.test.ts
git commit -m "feat(xlone): parse Report.xml header and nested DbReportDef"
```

---

## Task 3: XlOneParser — embedded xlsx grid reconstruction

**Files:**
- Modify: `src/lib/parsers/XlOneParser.ts`
- Test: `tests/XlOneParser.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/XlOneParser.test.ts` (inside the file, new `describe`):

```typescript
// Cell helper: <c r="A1" t="s"><v>IDX</v></c> references sharedStrings[IDX].
function cell(ref: string, idx: number): string {
    return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
}
function row(rNum: number, cells: string): string {
    return `<row r="${rNum}">${cells}</row>`;
}

describe('XlOneParser — embedded xlsx grid', () => {
    // Shared-string table mirroring the real Transactions sample layout.
    const SS = [
        'FORMAT CIAXLONE REPORT', // 0
        'REPORT SETTINGS', // 1
        'Description:', // 2
        'Transactions', // 3
        'Narration:', // 4
        'Created By:', // 5
        'BWILKINS - 26-Apr-2025', // 6
        'REPORT VARIABLES', // 7
        'COLUMN DEFINITION', // 8
        'Name:', // 9
        'ColumnDefn1', // 10
        'Data Source:', // 11
        'Transactions (Financial System Administration) (7f09c258-8b0e-40a8-851d-9d49c0ba6215)', // 12
        'Parameters:', // 13
        'DataSourceType=CiADataSource;ChartName=GLCHART', // 14
        'ROW COMMANDS', // 15
    ];

    const SHEET = `<worksheet><sheetData>
        ${row(1, cell('A1', 1))}
        ${row(2, cell('A2', 2) + cell('B2', 3))}
        ${row(3, cell('A3', 4))}
        ${row(4, cell('A4', 5) + cell('B4', 6))}
        ${row(5, cell('A5', 8))}
        ${row(6, cell('A6', 9) + cell('B6', 10))}
        ${row(7, cell('A7', 11) + cell('B7', 12))}
        ${row(8, cell('A8', 13) + cell('B8', 14))}
        ${row(9, cell('A9', 15))}
    </sheetData></worksheet>`;

    it('reconstructs settings as key/value', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.settings['Description']).toBe('Transactions');
        expect(result.sheet.settings['Created By']).toBe('BWILKINS - 26-Apr-2025');
    });

    it('extracts a column definition with parsed data source ref', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.columns.length).toBe(1);
        const col = result.sheet.columns[0];
        expect(col.name).toBe('ColumnDefn1');
        expect(col.dataSource?.name).toBe('Transactions');
        expect(col.dataSource?.system).toBe('Financial System Administration');
        expect(col.dataSource?.guid).toBe('7f09c258-8b0e-40a8-851d-9d49c0ba6215');
    });

    it('parses key=value; parameter strings', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.columns[0].parameters['DataSourceType']).toBe('CiADataSource');
        expect(result.sheet.columns[0].parameters['ChartName']).toBe('GLCHART');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/XlOneParser.test.ts`
Expected: FAIL — settings empty / columns length 0 (Task 2 returns `emptySheet()`).

- [ ] **Step 3: Implement the xlsx reader + grid reconstruction**

In `src/lib/parsers/XlOneParser.ts`, add these helpers above the `XlOneParser` class:

```typescript
/** Parse a `key=value;key=value;` string into an object (trailing `;` tolerated). */
function parseKvString(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (raw == null || raw === '') return out;
    raw.split(';').forEach((pair) => {
        if (pair === '') return;
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim();
        if (k !== '') out[k] = v;
    });
    return out;
}

/** Parse "Name (System) (GUID)" into its parts. GUID is the last (...) group. */
function parseDataSourceRef(raw: string) {
    const guidMatch = raw.match(/\(([0-9a-fA-F-]{36})\)\s*$/);
    const guid = guidMatch ? guidMatch[1] : '';
    let rest = guid ? raw.slice(0, guidMatch!.index).trim() : raw.trim();
    const sysMatch = rest.match(/\(([^)]*)\)\s*$/);
    const system = sysMatch ? sysMatch[1] : '';
    const name = sysMatch ? rest.slice(0, sysMatch.index).trim() : rest;
    return { raw, name, system, guid };
}

/** Build the shared-strings array from sharedStrings.xml. */
function readSharedStrings(xml: string): string[] {
    const root = parser.parse(xml) as XmlNode;
    const sst = asNode(root.sst);
    if (!sst) return [];
    const siRaw = sst.si;
    const siList = (Array.isArray(siRaw) ? siRaw : siRaw == null ? [] : [siRaw]) as XmlValue[];
    return siList.map((si) => {
        const node = asNode(si);
        if (!node) return getText(si);
        // <si><t>text</t></si> OR <si><r><t>..</t></r>...</si> (rich text runs)
        if (node.t != null) return getText(node.t);
        if (node.r != null) {
            const runs = (Array.isArray(node.r) ? node.r : [node.r]) as XmlValue[];
            return runs.map((run) => getText(asNode(run)?.t)).join('');
        }
        return '';
    });
}

/** Column letters from a cell ref like "B12" -> "B". */
function colOf(ref: string): string {
    const m = ref.match(/^([A-Z]+)/);
    return m ? m[1] : '';
}
/** Row number from a cell ref like "B12" -> 12. */
function rowOf(ref: string): number {
    const m = ref.match(/(\d+)$/);
    return m ? Number(m[1]) : 0;
}

/** Build a Map<cellRef, string> resolving shared-string cells to text. */
function readSheetCells(xml: string, shared: string[]): Map<string, string> {
    const root = parser.parse(xml) as XmlNode;
    const sheetData = asNode(asNode(root.worksheet)?.sheetData);
    const cells = new Map<string, string>();
    if (!sheetData) return cells;
    const rowsRaw = sheetData.row;
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : rowsRaw == null ? [] : [rowsRaw]) as XmlValue[];
    rows.forEach((r) => {
        const rowNode = asNode(r);
        if (!rowNode) return;
        const cRaw = rowNode.c;
        const cArr = (Array.isArray(cRaw) ? cRaw : cRaw == null ? [] : [cRaw]) as XmlValue[];
        cArr.forEach((c) => {
            const cNode = asNode(c);
            if (!cNode) return;
            const ref = getText(cNode['@_r']);
            if (ref === '') return;
            const tType = getText(cNode['@_t']);
            const v = getText(cNode.v);
            if (tType === 's') {
                const idx = Number(v);
                cells.set(ref, shared[idx] != null ? shared[idx] : '');
            } else if (v !== '') {
                cells.set(ref, v);
            } else {
                const inline = getText(asNode(cNode.is)?.t);
                if (inline !== '') cells.set(ref, inline);
            }
        });
    });
    return cells;
}

/**
 * Reconstruct the Definition sheet sections from a resolved cell map. The sheet
 * is a labelled grid: a label in column A, its value in the next column(s).
 * Section headers (REPORT SETTINGS / COLUMN DEFINITION / ROW COMMANDS) switch
 * the active block. Column B holds the value for a column-A label.
 */
function reconstructSheet(cells: Map<string, string>): XlDefinitionSheet {
    const sheet: XlDefinitionSheet = { settings: {}, variables: [], columns: [], rowCommands: [] };
    if (cells.size === 0) return sheet;

    // Group cells by row, ordered.
    const byRow = new Map<number, Map<string, string>>();
    for (const [ref, val] of cells) {
        const rn = rowOf(ref);
        if (!byRow.has(rn)) byRow.set(rn, new Map());
        byRow.get(rn)!.set(colOf(ref), val);
    }
    const rowNums = Array.from(byRow.keys()).sort((a, b) => a - b);

    type Block = 'none' | 'settings' | 'column';
    let block: Block = 'none';
    let current: { name: string; dataSource: ReturnType<typeof parseDataSourceRef> | null; parameters: Record<string, string>; runtime: Record<string, string>; criteria: never[] } | null = null;

    const flush = () => {
        if (current) {
            sheet.columns.push({ ...current });
            current = null;
        }
    };

    for (const rn of rowNums) {
        const cols = byRow.get(rn)!;
        const a = (cols.get('A') || '').trim();
        const b = (cols.get('B') || '').trim();

        if (a === 'REPORT SETTINGS') { block = 'settings'; continue; }
        if (a === 'REPORT VARIABLES') { block = 'none'; continue; }
        if (a === 'COLUMN DEFINITION') {
            flush();
            block = 'column';
            current = { name: '', dataSource: null, parameters: {}, runtime: {}, criteria: [] };
            continue;
        }
        if (a === 'ROW COMMANDS') { flush(); block = 'none'; continue; }
        if (a === 'FORMAT CIAXLONE REPORT' || a === '') continue;

        const label = a.replace(/:$/, '');

        if (block === 'settings') {
            sheet.settings[label] = b;
        } else if (block === 'column' && current) {
            if (label === 'Name') current.name = b;
            else if (label === 'Data Source') current.dataSource = parseDataSourceRef(b);
            else if (label === 'Parameters') current.parameters = parseKvString(b);
            else if (label === 'Runtime') current.runtime = parseKvString(b);
        }
    }
    flush();
    return sheet;
}
```

Then replace the `// --- Embedded xlsx (Task 3 fills this in) ---` block and the `const sheet = emptySheet();` line in `parse()` with:

```typescript
        // --- Embedded xlsx Definition sheet ---
        let sheet = emptySheet();
        const xlsxName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.xlsx'));
        if (xlsxName) {
            try {
                const xlsxBytes = await zip.file(xlsxName)!.async('uint8array');
                const inner = await JSZip.loadAsync(xlsxBytes);
                const ssFile = inner.file('xl/sharedStrings.xml');
                const sheetFile =
                    inner.file('xl/worksheets/sheet1.xml') ||
                    inner.file(Object.keys(inner.files).find((n) => /xl\/worksheets\/.*\.xml$/.test(n)) || '');
                const shared = ssFile ? readSharedStrings(await ssFile.async('string')) : [];
                if (sheetFile) {
                    const cells = readSheetCells(await sheetFile.async('string'), shared);
                    sheet = reconstructSheet(cells);
                }
            } catch (e) {
                console.warn('Failed to parse embedded xlsx', e);
            }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/XlOneParser.test.ts`
Expected: PASS (all 6 tests across both describes).

- [ ] **Step 5: Verify against real samples (sanity check)**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parsers/XlOneParser.ts tests/XlOneParser.test.ts
git commit -m "feat(xlone): reconstruct embedded xlsx Definition sheet"
```

---

## Task 4: Dexie store + XlReport interface

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add the import + interface + store**

In `src/lib/db.ts`:

Change the import line (line 2) from:
```typescript
import type { DataModelParsed, DashboardParsed } from './parsers/types';
```
to:
```typescript
import type { DataModelParsed, DashboardParsed, XlReportParsed } from './parsers/types';
```

Add this interface after the `Dashboard` interface (after line 59):
```typescript
export interface XlReport {
    id?: number;
    filename: string;
    metadata: {
        name: string;
        id?: string;
        description?: string;
        owner?: string;
        parentPath?: string;
        type?: string;
        datasource?: string;
        dateModified?: string;
    };
    content: XlReportParsed;
    dateAdded: Date;
    stepNotes?: Record<string, string>;
}
```

Add the table field inside `T1AnalyserDB` (after line 64 `dashboards!: Table<Dashboard>;`):
```typescript
    xlReports!: Table<XlReport>;
```

Add the version bump inside the constructor (after the `version(3)` block, before the closing `}`):
```typescript
        // Version 4: Add xlReports (XlOne reports)
        this.version(4).stores({
            xlReports: '++id, filename, dateAdded',
        });
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(xlone): add xlReports IndexedDB store (Dexie v4)"
```

---

## Task 5: FileProcessor `.t1xl` branch

**Files:**
- Modify: `src/lib/FileProcessor.ts`

- [ ] **Step 1: Add the import**

At the top of `src/lib/FileProcessor.ts`, after the `DashboardParser` import (line 6):
```typescript
import { XlOneParser } from './parsers/XlOneParser';
```

- [ ] **Step 2: Add the routing branch**

In `processAndSave`, after the `.t1db` branch (lines 65-67), add:
```typescript
        if (file.name.toLowerCase().endsWith('.t1xl')) {
            return this.processXlReport(file);
        }
```

- [ ] **Step 3: Add the processor method**

Add this method to the `FileProcessor` class, after `processDashboard` (after line 222, before the class closing `}`):
```typescript
    private static async processXlReport(file: File): Promise<number> {
        const content = await XlOneParser.parse(file);

        const name = content.header.title || file.name.replace(/\.t1xl$/i, '');

        const metadata = {
            name,
            id: content.header.reportId || 'N/A',
            description: content.header.description,
            owner: content.header.userId || 'Unknown',
            parentPath: content.header.parentPath,
            type: content.header.type,
            datasource: content.header.datasource,
            dateModified: new Date().toISOString(),
        };

        const id = await db.xlReports.add({
            filename: file.name,
            metadata,
            content,
            dateAdded: new Date(),
        });

        console.log(`Saved XlOne Report ${id} to DB`);
        return id as number;
    }
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/FileProcessor.ts
git commit -m "feat(xlone): route .t1xl through FileProcessor"
```

---

## Task 6: XlOneGenerator — HTML view (with XSS test)

**Files:**
- Create: `src/lib/generators/XlOneGenerator.ts`
- Test: `tests/XlOneGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/XlOneGenerator.test.ts`. This mirrors the existing generator tests
(`tests/DataModelGenerator.test.ts`), which `vi.mock` the `db` module rather than using a
real/fake IndexedDB — **no new dependency**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../src/lib/db';
import { XlOneGenerator } from '../src/lib/generators/XlOneGenerator';
import type { XlReportParsed } from '../src/lib/parsers/types';

vi.mock('../src/lib/db', () => ({
    db: {
        xlReports: { get: vi.fn() },
        dataModels: { toArray: vi.fn() },
    },
}));

function makeParsed(overrides: Partial<XlReportParsed> = {}): XlReportParsed {
    return {
        header: {
            reportId: 'rid',
            title: 'My Report',
            description: '',
            category: '',
            type: 'B',
            sheetName: 'Definition',
            userId: 'TESTER',
            datasource: 'ds-guid',
            reportingSystem: '$DEFAULT',
            parentPath: '/Home/TESTER',
            storageType: 'A',
        },
        definition: { ReportSuite: 'CES' },
        sheet: { settings: {}, variables: [], columns: [], rowCommands: [] },
        ...overrides,
    };
}

function mockRecord(content: XlReportParsed, metadata: Record<string, unknown>) {
    return { id: 1, filename: 'r.t1xl', metadata, content, dateAdded: new Date() };
}

describe('XlOneGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.dataModels.toArray).mockResolvedValue([]);
    });

    it('throws if the report is not found', async () => {
        vi.mocked(db.xlReports.get).mockResolvedValue(undefined);
        await expect(XlOneGenerator.generateHtmlView(999)).rejects.toThrow('XlOne Report not found');
    });

    it('renders the report title and owner', async () => {
        vi.mocked(db.xlReports.get).mockResolvedValue(
            mockRecord(makeParsed(), { name: 'My Report', owner: 'TESTER' })
        );
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).toContain('My Report');
        expect(html).toContain('TESTER');
        expect(html).toContain('XlOne Report');
    });

    it('escapes file-derived values to prevent XSS', async () => {
        const content = makeParsed({
            header: { ...makeParsed().header, title: '<script>alert(1)</script>' },
            sheet: {
                settings: { Narration: '<img src=x onerror=alert(2)>' },
                variables: [],
                columns: [],
                rowCommands: [],
            },
        });
        vi.mocked(db.xlReports.get).mockResolvedValue(mockRecord(content, { name: '<script>alert(1)</script>' }));
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).not.toContain('<img src=x onerror=alert(2)>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('renders a column definition with its data source name', async () => {
        const content = makeParsed({
            sheet: {
                settings: {},
                variables: [],
                columns: [
                    {
                        name: 'ColumnDefn1',
                        dataSource: { raw: 'Transactions (Sys) (guid)', name: 'Transactions', system: 'Sys', guid: 'guid' },
                        parameters: {},
                        runtime: {},
                        criteria: [],
                    },
                ],
                rowCommands: [],
            },
        });
        vi.mocked(db.xlReports.get).mockResolvedValue(mockRecord(content, { name: 'r' }));
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).toContain('ColumnDefn1');
        expect(html).toContain('Transactions');
    });
});
```

> **No new dependency** — the codebase mocks `db` in generator tests; do not add `fake-indexeddb`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/XlOneGenerator.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/generators/XlOneGenerator'`.

- [ ] **Step 3: Implement the generator**

Create `src/lib/generators/XlOneGenerator.ts`:

```typescript
import { db } from '../db';
import { ExpressionFormatter } from '../formatters/ExpressionFormatter';
import type { XlReportParsed, XlColumnDefn } from '../parsers/types';

const esc = (v: unknown): string => ExpressionFormatter.escapeHtml(String(v ?? ''));

export class XlOneGenerator {
    static async generateHtmlView(id: number): Promise<string> {
        const record = await db.xlReports.get(id);
        if (!record) throw new Error('XlOne Report not found');

        const c: XlReportParsed = record.content;
        const h = c.header;
        const meta = record.metadata;

        // Cross-module lineage: map datasource GUID -> stored Data Model.
        const dataModels = await db.dataModels.toArray();
        const dmByGuid = new Map(dataModels.map((dm) => [dm.metadata.id, dm]));

        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                ${this.metaCell('Owner', meta.owner || h.userId || '-')}
                ${this.metaCell('Folder', (meta.parentPath || h.parentPath || '-').split('/').pop() || '-')}
                ${this.metaCell('Type', h.type || '-')}
                ${this.metaCell('Reporting System', h.reportingSystem || '-')}
                ${this.metaCell('Report ID', (h.reportId || 'N/A').substring(0, 12))}
                ${this.metaCell('Data Source', this.dmLink(h.datasource, dmByGuid))}
            </div>
        `;

        const settingsHtml = this.renderSettings(c.sheet.settings);
        const variablesHtml = this.renderVariables(c.sheet.variables);
        const columnsHtml = this.renderColumns(c.sheet.columns, dmByGuid);
        const rowCommandsHtml = this.renderRowCommands(c.sheet.rowCommands);

        return `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${esc(meta.name || h.title || 'XlOne Report')}</h2>
                    <span class="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-amber-200">XlOne Report</span>
                </div>
                ${metaGrid}
            </div>
            <div class="doc-body space-y-8">
                ${settingsHtml}
                ${columnsHtml}
                ${variablesHtml}
                ${rowCommandsHtml}
            </div>
        `;
    }

    private static metaCell(label: string, value: string): string {
        return `
            <div>
                <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">${esc(label)}</span>
                <span class="font-medium text-gray-800">${value.startsWith('<') ? value : esc(value)}</span>
            </div>`;
    }

    /** Render the datasource GUID as a link if a matching Data Model is stored. */
    private static dmLink(guid: string, dmByGuid: Map<string | undefined, { id?: number; metadata: { name: string } }>): string {
        if (guid == null || guid === '') return esc('-');
        const dm = dmByGuid.get(guid);
        if (dm && dm.id != null) {
            return `<a class="text-blue-600 hover:underline cursor-pointer" onclick="window.navigateTo('detail', ${dm.id}, 'datamodel')">${esc(dm.metadata.name)}</a>`;
        }
        return `<span class="font-mono text-xs text-gray-600">${esc(guid.substring(0, 12))}</span>`;
    }

    private static section(title: string, icon: string, badge: number | string, body: string, open = true): string {
        return `
            <details ${open ? 'open' : ''} class="group">
                <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-50 hover:bg-slate-100 transition-colors select-none border-t border-b border-slate-200">
                    <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                        <span class="text-lg">${icon}</span> ${esc(title)}
                        <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">${esc(badge)}</span>
                    </span>
                </summary>
                <div class="pt-4 pb-2 px-2">${body}</div>
            </details>`;
    }

    private static table(headers: string[], rows: string[][]): string {
        if (rows.length === 0) return '';
        const ths = headers
            .map((header) => `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${esc(header)}</th>`)
            .join('');
        const trs = rows
            .map((r) => `<tr class="border-t border-gray-100 hover:bg-gray-50">${r.map((cellHtml) => `<td class="px-4 py-2 text-sm text-gray-700">${cellHtml}</td>`).join('')}</tr>`)
            .join('');
        return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
    }

    private static renderSettings(settings: Record<string, string>): string {
        const keys = Object.keys(settings);
        if (keys.length === 0) return '';
        const rows = keys.map((k) => [`<span class="font-semibold">${esc(k)}</span>`, esc(settings[k])]);
        return this.section('Report Settings', '📋', keys.length, this.table(['Setting', 'Value'], rows));
    }

    private static renderVariables(variables: XlReportParsed['sheet']['variables']): string {
        if (variables.length === 0) return '';
        const rows = variables.map((v) => [esc(v.name), esc(v.description), esc(v.type), esc(v.value), esc(v.listValues)]);
        return this.section('Variables', '#️⃣', variables.length, this.table(['Name', 'Description', 'Type', 'Value', 'List Values'], rows));
    }

    private static renderColumns(columns: XlColumnDefn[], dmByGuid: Map<string | undefined, { id?: number; metadata: { name: string } }>): string {
        if (columns.length === 0) return '';
        const blocks = columns
            .map((col) => {
                const ds = col.dataSource
                    ? col.dataSource.guid
                        ? this.dmLink(col.dataSource.guid, dmByGuid)
                        : esc(col.dataSource.name)
                    : esc('-');
                const paramRows = Object.entries(col.parameters).map(([k, v]) => [esc(k), esc(v)]);
                const criteriaRows = col.criteria.map((cr) => [esc(cr.columnName), esc(cr.action), esc(cr.field), esc(cr.details), esc(cr.display)]);
                return `
                    <div class="border border-slate-200 bg-slate-50 rounded-lg p-4 mb-3">
                        <h3 class="text-lg font-bold text-gray-800">${esc(col.name || 'Column Definition')}</h3>
                        <p class="text-sm text-gray-600 mt-1">Data Source: ${ds}</p>
                        ${paramRows.length ? `<h4 class="font-semibold text-gray-700 mt-3 mb-2">Parameters</h4>${this.table(['Key', 'Value'], paramRows)}` : ''}
                        ${criteriaRows.length ? `<h4 class="font-semibold text-gray-700 mt-3 mb-2">Criteria</h4>${this.table(['Column', 'Action', 'Field', 'Details', 'Display'], criteriaRows)}` : ''}
                    </div>`;
            })
            .join('');
        return this.section('Column Definitions', '📊', columns.length, blocks);
    }

    private static renderRowCommands(rowCommands: XlReportParsed['sheet']['rowCommands']): string {
        if (rowCommands.length === 0) return '';
        const rows = rowCommands.map((rc) => [esc(rc.command), esc(rc.details), esc(rc.selection), esc(rc.search), esc(rc.valueFrom), esc(rc.valueTo)]);
        return this.section('Row Commands', '⛓️', rowCommands.length, this.table(['Command', 'Details', 'Selection', 'Search', 'Value (Fr)', 'Value (To)'], rows));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/XlOneGenerator.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Verify ExpressionFormatter.escapeHtml exists with that signature**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. (If `escapeHtml` is not a static on `ExpressionFormatter`, open `src/lib/formatters/ExpressionFormatter.ts` and use the exact exported name — do not invent one.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/generators/XlOneGenerator.ts tests/XlOneGenerator.test.ts
git commit -m "feat(xlone): render XlOne report HTML view"
```

---

## Task 7: Wire XlOne into main.ts (UI integration)

**Files:**
- Modify: `src/main.ts`

All edits in this task are in `src/main.ts`. After all edits, the type union, dashboard card, stats, upload accept, render dispatch, and delete must handle `'xlreport'`.

- [ ] **Step 1: Import the generator**

After the `DashboardGenerator` import (line 7):
```typescript
import { XlOneGenerator } from './lib/generators/XlOneGenerator';
```

- [ ] **Step 2: Extend the `currentType` union (line 33)**

From:
```typescript
let currentType: 'report' | 'datamodel' | 'dashboard' = 'report';
```
To:
```typescript
let currentType: 'report' | 'datamodel' | 'dashboard' | 'xlreport' = 'report';
```

- [ ] **Step 3: Add a section definition (SECTION_DEFS, after the dashboard entry, ~line 150)**

After the `dashboard` object in `SECTION_DEFS`, add:
```typescript
    {
        type: 'xlreport',
        title: 'XlOne Reports',
        dot: 'bg-amber-500',
        accent: 'border-amber-200',
        head: 'text-amber-700',
    },
```

- [ ] **Step 4: Add the stats counter (dashboardLayout `counts`, ~line 154)**

Add to the `counts` object:
```typescript
        xlreport: items.filter((i) => i.type === 'xlreport').length,
```

And add a stat tile — change the stats grid from `grid-cols-3` to `grid-cols-4` (the `<div class="grid grid-cols-3 gap-2 text-center">` near line 196) and append a 4th tile after the Dash tile (line 199):
```typescript
                        <div><div class="text-2xl font-bold text-amber-600">${counts.xlreport}</div><div class="text-[10px] text-gray-500">XlOne</div></div>
```

- [ ] **Step 5: Update the upload `accept` + hint copy (lines 190, 192)**

Change the hint paragraph (line 190) to add `.t1xl`:
```typescript
                        <p class="text-sm text-blue-100 mt-1">Drag & drop <code class="bg-white/20 px-1 rounded">.t1etlp</code>, <code class="bg-white/20 px-1 rounded">.t1dm</code>, <code class="bg-white/20 px-1 rounded">.t1db</code>, <code class="bg-white/20 px-1 rounded">.t1xl</code> — everything stays on your device.</p>
```
Change the file input (line 192):
```typescript
                    <input type="file" id="fileInput" multiple accept=".t1etlp,.t1dm,.t1db,.t1xl" class="hidden">
```

- [ ] **Step 6: Load xlReports in the dashboard view (`render`, ~lines 217-227)**

In the `currentView === 'dashboard'` block, add the fetch and merge:
```typescript
        const reports = await db.reports.toArray();
        const dms = await db.dataModels.toArray();
        const dashboards = await db.dashboards.toArray();
        const xlReports = await db.xlReports.toArray();
        const allItems = [
            ...reports.map((r) => ({ ...r, type: 'report' })),
            ...dms.map((d) => ({ ...d, type: 'datamodel' })),
            ...dashboards.map((d) => ({ ...d, type: 'dashboard' })),
            ...xlReports.map((x) => ({ ...x, type: 'xlreport' })),
        ];
```

- [ ] **Step 7: Render dispatch in detail view (`render`, ~lines 264-270)**

After the `dashboard` branch, add:
```typescript
            } else if (currentType === 'xlreport') {
                html = await XlOneGenerator.generateHtmlView(currentReportId);
```

- [ ] **Step 8: Extend the `Window` global types (lines 447, 449)**

`navigateTo` type (line 447):
```typescript
        navigateTo: (view: 'dashboard' | 'detail', id?: number, type?: 'report' | 'datamodel' | 'dashboard' | 'xlreport') => void;
```
`deleteEntity` type (line 449):
```typescript
        deleteEntity: (id: number, type: 'report' | 'datamodel' | 'dashboard' | 'xlreport') => void;
```

- [ ] **Step 9: Include xlReports in JSON export (`exportJson`, ~lines 485-492)**

```typescript
        const reports = await db.reports.toArray();
        const dataModels = await db.dataModels.toArray();
        const dashboards = await db.dashboards.toArray();
        const xlReports = await db.xlReports.toArray();
        const exportData = {
            generated: new Date().toISOString(),
            version: '1.0',
            appVersion: '3.1',
            library: { reports, dataModels, dashboards, xlReports },
        };
```

- [ ] **Step 10: Handle delete (`deleteEntity`, ~lines 514-519)**

Change the signature and body:
```typescript
window.deleteEntity = async (id: number, type: 'report' | 'datamodel' | 'dashboard' | 'xlreport') => {
    const typeLabel =
        type === 'report' ? 'Report' : type === 'datamodel' ? 'Data Model' : type === 'dashboard' ? 'Dashboard' : 'XlOne Report';
    if (confirm(`Are you sure you want to delete this ${typeLabel}?`)) {
        if (type === 'report') await db.reports.delete(id);
        else if (type === 'datamodel') await db.dataModels.delete(id);
        else if (type === 'dashboard') await db.dashboards.delete(id);
        else if (type === 'xlreport') await db.xlReports.delete(id);
        render();
    }
};
```

- [ ] **Step 11: Verify it compiles + full test suite**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS — tsc clean, all tests green (existing + new XlOne tests).

- [ ] **Step 12: Commit**

```bash
git add src/main.ts
git commit -m "feat(xlone): wire .t1xl into upload, library, detail view, and delete"
```

---

## Task 8: Browser verification with a real sample

**Files:** none (manual verification via the `verify-app` skill).

- [ ] **Step 1: Build to confirm production bundle is clean**

Run: `pnpm build`
Expected: PASS — tsc + vite build + service-worker build all succeed.

- [ ] **Step 2: Verify in the browser**

Use the `verify-app` skill (or `pnpm dev`): load
`samples/XlOne Reports/Transactions_0725a29d-1be8-4651-893a-9ef859fa3661_20251116035704153.t1xl`
and
`samples/XlOne Reports/Balance Sheet Detail_152632e4-8b21-48ce-87b9-ecd3a129beae_20260116124135763.t1xl`.

Expected:
- Both appear under an **XlOne Reports** section on the dashboard; stats tile shows count.
- Opening **Transactions** shows the title, meta grid, Report Settings, and a Column Definition with `ColumnDefn1` and its Transactions data source.
- Opening **Balance Sheet Detail** (sparse) renders without errors (mostly metadata; empty sections simply absent).
- Browser console is clean (no parse errors / no exceptions).
- Delete removes the item and the section disappears when empty.

- [ ] **Step 3: Commit (only if verification surfaced a fix)**

```bash
git add -A
git commit -m "fix(xlone): address issues found in browser verification"
```

---

## Task 9: README roadmap correction

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Mark Dashboards and XlOne done**

In `README.md`, under **📊 Module: BI & Analytics (Active Development)** (lines ~56-66):

Change the Dashboards bullet from `- [ ] **Dashboards (\`.t1db\`)**:` to `- [x] **Dashboards (\`.t1db\`)**:` (it is already shipped).

Change the XlOne bullet from `- [ ] **XlOne Reports (\`.t1xl\`)**:` to `- [x] **XlOne Reports (\`.t1xl\`)**:`.

- [ ] **Step 2: Verify the file reads correctly**

Confirm the two bullets now show `[x]` and the remaining open items (Playlists, Dark Mode, Mobile Responsiveness) are unchanged.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: mark Dashboards and XlOne Reports complete in roadmap"
```

---

## Final verification

- [ ] **All tests pass:** `pnpm exec vitest run` → all green.
- [ ] **Type check clean:** `pnpm exec tsc --noEmit` → no errors.
- [ ] **Lint clean:** `pnpm lint` → no errors.
- [ ] **Build clean:** `pnpm build` → succeeds.
- [ ] **Browser verified:** both samples render, console clean (Task 8).

## Notes for the implementer

- **No new test dependency**: the generator test `vi.mock`s `../src/lib/db` (matching `tests/DataModelGenerator.test.ts`). Do not add `fake-indexeddb`. The mock exposes `xlReports.get` and `dataModels.toArray` — if the generator reads other `db` members, add them to the mock object.
- **Real-sample shape variance**: the in-test fixtures model the Transactions sample. If browser verification (Task 8) shows the real sheet uses different section labels or column offsets, adjust `reconstructSheet` in `XlOneParser.ts` and add a regression fixture — do not loosen the XSS escaping.
- **Do not wire `.docx` export** — out of scope for v1 (the export button already no-ops for unknown types since `exportDocx` only branches on the three existing types; an XlOne detail view will show the Export button but it will do nothing. If that's undesirable, hide the button for `xlreport` — optional polish, not required).
