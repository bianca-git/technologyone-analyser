# ETL Process Data Structure

This document describes all data extracted from TechnologyOne ETL Process files (`.t1etlp`) and which fields are exposed in the generated reports.

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

| Field | Source | Exposed | Notes |
|-------|--------|:-------:|-------|
| `name` | `Process.Name` | Yes | Display title |
| `id` | `Process.ProcessId` | Yes | GUID identifier |
| `version` | `Process.Version` | Yes | Version number |
| `owner` | `Process.Owner` or narration | Yes | Extracted from "Published by X" |
| `description` | `Process.Description` | Yes | User-provided description |
| `status` | `Process.Status` | Yes | P=Published, D=Draft |
| `narration` | `Process.VersionNarration` | Yes | Full version notes |
| `dateModified` | `Process.DateSaved` | Yes | Publication timestamp |

---

## Execution Flow Structure

The parser builds a hierarchical execution tree from `Steps.xml`. Each step is transformed into an `ExecutionStep` object:

### ExecutionStep Fields

| Field | Type | Exposed | Description |
|-------|------|:-------:|-------------|
| `id` | string | Yes | Unique identifier (e.g., `RunDirectQuery_GetData`) |
| `Step` | string | Yes | Step name |
| `RawType` | string | Yes | Original step type (e.g., `RunDirectQuery`) |
| `Phase` | string | Yes | Formatted step type (may include `[DISABLED]`) |
| `Context` | string | Yes | Human-readable purpose description |
| `SmartDesc` | string | Yes | AI-inferred business context |
| `FlowLabel` | string | Yes | Label used in Mermaid diagrams |
| `Description` | string | Yes | User-provided step description/narration |
| `IsActive` | boolean | Yes | Whether step is enabled |
| `Depth` | number | Yes | Nesting level in hierarchy |
| `Inputs` | string[] | Yes | Input table/variable names |
| `Outputs` | string[] | Yes | Output table/variable names |
| `Output` | object | Yes | Explicit output `{type, name}` |
| `Details` | string[] | Yes | Additional context (filters, params) |
| `TableData` | array | Yes | Column/mapping data tables |
| `Headers` | string[] | Yes | Table column headers |
| `LogicRules` | array | Yes | Flattened IIF logic chains |
| `DataDictionary` | array | Yes | Output column schema |
| `ExistsLogic` | string[] | Yes | EXISTS filter conditions |
| `children` | array | Yes | Nested child steps |

---

## Step Types

### Data Extraction Steps

| Step Type | Context | TableData |
|-----------|---------|-----------|
| `RunDirectQuery` | "Connects to source to pull {table}" | Columns: Name, Source, Type, Action |
| `RunTableQuery` | "Reads internal {table}" | Columns: Name, Source, Type, Action |
| `RunDatasourceQuery` | "{datasource} -> {target}" | Columns (if RunSimpleQuery) |
| `RunSimpleQuery` | "{datasource} -> {target}" | Columns: Name, Source, Type, Action |
| `LoadTextFile` | "Load Text File into {table}" | None |

### Transformation Steps

| Step Type | Context | TableData |
|-----------|---------|-----------|
| `AddColumn` | "Calculates fields in {table}" | Columns: Field, Formula, Type + LogicRules |
| `UpdateColumn` | "Updates values in {table}" | Columns: Field, Formula, Type + LogicRules |
| `JoinTable` | "{step type}" | Joins: Left, Condition |
| `CreateTable` | "Create Table: {name}" | Columns: Name, Type |
| `AppendTable` | "Append to: {table}" | None |

### Variable Steps

| Step Type | Context | TableData |
|-----------|---------|-----------|
| `SetVariable` | "{var} = <code>{value}</code>" | Variable, Expression, Type + LogicRules |
| `CalculateVariable` | "{var} = <code>{expr}</code>" | Variable, Expression, Type + LogicRules |

### Output Steps

| Step Type | Context | TableData |
|-----------|---------|-----------|
| `ImportWarehouseData` | "Save to Warehouse: {target}" | Mappings: Target, Source, Type, Origin |
| `DeleteWarehouseData` | "Delete Warehouse Data: {target}" | None |
| `ExportToExcel` | "Export to Excel: {file}" | None |
| `SendEmail` | "Email: \"{subject}\"" | None |
| `SaveText` / `SaveTextfile` | "Save Text: {file}" | None |

### Control Flow Steps

| Step Type | Context | TableData |
|-----------|---------|-----------|
| `Group` | Container | Children rendered inside |
| `Loop` | "Repeat for {iterator}" | Children rendered inside |
| `Decision` | "Decision on {table}" | Children rendered inside |
| `Branch` | "If {expression}" | Children rendered inside |

---

## Variables Collection

Variables are collected from two sources:
1. **Step-defined variables**: From `SetVariable` and `CalculateVariable` steps
2. **Loop iterators**: From `Loop` steps with `InputVariable`

| Field | Label | Description |
|-------|-------|-------------|
| `Name` | "Variable Name" | Variable identifier |
| `Value` | "Value / Expression" | Default value or expression |
| `Type` | "Type" | `Var` or `Iterator` |

---

## Additional Extracted Data

### DataDictionary (Output Schema)

Extracted from `DynamicFields.Field` or `OutputTableDefinition.Columns`:

| Field | Exposed | Description |
|-------|:-------:|-------------|
| `Name` | Yes | Output column name |
| `Type` | Yes | Data type |
| `Length` | Yes | Max length (if defined) |
| `Description` | Yes | Column description |

### ExistsLogic (Filters)

Extracted from `ExistsFilters.ExistsFilterItem`:

| Field | Exposed | Description |
|-------|:-------:|-------------|
| Full expression | Yes | e.g., "NOT EXISTS IN TableX WHERE Field1 = Column1" |

### Import Options

| Option Code | Meaning | Exposed |
|-------------|---------|:-------:|
| `IU` | Insert or Update | Yes |
| `I` | Insert Only | Yes |
| `U` | Update Only | Yes |
| `D` | Delete | Yes |
| `R` | Replace | Yes |

### Criteria/Filters

Extracted from `Criteria`, `WarehouseCriteria`, `SourceCriteria`:

| Field | Exposed | Description |
|-------|:-------:|-------------|
| Full filter string | Yes | e.g., "ColumnId = Value1" |

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

| Field | Exposed | Description |
|-------|:-------:|-------------|
| `Name` | Yes | Parameter identifier |
| `VariableType` | Yes | Resolved type (String, Numeric, Date, List) |
| `DefaultValue` | Yes | Default value if not provided |
| `Description` | Yes | User-provided description |
| `IsMandatory` | Yes | Required/Optional badge |

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

| Field | Exposed | Description |
|-------|:-------:|-------------|
| `Name` | Yes | Location alias |
| `LocationType` | Yes | ServerFolder, FTP, etc. |
| `Path` | Yes | Combined ServerFolder + SubPath |
| `Description` | Yes | User description |

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

| Field | Exposed | Description |
|-------|:-------:|-------------|
| `FileName` | Yes | Original filename |
| `Description` | Yes | User description |
| `Size` | Yes | Calculated from Base64 length |

**Note:** File download is not yet implemented.

---

## DOCX Export

The DOCX generator (`DocxGenerator.ts`) exports the following sections:

| Section | Exposed | Content |
|---------|:-------:|---------|
| Header | Yes | Name, description |
| Metadata Table | Yes | Version, owner, status, date |
| Executive Summary | Yes | Auto-generated narrative |
| Flow Chart | Yes | Mermaid diagram as PNG |
| Variables & Parameters | Yes | Step-derived variable table |
| Process Parameters | Yes | Runtime input parameters from Variables.xml |
| File Locations | Yes | File path references from FileLocations.xml |
| Attachments | Yes | Embedded files from Attachments.xml |
| Process Details | Yes | Step-by-step breakdown |
| Step Tables | Yes | Column mappings, formulas |
| Data Dictionary | Yes | Output schema tables |
| Logic Tables | Yes | Flattened IIF rules |
| User Notes | Yes | Per-step annotations |

---

## Mermaid Diagram Generation

The `MermaidGenerator` creates flowcharts with these characteristics:

Diagrams use full labels with step types, all steps included (including disabled), color-coded by step type, with Groups/Loops rendered as subgraphs.

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
