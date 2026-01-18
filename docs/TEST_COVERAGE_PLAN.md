# Test Coverage Improvement Plan

## Status Update (2026-01-19) - COMPLETED

All planned phases have been executed successfully.
Overall Project Coverage: **82.29%** (Target: >80%)

- `FileProcessor.ts`: **93.33%** ✅
- `EtlParser.ts`: **79.71%** ✅
- `EtlGenerator.ts`: **78.15%** ✅
- `ExpressionFormatter.ts`: **97.01%** ✅
- `DataModelGenerator.ts`: **79.31%** ✅

## Completed Objectives

### 1. `FileProcessor.ts`

- [x] Mock `JSZip` to return valid XML content for `Processes.xml` and `Steps.xml`.
- [x] Verify `processAndSave` handles the full extraction lifecycle.
- [x] Test metadata extraction strategies (Publisher, Date, etc.).
- [x] Test deep parsing of nested Definitions.

### 2. `EtlGenerator.ts`

- [x] Test `generateSummary` with different process types.
- [x] Verify `renderTable` handles Logic Tables vs Standard Tables.
- [x] Test `renderStep` for recursive structures (Loops, Groups).
- [x] Verify `Step Notes` UI generation.

### 3. `EtlParser.ts`

- [x] Add complex `IIF` nesting cases to `flattenLogic`.
- [x] Test `parseSteps` with deep hierarchy.
- [x] Verify Variable and Table set extraction.
- [x] "Kitchen Sink" test for all step types.

### 4. `ExpressionFormatter.ts`

- [x] Test `colouriseTextHTML` with various variable/table combinations.
- [x] Verify `renderLogicTable` formatting.
- [x] Test regex patterns for edge cases (nested quotes, special chars).

### 5. `DataModelGenerator.ts`

- [x] Mock `DataModelParser` output.
- [x] Test different `ProcessMode` rendering paths.
- [x] Verify "Relationships" (Joins) visualization logic.

## Conclusion

The critical path for the application (ETL Parsing, Data Model Generation, and Formatting) is now well-covered by high-quality unit tests.
Future work should focus on UI Component testing (`src/components/*`) if further coverage increases are required.
