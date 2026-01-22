# ETL Process Data Structure

This document describes all data extracted from TechnologyOne ETL Process files (`.t1etlp`) and indicates which fields are exposed in Business vs Technical reports.

## Overview

An ETL Process file is a ZIP archive containing multiple XML files that define a data transformation workflow. The parser extracts and recursively parses all nested XML content to produce a fully structured object model.

---

## Source Files

| File | Description | Fully Parsed |
|------|-------------|--------------|
| `Processes.xml` | Process metadata (name, version, owner, description) | Yes |
| `Steps.xml` | Step definitions with nested `Definition.StorageObject` XML | Yes |
| `Variables.xml` | Process-level parameters and variables | Yes |
| `FileLocations.xml` | File path references used by the process | Yes |
| `Attachments.xml` | Embedded file attachments | Yes |

---

## Database Schema

```typescript
interface Report {
    id?: number;
    filename: string;
    metadata: {
        name: string;        // Process name
        id: string;          // ProcessId (GUID)
        version: string;     // Version number
        owner: string;       // Publisher username
        description: string; // Process description
        status?: string;     // 'P' = Published, 'D' = Draft
        narration?: string;  // Version narration text
        dateModified?: string; // Last modification date
    };
    rawProcess: any;         // Parsed Processes.xml
    rawSteps: any;           // Parsed Steps.xml
    rawVariables?: any;      // Parsed Variables.xml
    rawFileLocations?: any;  // Parsed FileLocations.xml
    rawAttachments?: any;    // Parsed Attachments.xml
    dateAdded: Date;
    stepNotes?: Record<string, string>; // User-added notes per step
}
```

---

## Metadata Fields

| Field | Source | Business | Technical | Notes |
|-------|--------|:--------:|:---------:|-------|
| `name` | `Process.Name` | Yes | Yes | Display title |
| `id` | `Process.ProcessId` | Yes | Yes | GUID identifier |
| `version` | `Process.Version` | Yes | Yes | Version number |
| `owner` | `Process.Owner` or narration | Yes | Yes | Extracted from "Published by X" |
| `description` | `Process.Description` | Yes | Yes | User-provided description |
| `status` | `Process.Status` | Yes | Yes | P=Published, D=Draft |
| `narration` | `Process.VersionNarration` | No | Yes | Full version notes |
| `dateModified` | `Process.DateSaved` | Yes | Yes | Publication timestamp |

---

## Execution Flow Structure

The parser builds a hierarchical execution tree from `Steps.xml`. Each step is transformed into an `ExecutionStep` object:

### ExecutionStep Fields

| Field | Type | Business | Technical | Description |
|-------|------|:--------:|:---------:|-------------|
| `id` | string | Yes | Yes | Unique identifier (e.g., `RunDirectQuery_GetData`) |
| `Step` | string | Yes | Yes | Step name |
| `RawType` | string | No | Yes | Original step type (e.g., `RunDirectQuery`) |
| `Phase` | string | Yes | Yes | Formatted step type (may include `[DISABLED]`) |
| `Context` | string | Yes | Yes | Human-readable purpose description |
| `SmartDesc` | string | Yes | No | AI-inferred business context |
| `FlowLabel` | string | Yes | Yes | Label used in Mermaid diagrams |
| `Description` | string | Yes | Yes | User-provided step description/narration |
| `IsActive` | boolean | Yes | Yes | Whether step is enabled |
| `Depth` | number | No | Yes | Nesting level in hierarchy |
| `Inputs` | string[] | Yes | Yes | Input table/variable names |
| `Outputs` | string[] | Yes | Yes | Output table/variable names |
| `Output` | object | Yes | Yes | Explicit output `{type, name}` |
| `Details` | string[] | Yes | Yes | Additional context (filters, params) |
| `TableData` | array | Partial | Yes | Column/mapping data tables |
| `Headers` | string[] | Partial | Yes | Table column headers |
| `LogicRules` | array | Yes | Yes | Flattened IIF logic chains |
| `DataDictionary` | array | Yes | Yes | Output column schema |
| `ExistsLogic` | string[] | Yes | Yes | EXISTS filter conditions |
| `children` | array | Yes | Yes | Nested child steps |

### Business vs Technical Mode Differences

**Business Mode:**
- Filters out inactive steps (except structural ones like Loop/Group)
- Filters out utility steps: `PurgeTable`, `CreateTable`, `DeleteTable`
- Shows simplified `Context` descriptions (e.g., "Get data from X")
- Displays `SmartDesc` insights (e.g., "Used in: Step1, Step2")
- Limits technical detail in tables

**Technical Mode:**
- Shows all steps including disabled ones
- Shows raw step types alongside names
- Shows full technical context (e.g., "Connects to source to pull X")
- Displays all table data and column mappings
- Shows variable usage tracking

---

## Step Types

### Data Extraction Steps

| Step Type | Business Context | Technical Context | TableData |
|-----------|-----------------|-------------------|-----------|
| `RunDirectQuery` | "Get data from {table}" | "Connects to source to pull {table}" | Columns: Name, Source, Type, Action |
| `RunTableQuery` | "Use data from {table}" | "Reads internal {table}" | Columns: Name, Source, Type, Action |
| `RunDatasourceQuery` | "{source} -> {target}" | "{datasource} -> {target}" | Columns (if RunSimpleQuery) |
| `RunSimpleQuery` | "{source} -> {target}" | "{datasource} -> {target}" | Columns: Name, Source, Type, Action |
| `LoadTextFile` | "{step type}" | "Load Text File into {table}" | None |

### Transformation Steps

| Step Type | Business Context | Technical Context | TableData |
|-----------|-----------------|-------------------|-----------|
| `AddColumn` | "Calculate fields" | "Calculates fields in {table}" | Columns: Field, Formula, Type + LogicRules |
| `UpdateColumn` | "Update fields" | "Updates values in {table}" | Columns: Field, Formula, Type + LogicRules |
| `JoinTable` | "Combine with {table2}" | "{step type}" | Joins: Left, Condition |
| `CreateTable` | Hidden in Business | "Create Table: {name}" | Columns: Name, Type |
| `AppendTable` | "{step type}" | "Append to: {table}" | None |

### Variable Steps

| Step Type | Business Context | Technical Context | TableData |
|-----------|-----------------|-------------------|-----------|
| `SetVariable` | "{var} = {value}" | "{var} = <code>{value}</code>" | Variable, Expression, Type + LogicRules |
| `CalculateVariable` | "{var} = {expr}" | "{var} = <code>{expr}</code>" | Variable, Expression, Type + LogicRules |

### Output Steps

| Step Type | Business Context | Technical Context | TableData |
|-----------|-----------------|-------------------|-----------|
| `ImportWarehouseData` | "Save to {target}" | "Save to Warehouse: {target}" | Mappings: Target, Source, Type, Origin |
| `DeleteWarehouseData` | "Remove data from {target}" | "Delete Warehouse Data: {target}" | None |
| `ExportToExcel` | "{step type}" | "Export to Excel: {file}" | None |
| `SendEmail` | "{step type}" | "Email: \"{subject}\"" | None |
| `SaveText` / `SaveTextfile` | "{step type}" | "Save Text: {file}" | None |

### Control Flow Steps

| Step Type | Business Context | Technical Context | TableData |
|-----------|-----------------|-------------------|-----------|
| `Group` | Container | Container | Children rendered inside |
| `Loop` | "Repeat for {iterator}" | "Repeat for {iterator}" | Children rendered inside |
| `Decision` | Container | "Decision on {table}" | Children rendered inside |
| `Branch` | "If {expression}" | "If {expression}" | Children rendered inside |

---

## Variables Collection

Variables are collected from two sources:
1. **Step-defined variables**: From `SetVariable` and `CalculateVariable` steps
2. **Loop iterators**: From `Loop` steps with `InputVariable`

| Field | Business Label | Technical Label | Description |
|-------|---------------|-----------------|-------------|
| `Name` | "Parameter" | "Variable Name" | Variable identifier |
| `Value` | "Setting" | "Value / Expression" | Default value or expression |
| `Type` | N/A | "Type" | `Var` or `Iterator` |

---

## Additional Extracted Data

### DataDictionary (Output Schema)

Extracted from `DynamicFields.Field` or `OutputTableDefinition.Columns`:

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| `Name` | Yes | Yes | Output column name |
| `Type` | Yes | Yes | Data type |
| `Length` | Yes | Yes | Max length (if defined) |
| `Description` | Yes | Yes | Column description |

### ExistsLogic (Filters)

Extracted from `ExistsFilters.ExistsFilterItem`:

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| Full expression | Yes | Yes | e.g., "NOT EXISTS IN TableX WHERE Field1 = Column1" |

### Import Options

| Option Code | Meaning | Business | Technical |
|-------------|---------|:--------:|:---------:|
| `IU` | Insert or Update | Yes | Yes |
| `I` | Insert Only | Yes | Yes |
| `U` | Update Only | Yes | Yes |
| `D` | Delete | Yes | Yes |
| `R` | Replace | Yes | Yes |

### Criteria/Filters

Extracted from `Criteria`, `WarehouseCriteria`, `SourceCriteria`:

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| Full filter string | Yes | Yes | e.g., "ColumnId = Value1" |

---

## Process Parameters (Variables.xml)

Process parameters are runtime inputs that can be set when executing the ETL process. They are extracted from `Variables.xml` and displayed in a dedicated section.

### Source Structure

```typescript
{
    ArrayOfC2GenericVariable: {
        C2GenericVariable: [{
            VariableId: string,         // GUID
            OwnerId: string,            // Links to ProcessId
            Name: string,               // Parameter name
            Description: string,        // User description
            VariableType: string,       // A=String, N=Numeric, D=Date, L=List
            DefaultValue: string,       // Default value
            IsDisplayable: string,      // "true"/"false"
            IsEditable: string,         // "true"/"false"
            IsMandatory: string,        // "true"/"false" - Required flag
            Sequence: number            // Display order
        }]
    }
}
```

### Display Fields

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| `Name` | Yes | Yes | Parameter identifier |
| `VariableType` | Yes | Yes | Resolved type (String, Numeric, Date, List) |
| `DefaultValue` | Yes | Yes | Default value if not provided |
| `Description` | Yes | Yes | User-provided description |
| `IsMandatory` | Yes | Yes | Required/Optional badge |

### Type Resolution

| Code | Resolved Type |
|------|--------------|
| `A` | String |
| `N` | Numeric |
| `D` | Date |
| `L` | List |
| `I` | Integer |

---

## File Locations (FileLocations.xml)

File locations define where ETL steps read/write files. They are referenced by steps like `ExportToExcel`, `LoadTextFile`, and `SaveText`.

### Source Structure

```typescript
{
    ArrayOfFileLocation: {
        FileLocation: [{
            ProcessId: string,          // Links to ProcessId
            Name: string,               // Location alias
            LocationType: string,       // ServerFolder, FTP, etc.
            Description: string,        // User description
            Definition: {               // Nested XML (parsed)
                ServerFolder: string,   // T1 system variable or path
                SubPath: string,        // Subdirectory
                OverrideSuite: string,  // Suite override
                AllowUpload: string     // "true"/"false"
            }
        }]
    }
}
```

### Display Fields

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| `Name` | No | Yes | Location alias |
| `LocationType` | No | Yes | ServerFolder, FTP, etc. |
| `Path` | No | Yes | Combined ServerFolder + SubPath |
| `Description` | No | Yes | User description |

**Note:** File Locations are only shown in Technical mode.

---

## Attachments (Attachments.xml)

Attachments are embedded files included with the process (scripts, templates, configuration files, etc.).

### Source Structure

```typescript
{
    ArrayOfAttachment: {
        Attachment: [{
            AttachmentId: string,       // GUID
            FileName: string,           // Original filename
            FileData: string,           // Base64 encoded content
            Description: string         // User description
        }]
    }
}
```

### Display Fields

| Field | Business | Technical | Description |
|-------|:--------:|:---------:|-------------|
| `FileName` | No | Yes | Original filename |
| `Description` | No | Yes | User description |
| `Size` | No | Yes | Calculated from Base64 length |

**Note:** Attachments are only shown in Technical mode. File download is not yet implemented.

---

## DOCX Export

The DOCX generator (`DocxGenerator.ts`) exports the following sections:

| Section | Business | Technical | Content |
|---------|:--------:|:---------:|---------|
| Header | Yes | Yes | Name, description |
| Metadata Table | Yes | Yes | Version, owner, status, date |
| Executive Summary | Yes | Yes | Auto-generated narrative |
| Flow Chart | Yes | Yes | Mermaid diagram as PNG |
| Variables & Parameters | Yes | Yes | Step-derived variable table |
| Process Parameters | Yes | Yes | Runtime input parameters from Variables.xml |
| File Locations | No | Yes | File path references from FileLocations.xml |
| Attachments | No | Yes | Embedded files from Attachments.xml |
| Process Details | Yes | Yes | Step-by-step breakdown |
| Step Tables | Partial | Yes | Column mappings, formulas |
| Data Dictionary | Yes | Yes | Output schema tables |
| Logic Tables | Yes | Yes | Flattened IIF rules |
| User Notes | Yes | Yes | Per-step annotations |

---

## Mermaid Diagram Generation

The `MermaidGenerator` creates flowcharts with these characteristics:

**Business Mode:**
- Simplified labels
- Groups/Loops shown as subgraphs
- Color-coded by step type

**Technical Mode:**
- Full labels with step types
- All steps included
- Detailed flow connections

---

## Expression Formatting

The `ExpressionFormatter` provides syntax highlighting:

| Token Type | Color | Example |
|------------|-------|---------|
| Variables | Purple | `@ProcessDate` |
| Tables | Blue | `CustomerMaster` |
| Step Outputs | Green | `OutputTable` |
| Functions | Orange | `IIF()`, `CONCAT()` |
| Strings | Amber | `"literal"` |

---

## Future Enhancements

1. ~~**Display rawVariables** - Show process parameters in a dedicated section~~ **DONE**
2. ~~**Display rawFileLocations** - Show file path references~~ **DONE**
3. ~~**Display rawAttachments** - List embedded files~~ **DONE** (download not yet implemented)
4. **Attachment Download** - Enable downloading embedded files from the Attachments section
5. **Extended Criteria parsing** - Parse nested CriteriaSetItems with AND/OR logic visualization
6. **Step dependency graph** - Visual representation of data flow between steps
7. **File Location Usage** - Show which steps reference each file location
