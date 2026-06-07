# Remove Business View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Business/Technical view toggle app-wide, leaving a single unified Technical view that retains the SmartDesc AI-insight badges.

**Architecture:** The toggle is a global `currentMode: 'business' | 'technical'` in `main.ts` threaded as a `mode` argument through every generator (`EtlGenerator`, `DataModelGenerator`, `DashboardGenerator`, `MermaidGenerator`, `DocxGenerator`) and the parser (`EtlParser.parseSteps`). We remove the UI control + state, drop the `mode` parameter from every signature, hard-select the technical code paths (full step set, technical context, technical-only sections always shown), and keep SmartDesc rendering unconditional (SmartDesc is already computed mode-independently in the parser). Docs are updated to drop the Business column / Business-vs-Technical sections.

**Tech Stack:** TypeScript, Vite, Vitest, Dexie (IndexedDB), Mermaid, docx. Tests live in `tests/`, run with `pnpm test`.

**Survivor decisions (locked):**
- Survivor view = **Technical** + **SmartDesc** badges always on.
- Parser: always run the technical path — no business filtering (`PurgeTable`/`CreateTable`/`DeleteTable`, inactive steps stay), technical `contextText`.
- Generators: technical-only sections (File Locations, Attachments, Dashboard params, Dashboard detailed widgets) are **always** rendered.
- Mermaid: `isTech` is always true — drop business label-simplification and node-skip branches.
- `EtlSummary.ts` "business calculations" is a plain English string, NOT a mode reference → **no change**.

---

## File Map

| File | Change |
|------|--------|
| `src/main.ts` | Remove `currentMode` state, toggle UI block, `window.setMode`, `setMode` type; drop `mode` args from 4 generator calls + 3 docx calls; fix `dashboardLayout` `parseSteps(..., 'business')` call. |
| `src/lib/parsers/EtlParser.ts` | Drop `mode` param from `parseSteps`; delete business-filtering block; delete business `contextText` branch (keep technical). |
| `src/lib/generators/EtlGenerator.ts` | Drop `mode` from `generateHtmlView` + legacy `parseSteps`; remove `mode ===` conditionals (hard-select technical); render SmartDesc + technical details + tech-only sections unconditionally; remove `${mode} VIEW` badge text → `TECHNICAL VIEW` (or drop badge). |
| `src/lib/generators/DataModelGenerator.ts` | Drop unused `_viewMode` param from `generateHtmlView`. |
| `src/lib/generators/DashboardGenerator.ts` | Drop `mode` param; always render the two `mode === 'technical'` sections. |
| `src/lib/generators/MermaidGenerator.ts` | Drop `mode` param from `generateMermaidSyntax`, `renderToSvg`, `getRawSyntax`, `getFlowChartImage`; set `isTech = true`; remove business simplification/skip branches. |
| `src/lib/generators/DocxGenerator.ts` | Drop `mode` from `downloadDocx` + unused `_mode` from `downloadDataModelDocx`/`downloadDashboardDocx`; always render File Locations + Attachments; render SmartDesc unconditionally; drop `mode` arg to `MermaidGenerator.getFlowChartImage` + `EtlParser.parseSteps`. |
| `tests/MermaidGenerator.test.ts` | Delete/rewrite business-mode tests; drop `mode` args. |
| `tests/EtlParser.test.ts`, `tests/EtlParser.KitchenSink.test.ts`, `tests/EtlGenerator.test.ts` | Drop `'technical'` arg from `parseSteps`/`generateHtmlView` calls. |
| `README.md` | Remove Views feature bullet (#5) + Business View feedback references. |
| `docs/ETL_STRUCTURE.md` | Collapse Business/Technical columns to single "Exposed" column; remove "Business vs Technical Mode Differences" section. |
| `docs/DATAMODEL_STRUCTURE.md` | Same doc treatment (verify Business column present first). |

**Suggested execution order:** parser → generators (Etl, Mermaid, DataModel, Dashboard, Docx) → main.ts wiring → tests → docs. Each task below is self-contained; commit after each.

---

### Task 1: EtlParser — drop mode, hard-select technical

**Files:**
- Modify: `src/lib/parsers/EtlParser.ts`
- Test: `tests/EtlParser.test.ts`

- [ ] **Step 1: Update the failing test first (drop mode arg)**

In `tests/EtlParser.test.ts`, change every `EtlParser.parseSteps(mockSteps, 'technical')` to `EtlParser.parseSteps(mockSteps)` (5 sites: lines ~77, 108, 126, 152, 166). Also in `tests/EtlParser.KitchenSink.test.ts` line ~42.

- [ ] **Step 2: Run to confirm current state still green (arg is currently optional-compatible)**

Run: `pnpm test -- EtlParser`
Expected: PASS (calls without arg use the `= 'technical'` default that still exists).

- [ ] **Step 3: Remove the mode parameter**

In `src/lib/parsers/EtlParser.ts`, change the signature:

```typescript
    static parseSteps(json: XmlValue) {
        const stepsRaw = this.getListSafe(asNode(json)?.ArrayOfStep, 'Step') as RawStep[];
```

- [ ] **Step 4: Delete the business-filtering block**

Remove the entire block (around lines 400-410):

```typescript
            // Business Filtering
            if (mode === 'business') {
                const ignore = ['PurgeTable', 'CreateTable', 'DeleteTable'];
                if (!isActive || ignore.includes(stepType)) {
                    if (stepType !== 'Loop' && stepType !== 'Group' && stepType !== 'Decision' && stepType !== 'Branch')
                        // ... (delete the whole if/continue)
                }
            }
```

Delete the complete `if (mode === 'business') { ... }` statement. Read the exact lines in context first (the block ends with a `continue;`-style skip) and remove it wholesale so no orphaned braces remain.

- [ ] **Step 5: Collapse the business contextText branch to technical-only**

Around line 419 there is `if (mode === 'business') { switch (stepType) { ... contextText = ... } }` followed by (or paired with) the technical context assignment. Remove the business branch entirely; keep only the technical `contextText` assignment that was previously the `else`/technical path. Read lines 416-560 first to identify the exact paired structure, then delete only the business arm.

- [ ] **Step 6: Confirm no remaining `mode` references in the file**

Run: `pnpm exec grep -n "mode" src/lib/parsers/EtlParser.ts`
Expected: only unrelated hits (`modeCode`, `modeMap`, `modeDesc`, `TransactionMode`, `ProcessMode`, `LogLevel`-adjacent) — NO `mode === 'business'` / `mode === 'technical'` / `mode:` param.

- [ ] **Step 7: Run tests**

Run: `pnpm test -- EtlParser`
Expected: PASS. (KitchenSink asserts on parsed structure; with business filtering gone, the technical path was already the default it ran under, so output is unchanged.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/parsers/EtlParser.ts tests/EtlParser.test.ts tests/EtlParser.KitchenSink.test.ts
git commit -m "refactor(parser): remove business mode from EtlParser.parseSteps"
```

---

### Task 2: MermaidGenerator — drop mode, isTech always true

**Files:**
- Modify: `src/lib/generators/MermaidGenerator.ts`
- Test: `tests/MermaidGenerator.test.ts`

- [ ] **Step 1: Rewrite the test file to remove business-mode cases**

In `tests/MermaidGenerator.test.ts`:
- Delete the test `it('filters correctly in business mode', ...)` (~lines 43-64).
- In the remaining tests, change `MermaidGenerator.generateMermaidSyntax(mockFlow, 'technical')` → `MermaidGenerator.generateMermaidSyntax(mockFlow)` (and the loop/group/decision tests). The group test at ~line 98 used `'business'` — change it to no-arg and update any assertion that depended on business simplification to assert the technical label instead (the node should now render with its full label, no `⚙️`/`🔢` prefix and no skip).

- [ ] **Step 2: Run to confirm it fails (signature still requires mode)**

Run: `pnpm test -- MermaidGenerator`
Expected: FAIL or type error — tests call with no arg but signature still has required `mode`.

- [ ] **Step 3: Remove mode from all four signatures**

In `src/lib/generators/MermaidGenerator.ts`:

```typescript
    static generateMermaidSyntax(flow: any[]): string {
        const isTech = true;
        let graph = 'flowchart TD\n';
```

```typescript
    static async renderToSvg(flow: any[], id: string = 'mermaid-chart'): Promise<string> {
        await this.initialize();
        const mermaid = await this.load();
        const syntax = this.generateMermaidSyntax(flow);
```

```typescript
    static getRawSyntax(flow: any[]): string {
        return this.generateMermaidSyntax(flow);
    }
```

```typescript
    static async getFlowChartImage(flow: any[]): Promise<string> {
        const svg = await this.renderToSvg(flow, 'mermaid-hidden-' + Date.now());
```

- [ ] **Step 4: Remove business-only branches**

With `isTech = true` constant, delete the now-dead `if (!isTech) { ... }` branches: the `label = '⚙️' + ...` (~line 171), `label = '🔢' + ...` (~line 176), and the `if (!isTech && ...) { ... return; }` skip block (~lines 180-193). Keep the technical shape/label assignments. Optionally remove the `const isTech = true;` line and any remaining `isTech` references by inlining, but leaving the constant is acceptable and lower-risk — prefer deleting dead `if (!isTech)` branches and keeping `isTech` if other `if (isTech)` branches read cleaner.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- MermaidGenerator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/generators/MermaidGenerator.ts tests/MermaidGenerator.test.ts
git commit -m "refactor(mermaid): remove business mode, render technical flow only"
```

---

### Task 3: EtlGenerator — drop mode, SmartDesc + tech sections always on

**Files:**
- Modify: `src/lib/generators/EtlGenerator.ts`
- Test: `tests/EtlGenerator.test.ts`

> **CAUTION:** This file contains pre-existing literal backslash artifacts (`<\p>`, `<\span>`, `\ --- Section ...` comments). Do NOT "fix" these as part of this task — touch only mode-related lines so the diff stays reviewable. They can be cleaned in a separate commit.

- [ ] **Step 1: Update tests to drop the mode arg**

In `tests/EtlGenerator.test.ts`, change every `EtlGenerator.generateHtmlView(<id>, 'technical')` → `EtlGenerator.generateHtmlView(<id>)` (5 sites: lines ~30, 55, 91, 121, 145).

- [ ] **Step 2: Run to confirm still green (default makes arg optional)**

Run: `pnpm test -- EtlGenerator`
Expected: PASS (mode still defaults; arg now omitted).

- [ ] **Step 3: Remove mode from signatures**

```typescript
    static async generateHtmlView(reportId: number): Promise<string> {
        const report = await db.reports.get(reportId);
        if (!report) return '<p class="text-red-500">Report not found</p>';

        const flowData = EtlParser.parseSteps(report.rawSteps);
```

And the legacy wrapper:

```typescript
    static parseSteps(json: any) {
        return EtlParser.parseSteps(json);
    }
```

- [ ] **Step 4: Hard-select technical in every conditional**

Apply each of these (read surrounding context to match exactly):

- `metaGrid`: replace `mode === 'technical' ? (A) : (B)` with just `(A)` (the technical grid).
- `getRawSyntax(flowData.executionTree, mode)` → `getRawSyntax(flowData.executionTree)`.
- `Process Flow (${mode})` heading → `Process Flow`.
- `${mode} VIEW` badge (~line 208) → `TECHNICAL VIEW` (keep the badge styling).
- Variables table: `Col2: mode === 'technical' ? v.Type || 'Var' : ''` → `Col2: v.Type || 'Var'`; `Col3: mode === 'technical' ? v.OriginStep || '-' : ''` → `Col3: v.OriginStep || '-'`. Header ternary (~line 241) → keep the technical header array.
- Params: `buildBadges` `if (mode !== 'technical') return '';` → delete that guard (always build badges). `paramRows = mode === 'technical' ? (A) : (B)` → `(A)`. `headers = mode === 'technical' ? (A) : (B)` → `(A)`. `<details ${mode === 'technical' ? 'open' : ''}>` → `<details open>`.
- File Locations: `if (fileLocations.length > 0 && mode === 'technical')` → `if (fileLocations.length > 0)`.
- Attachments: `if (attachments.length > 0 && mode === 'technical')` → `if (attachments.length > 0)`.
- TableData render guard (~line 467): `mode === 'technical' || [..whitelist..].includes(...)` → just render always: `if (item.TableData && item.TableData.length) { ... }` (technical shows all tables anyway, so the whitelist is subsumed).
- Loop badge (~line 551): `isLoop && mode === 'business' ? <badge> : ''` → `''` (drop the business-only Loop Sequence badge), OR `isLoop ? <badge> : ''` to keep it always. **Choose drop (`''`)** — it was a business-mode affordance.
- SmartDesc (~line 556): `mode === 'business' && item.SmartDesc ? <span>...` → `item.SmartDesc ? <span>...` (ALWAYS show).
- RawType span (~line 627): `mode === 'technical' ? <span>(${item.RawType})</span> : ''` → `<span>(${item.RawType})</span>` (always).
- Second Context/SmartDesc block (~line 634-640): keep the Context div unconditionally; change `mode === 'business' && item.SmartDesc` → `item.SmartDesc`.
- `mode === 'technical' ? this.renderStepTechnicalDetails(item) : ''` (~line 644) → `this.renderStepTechnicalDetails(item)` (always).

- [ ] **Step 5: Confirm no remaining mode-conditional references**

Run: `pnpm exec grep -n "mode ===" src/lib/generators/EtlGenerator.ts`
Expected: no matches. Then `pnpm exec grep -n "': 'business'\|'technical'" src/lib/generators/EtlGenerator.ts` — only the (now-removed) — expect none for the union type param.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm test -- EtlGenerator`
Expected: PASS.
Run: `pnpm exec tsc --noEmit`
Expected: no errors in EtlGenerator.ts.

- [ ] **Step 7: Commit**

```bash
git add src/lib/generators/EtlGenerator.ts tests/EtlGenerator.test.ts
git commit -m "refactor(etl-view): remove business mode, keep SmartDesc always on"
```

---

### Task 4: DataModelGenerator — drop unused mode param

**Files:**
- Modify: `src/lib/generators/DataModelGenerator.ts`
- Test: `tests/DataModelGenerator.test.ts` (already calls no-arg — no change expected)

- [ ] **Step 1: Remove the unused param**

```typescript
    static async generateHtmlView(id: number): Promise<string> {
        const dm = await db.dataModels.get(id);
        if (!dm) throw new Error('Data Model not found');
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- DataModelGenerator`
Expected: PASS (tests already call `generateHtmlView(202)` etc. with no mode).

- [ ] **Step 3: Commit**

```bash
git add src/lib/generators/DataModelGenerator.ts
git commit -m "refactor(datamodel-view): drop unused viewMode param"
```

---

### Task 5: DashboardGenerator — drop mode, always show tech sections

**Files:**
- Modify: `src/lib/generators/DashboardGenerator.ts`
- Test: none dedicated (verify via tsc + manual). If a dashboard fixture test exists, update calls.

- [ ] **Step 1: Remove the param**

```typescript
    static async generateHtmlView(id: number): Promise<string> {
        const dashboard = await db.dashboards.get(id);
        if (!dashboard) throw new Error('Dashboard not found');
```

- [ ] **Step 2: Always render the two technical sections**

- `if (dashParamsList.length > 0 && mode === 'technical')` (~line 204) → `if (dashParamsList.length > 0)`.
- `if (visualizations.length > 0 && mode === 'technical')` (~line 265) → `if (visualizations.length > 0)`.
- Update the comment `// --- Detailed Widgets Section (Technical View Only) ---` → `// --- Detailed Widgets Section ---`.

- [ ] **Step 3: Confirm no remaining mode references**

Run: `pnpm exec grep -n "mode" src/lib/generators/DashboardGenerator.ts`
Expected: no `mode ===` / `mode:` param hits.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in DashboardGenerator.ts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/generators/DashboardGenerator.ts
git commit -m "refactor(dashboard-view): remove business mode, show all sections"
```

---

### Task 6: DocxGenerator — drop mode, always export full detail + SmartDesc

**Files:**
- Modify: `src/lib/generators/DocxGenerator.ts`
- Test: none dedicated (verify via tsc).

- [ ] **Step 1: Remove params from the three download methods**

```typescript
    static async downloadDocx(reportId: number) {
        const report = await db.reports.get(reportId);
        if (!report) throw new Error('Report not found');

        const flowData = EtlParser.parseSteps(report.rawSteps);
```

```typescript
    static async downloadDataModelDocx(id: number) {
```

```typescript
    static async downloadDashboardDocx(id: number) {
```

- [ ] **Step 2: Drop mode from the Mermaid call**

`MermaidGenerator.getFlowChartImage(flowData.executionTree, mode)` → `MermaidGenerator.getFlowChartImage(flowData.executionTree)`.

- [ ] **Step 3: Always render File Locations + Attachments**

The block `if (mode === 'technical') { ... File Locations ... Attachments ... }` (~lines 191-...) — remove the `if (mode === 'technical')` wrapper, keeping its body (the File Locations and Attachments sub-blocks) executing unconditionally. Read the block to find its closing brace and de-indent / unwrap correctly.

- [ ] **Step 4: Always render SmartDesc**

`if (mode === 'business' && item.SmartDesc) {` (~line 299) → `if (item.SmartDesc) {`.

- [ ] **Step 5: Confirm no remaining mode references**

Run: `pnpm exec grep -n "mode" src/lib/generators/DocxGenerator.ts`
Expected: no `mode ===` / `mode:` param hits (string `'Mode: ...'` Detail literals and `ProcessMode`/`TransactionMode` are fine).

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in DocxGenerator.ts.

- [ ] **Step 7: Commit**

```bash
git add src/lib/generators/DocxGenerator.ts
git commit -m "refactor(docx): remove business mode, always export full detail + SmartDesc"
```

---

### Task 7: main.ts — remove toggle UI, state, and thread-through

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Remove the mode state**

Delete line: `let currentMode: 'business' | 'technical' = 'business';` (~line 34).

- [ ] **Step 2: Fix the dashboard summary parse call**

`EtlParser.parseSteps(r.rawSteps, 'business')` (~line 85) → `EtlParser.parseSteps(r.rawSteps)`.

- [ ] **Step 3: Remove the toggle UI block**

Delete the `<div class="bg-white p-1 rounded-xl ...">` containing the two `mode-btn` buttons (~lines 189-192) in the detail toolbar.

- [ ] **Step 4: Drop mode from the three generator HTML calls**

```typescript
            if (currentType === 'report') {
                html = await EtlGenerator.generateHtmlView(currentReportId);
            } else if (currentType === 'datamodel') {
                html = await DataModelGenerator.generateHtmlView(currentReportId);
            } else if (currentType === 'dashboard') {
                html = await DashboardGenerator.generateHtmlView(currentReportId);
            }
```

- [ ] **Step 5: Remove setMode (window decl, type, and impl)**

- Delete `setMode: (mode: 'business' | 'technical') => void;` from the `Window` interface (~line 316).
- Delete the `window.setMode = (mode) => { currentMode = mode; render(); };` block (~lines 335-338).

- [ ] **Step 6: Drop mode from the three docx download calls**

```typescript
            if (currentType === 'report') {
                await DocxGenerator.downloadDocx(currentReportId);
            } else if (currentType === 'datamodel') {
                await DocxGenerator.downloadDataModelDocx(currentReportId);
            } else if (currentType === 'dashboard') {
                await DocxGenerator.downloadDashboardDocx(currentReportId);
            }
```

- [ ] **Step 7: Confirm clean**

Run: `pnpm exec grep -n "currentMode\|setMode\|'business'\|mode-btn" src/main.ts`
Expected: no matches.

- [ ] **Step 8: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.
Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m "refactor(ui): remove business/technical view toggle"
```

---

### Task 8: Optional CSS cleanup — `.mode-btn`

**Files:**
- Modify: whichever CSS file defines `.mode-btn` (search first).

- [ ] **Step 1: Find the rule**

Run: `pnpm exec grep -rn "mode-btn" src/`
Expected: if matches remain only in a CSS/style file, remove the `.mode-btn` and `.mode-btn.active` rules. If no matches, skip this task.

- [ ] **Step 2: Commit (only if a change was made)**

```bash
git add -A
git commit -m "chore(css): remove dead .mode-btn styles"
```

---

### Task 9: Docs — README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove the Views feature bullet**

Delete bullet #5 under **Key Features**:
`5.  **Views**: Toggle between "Business" (high-level) and "Technical" (detailed) perspectives.`
Renumber the following bullet (Offline Security) if numbering matters, or leave as a bulleted list.

- [ ] **Step 2: Update the Call for Feedback section**

In **📢 Call for Feedback**, item 1 references `"Business View"`:
`1.  **ETL Visualisation**: Does the "Business View" accurately summarise...`
Reword to drop the Business View framing, e.g.:
`1.  **ETL Visualisation**: Does the technical view accurately represent your complex ETL processes? Are complex loops and branches rendering logically?`

- [ ] **Step 3: Update the Roadmap Data Models bullet**

Under **📊 Module: BI & Analytics**, remove the sub-bullet:
`- Business/Technical view toggles.`

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): remove business view references"
```

---

### Task 10: Docs — ETL_STRUCTURE.md

**Files:**
- Modify: `docs/ETL_STRUCTURE.md`

- [ ] **Step 1: Collapse Business/Technical table columns**

Every table with `| Business | Technical |` paired columns (Metadata Fields, ExecutionStep Fields, Step Types tables, Variables Collection, DataDictionary, ExistsLogic, Import Options, Criteria, Process Parameters, File Locations, Attachments, DOCX Export sections) should collapse to a single column. Convert the two columns into one `| Exposed |` (or remove the columns entirely where every row was "Yes/Yes"). For rows previously `Business: No / Technical: Yes` (e.g. `RawType`, `Depth`, `narration`, File Locations, Attachments), they are now always exposed → `Yes`. For rows previously `Business: Yes / Technical: No` (`SmartDesc`), still exposed → `Yes`.

Practical approach: replace each `| Business | Technical |` header pair with a single `| Exposed |` column and set each cell to `Yes` (everything is now shown), EXCEPT note that `SmartDesc` and technical-only fields are all surfaced in the single view.

- [ ] **Step 2: Remove the "Business vs Technical Mode Differences" section**

Delete the entire `### Business vs Technical Mode Differences` block (the **Business Mode:** / **Technical Mode:** bullet lists, ~lines 95-110).

- [ ] **Step 3: Remove Business/Technical split in the Mermaid Diagram Generation section**

Delete the `**Business Mode:**` vs `**Technical Mode:**` bullet split (~lines 360-369); replace with a single description of the technical flowchart (full labels, all steps, color-coded by type).

- [ ] **Step 4: Remove the "Business Context" column from Step Types tables**

The Step Type tables have `| Business Context | Technical Context |`. Collapse to a single `| Context |` column using the Technical Context value. Drop "Hidden in Business" notes (e.g. `CreateTable` row).

- [ ] **Step 5: Commit**

```bash
git add docs/ETL_STRUCTURE.md
git commit -m "docs(etl-structure): remove business/technical split"
```

---

### Task 11: Docs — DATAMODEL_STRUCTURE.md

**Files:**
- Modify: `docs/DATAMODEL_STRUCTURE.md`

- [ ] **Step 1: Inspect for Business columns**

Run: `pnpm exec grep -n "Business" docs/DATAMODEL_STRUCTURE.md`
If matches exist, apply the same collapse treatment as Task 10 (paired columns → single `Exposed`; remove any Business-vs-Technical narrative section). If no matches, skip and note "no changes needed".

- [ ] **Step 2: Commit (only if changed)**

```bash
git add docs/DATAMODEL_STRUCTURE.md
git commit -m "docs(datamodel-structure): remove business/technical split"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full grep sweep for stragglers**

Run: `pnpm exec grep -rni "business" src/`
Expected: only the EtlSummary `performs business calculations` string literal (intentional). Anything else → investigate.

Run: `pnpm exec grep -rn "'business' | 'technical'\|mode ===" src/`
Expected: no matches.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Full test suite**

Run: `pnpm test`
Expected: all PASS.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: build succeeds (`tsc && vite build && node scripts/build-sw.js`).

- [ ] **Step 5: Manual smoke (preview)**

Run: `pnpm dev`, open the app, upload a `.t1etlp`, confirm: no toggle in toolbar; ETL detail renders with full steps + 💡 SmartDesc badges + RawType labels + File Locations/Attachments; DOCX export works. Repeat for `.t1dm` and `.t1db`.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for business-view removal"
```

---

## Self-Review Notes

- **Spec coverage:** Scope = all modules (Tasks 1-7 cover ETL parser/view, Mermaid, DataModel, Dashboard, Docx, main UI). Survivor = technical + SmartDesc (Tasks 1,3,6 keep SmartDesc unconditional; technical paths hard-selected). Docs (Tasks 9-11). Tests (folded into 1,2,3). ✅
- **`EtlSummary.ts`:** intentionally untouched — `business` there is an English word, not a mode. Flagged in Task 12 grep as expected.
- **Pre-existing file artifacts** (`<\p>`, `\ ---`) in EtlGenerator/DataModelGenerator: out of scope, flagged caution in Task 3.
- **Type consistency:** `parseSteps(json)`, `generateHtmlView(id)`, `getFlowChartImage(flow)`, `getRawSyntax(flow)`, `generateMermaidSyntax(flow)`, `downloadDocx(id)` — all single-arg after refactor; call sites updated in Tasks 3,6,7. ✅
- **Risk:** removing the parser business-filter changes dashboard summary input (now includes utility/inactive steps). `generateSummary` summarizes sources/targets, not step count, so output is stable — verified by reading `EtlSummary.ts` (no mode/count dependency).
