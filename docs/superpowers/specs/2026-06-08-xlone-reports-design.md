# XlOne Reports (`.t1xl`) Module — Design

**Date:** 2026-06-08
**Status:** Approved (brainstorming) → ready for implementation plan
**Author:** brainstorming session

## Summary

Add a new file-format module to TechnologyOne Analyser that parses TechnologyOne
**XlOne report definition** files (`.t1xl`), stores them in IndexedDB, and renders a
technical HTML view. The module mirrors the existing, proven **Dashboard** (`.t1db`)
pipeline: **detect → parse → store → render**.

A `.t1xl` is a ZIP containing:

- **`Report.xml`** — thin metadata wrapper (`MyXLOneHeader`) plus an HTML-entity-escaped
  nested `DbReportDef` XML inside its `<Definition>` element. Carries title, type, owner,
  folder, the **datasource GUID** (the Data Model dependency), report suite, layout type,
  grouping/subtotal config, criteria, and distribution (email/folder) settings.
- **`<Title>.xlsx`** — an embedded Excel workbook whose single **"Definition"** worksheet
  holds the *real substance* of the report spec as a labelled grid: Report Settings,
  Report Variables, Column Definition (including the Data Model **name + GUID inside a
  cell**), Criteria, and Row Commands.

We parse **both**: structured `Report.xml` **and** a full reconstruction of the embedded
xlsx Definition sheet. No new dependency is required — `jszip` and `fast-xml-parser` are
already in the stack and handle both the outer `.t1xl` ZIP and the inner `.xlsx` ZIP.

## Scope

### In scope (v1)

- Parse `Report.xml` into a structured object.
- Parse the embedded `.xlsx` Definition sheet into structured sections.
- Store parsed result in a new IndexedDB store (`xlReports`).
- Render an HTML technical view (collapsible sections, styled like the Dashboard view).
- Cross-module lineage: link a report's data source to a stored Data Model when the GUID
  matches.
- Fixture-driven tests against both sample files.
- README roadmap correction (mark Dashboards ✅ done, XlOne ✅ done on landing).

### Out of scope (v1) — YAGNI

- `.docx` export for XlOne reports (deferred to a follow-up; the other three modules have
  it, parity can come later).
- Parsing *rendered report data* (live query result rows). We parse the report
  **definition**, not its output. The xlsx Definition sheet is the spec, not result rows.
- Playlists (`.t1pl`), Dark Mode, Mobile Responsiveness — each its own separate spec.

## Architecture

New module following the Dashboard pattern exactly. No architectural changes to the
central controller.

### New files

- **`src/lib/parsers/XlOneParser.ts`** — ingestion: outer unzip → parse `Report.xml`
  (structured, unescaping the nested `DbReportDef`) → inner unzip the `.xlsx` → reconstruct
  the Definition sheet grid → return `XlReportParsed`.
- **`src/lib/generators/XlOneGenerator.ts`** — `XlReportParsed` → HTML string. Mirrors
  `DashboardGenerator`.
- **`tests/XlOneParser.test.ts`** — fixture-driven tests.

### Changed files

- **`src/lib/parsers/types.ts`** — add `XlReportParsed` interface and supporting section
  types. No `any` on the XML spine; use `XmlNode` / `XmlValue` / `asNode()`.
- **`src/lib/db.ts`** — Dexie `version(4).stores({ xlReports: '++id, filename, dateAdded' })`,
  new `xlReports!: Table<XlReport>` field, new `XlReport` interface (matches the shape of
  `Dashboard`: `id?`, `filename`, `metadata`, `content`, `dateAdded`).
- **`src/lib/FileProcessor.ts`** — add `.t1xl` branch in `processAndSave()` →
  `processXlReport(file)` which calls `XlOneParser.parse`, derives metadata, and
  `db.xlReports.add(...)`.
- **`src/main.ts`** — ~10 integration sites (see Integration Points below).

## Parsing strategy

`XlOneParser.parse(file: File): Promise<XlReportParsed>`

1. **Outer unzip** with jszip → locate `Report.xml` and the `*.xlsx` entry.
2. **Parse `Report.xml`** with fast-xml-parser. The `<Definition>` element contains
   HTML-entity-escaped XML (`&lt;DbReportDef&gt;...`). Reuse the existing
   `deepParseAllXml` approach (already in `DashboardParser` / `FileProcessor`) to unescape
   and parse the nested `DbReportDef`. Extract:
   - Header (`MyXLOneHeader`): `ReportId`, `Title`, `Description`, `Category`, `Type`,
     `SheetName`, `UserId`, `Datasource` (GUID), `ReportingSystem`, `ParentFileItemPath`,
     `ReportStorageType`.
   - Definition (`DbReportDef`): `DefKey`, `ReportSuite`, `LayoutType`, grouping/subtotal
     config, criteria, distribution fields (parse defensively — mostly `IsAssigned="false"`
     in samples).
3. **Inner unzip the embedded `.xlsx`** — read its bytes via jszip, then `JSZip.loadAsync`
   on those bytes. Read `xl/sharedStrings.xml` and `xl/worksheets/sheet1.xml`.
4. **Grid reconstruction**:
   - Build the shared-strings array from `sharedStrings.xml` (`<si>` → concatenated `<t>`
     text).
   - Walk `sheet1.xml` rows/cells. A cell with `t="s"` has `<v>N</v>` where `N` indexes the
     shared-strings array. Build a `Map<cellRef, string>` (e.g. `A1` → `"FORMAT CIAXLONE
     REPORT"`).
   - Detect section headers by label (`REPORT SETTINGS`, `REPORT VARIABLES`,
     `COLUMN DEFINITION`, `ROW COMMANDS`) and parse each block into structured sections:
     - **Settings**: key/value rows (`Description:`, `Narration:`, `Created By:`,
       `Destination:`, `Protection:`). The `Destination`/`Protection` values are
       `key=val;key=val;` strings — split into sub-key/value pairs.
     - **Variables**: table rows (Variable / Description / Type/Edit / Value / List Values).
     - **Column Definition(s)**: `Name`, `Data Source` (carries `Name (System) (GUID)`),
       `Parameters` (`key=val;` string), `Runtime` (`key=val;` string), `Criteria` table
       (Column Name / Action / Field / Details / Display).
     - **Row Commands**: table (Command / Details / Selection / Search / Value (Fr) /
       Value (To)).
5. Return:
   ```
   XlReportParsed {
     header: { ...metadata fields... }
     definition: { ...DbReportDef fields... }
     sheet: {
       settings: Record<string, string>
       variables: VariableRow[]
       columns: ColumnDefn[]      // each with dataSource { name, system, guid }, criteria[]
       rowCommands: RowCommand[]
     }
   }
   ```

### Guards (per CLAUDE.md)

- Falsy checks use `== null`, not `!val` — `0`, `''`, and seq-`0` are valid data.
- Extract leaf text via `#text` handling for attributed nodes.
- Handle the **sparse case** (the Balance Sheet sample has empty Variables/Columns) without
  throwing — empty sections render as absent, not as errors.

## Rendering + Data Model linkage

`XlOneGenerator.generateHtmlView(id: number): Promise<string>` returns an HTML string,
styled like the Dashboard view (`doc-header` + collapsible `<details>` sections):

- **Header**: title + "XlOne Report" badge + meta grid (owner, folder, datasource, report
  suite, type, created-by).
- **Report Settings** card — destination/protection/narration, decoded from the
  `key=val;key=val` cell strings into readable rows.
- **Variables** table.
- **Column Definitions** — each rendered with its **Data Source** as a chip. The cell
  carries `Name (System) (GUID)`. If that GUID matches a Data Model already stored in
  IndexedDB, render a **clickable link** to that Data Model view (cross-module lineage —
  same idea as the Dashboard "Data Model Dependencies" section). Otherwise render the name
  as plain (escaped) text.
- **Criteria** + **Row Commands** tables.

### Security (CLAUDE.md hard rule)

Every file-derived value — title, cell strings, GUIDs, parameter values, data-source names
— **MUST** pass through `ExpressionFormatter.escapeHtml()` before interpolation into any
HTML string. XSS has regressed in these generators 3× (SmartDesc, `main.ts` itemRow,
`EtlGenerator`). Treat any unescaped interpolation of parsed XML/xlsx content as a bug.

## Integration points (`src/main.ts`)

The XlOne module slots in by following the `'dashboard'` pattern at ~10 sites:

1. Import `XlOneGenerator`.
2. Add `'xlreport'` to the item `type` union / typing.
3. Icon + badge label for the new type (item row + `typeLabel`).
4. Section config entry (title "XlOne Reports") in the dashboard sections list.
5. Stats counter (`xlreport: items.filter((i) => i.type === 'xlreport').length`).
6. `accept` attribute on the file input → add `.t1xl`; update the drag/drop hint copy.
7. File load in `render()` dashboard view: `db.xlReports.toArray()` merged into items with
   `type: 'xlreport'`.
8. Detail render dispatch: `html = await XlOneGenerator.generateHtmlView(currentReportId)`
   when type is xlreport.
9. Library/export wiring (`db.xlReports.toArray()` where the other stores are aggregated).
10. Delete handler: `else if (type === 'xlreport') await db.xlReports.delete(id)`.

(The `.docx` download hook is intentionally **not** wired in v1 — deferred.)

## Testing

`tests/XlOneParser.test.ts` — fixture-driven (per CLAUDE.md), using the two sample files in
`samples/XlOne Reports/`:

- **Balance Sheet Detail** (sparse case): assert header metadata parsed (title, type `B`,
  datasource GUID, owner, folder); assert empty Variables/Columns sections do not throw and
  resolve to empty arrays.
- **Transactions** (populated case): assert `ColumnDefn1` extracted; assert the Data Source
  GUID `7f09c258-8b0e-40a8-851d-9d49c0ba6215` is captured and split into name/system/guid;
  assert Settings `key=val` strings (Destination, Protection) decode into sub-pairs.
- **XSS fixture** (synthetic): a Definition cell containing `<script>alert(1)</script>` →
  assert the rendered generator output escapes it (no raw `<script>`).

## README fix

Reconcile the stale roadmap with real code state under **📊 Module: BI & Analytics**:

- Mark `Dashboards (.t1db)` as ✅ done — already shipped (parser + generator + 8 samples +
  wired into FileProcessor) but currently shown unchecked.
- Mark `XlOne Reports (.t1xl)` as ✅ done when this module lands.

## Open questions

None. Both depth decisions resolved:

- XLSX depth: **full Definition-sheet parse** (chosen).
- DOCX export: **HTML view only for v1**, docx deferred (chosen).
