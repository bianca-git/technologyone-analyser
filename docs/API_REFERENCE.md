# API Reference

## 1. File Processing

### `FileProcessor` (`src/lib/FileProcessor.ts`)
The entry point for handling user uploads.

- **`processAndSave(file: File): Promise<void>`**
  - Detects file type (`.t1etlp` or `.t1dm`).
  - Unzips content if necessary.
  - Extracts metadata (Owner, Date, Description).
  - Delegates parsing to `EtlParser` or `DataModelParser`.
  - Saves result to `db`.

## 2. Parsers

### `EtlParser` (`src/lib/parsers/EtlParser.ts`)
Responsible for parsing ETL Process definitions.

- **`parseSteps(stepsRaw: any, mode: 'business' | 'technical'): ExecutionFlow`**
  - Converts raw XML/JSON steps into a structured `ExecutionTree`.
  - Handles recursion (Groups, Loops).
  - Extracts used variables and tables into Sets.
  - Flattens `IIF` logic for readability.

### `DataModelParser` (`src/lib/parsers/DataModelParser.ts`)
Responsible for parsing Data Model definitions.

- **`parse(xmlContent: string): Promise<DataModel>`**
  - Parses `.t1dm` XML content.
  - Extracts Queries, Joins, Variables, and Indexes.

## 3. Generators

### `EtlGenerator` (`src/lib/generators/EtlGenerator.ts`)
Generates HTML views for ETL processes.

- **`generateHtmlView(id: number, viewMode: 'business' | 'technical'): Promise<string>`**
  - Fetches report from DB.
  - Calls `EtlParser` to get execution flow.
  - Renders Header, Executive Summary, Variables Table, and Recursive Steps.

### `DataModelGenerator` (`src/lib/generators/DataModelGenerator.ts`)
Generates HTML views for Data Models.

- **`generateHtmlView(id: number): Promise<string>`**
  - Fetches data model from DB.
  - Renders Header, Executive Summary.
  - Renders Variables, Indexes, Drilldown Views.
  - Renders Transformation Layers (Queries) and Final Output.
  - Visualizes Joins and Filters.

### `DocxGenerator` (`src/lib/generators/DocxGenerator.ts`)
Generates Microsoft Word documents.

- **`generate(id: number, type: 'etl' | 'datamodel'): Promise<Blob>`**
  - Creates a `docx.Document` object.
  - Mirrors logic of HTML generators but using `Paragraph`, `Table`, `TextRun`.

## 4. Utilities

### `ExpressionFormatter` (`src/lib/formatters/ExpressionFormatter.ts`)
Centralizes text formatting.

- **`colouriseTextHTML(text: string, varSet, tableSet): string`**
  - Highlights variables (e.g., `{&VAR}`, `[MyVar]`) and tables.
- **`formatExpression(expr: string, ...): string`**
  - Parses `CASE` and `IIF` statements into Logic Tables.
  - Fallback to simple colourisation.
- **`renderLogicTable(rules): string`**
  - Renders a structured "Outcome | Condition" table for complex logic.

## 5. UX

### `OfflineVerifier` (`src/lib/ux/OfflineVerifier.ts`)
Enforces air-gapped security.

- **`checkStatus(): Promise<boolean>`**
  - Pings known endpoints (Google, Cloudflare) with `HEAD` requests.
  - Returns `true` only if ALL pings fail or timeout (True Offline).
- **`start(onVerified: () => void)`**
  - Mounts a blocking full-screen overlay.
  - Polls connectivity status.
  - Unblocks UI only when "True Offline" is confirmed.
