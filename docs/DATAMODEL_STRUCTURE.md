# Data Model Structure

This document describes all data extracted from TechnologyOne Data Model files (`.t1dm`) and which fields are exposed in the generated reports.

## Overview

A Data Model file is a ZIP archive containing multiple XML files that define a data aggregation and transformation model. The parser extracts and recursively parses all nested XML content to produce a fully structured object model.

---

## Source Files

| File | Description | Fully Parsed |
|------|-------------|--------------|
| `DataModel.xml` | Model metadata, indexes, detail views, and definition | Yes |
| `Queries.xml` | Query definitions with sequence and criteria | Yes |
| `QueryColumns.xml` | Column definitions per query with expressions | Yes |
| `QueryJoins.xml` | Join relationships between datasources | Yes |
| `QueryDatasources.xml` | Data source definitions (tables, warehouses, queries) | Yes |
| `Variables.xml` | Global variables/parameters | Yes |
| `Resources.xml` | Embedded resources (images, etc.) | Yes |

---

## Database Schema

```typescript
interface DataModel {
    id?: number;
    filename: string;
    metadata: {
        name: string;         // Model name
        id?: string;          // DataModelId (GUID)
        description: string;  // Model description
        version?: string;     // Version number
        owner?: string;       // Owner username
        dateModified?: string;// Last modification date
    };
    content: any;            // Parsed JSON of all XMLs
    dateAdded: Date;
    stepNotes?: Record<string, string>; // User-added notes per query
}
```

---

## Metadata Fields

| Field | Source | Exposed | Notes |
|-------|--------|:-------:|-------|
| `name` | `DataModelDef.Description` or filename | Yes | Display title |
| `id` | `DataModelDef.DataModelId` | Yes | GUID identifier |
| `description` | `DataModelDef.Description` | Yes | User-provided description |
| `version` | `DataModelDef.Version` | Yes | Version number |
| `owner` | `DataModelDef.Owner` | Yes | Owner username |
| `processMode` | `Definition.DataModelDefinition.ProcessMode` | Yes | `Stored` or `Real-Time` |
| `dateModified` | Derived | Yes | Modification timestamp |

---

## Content Structure

The `content` field contains parsed data from all XML files:

```typescript
{
    DataModel: {
        DataModelDef: { ... },      // Core metadata
        Definition: {
            DataModelDefinition: {
                ProcessMode: string,
                Indexes: { Index: [...] },
                DetailViews: { View: [...] }
            }
        }
    },
    Queries: {
        ArrayOfQuery: {
            Query: [...]
        }
    },
    QueryColumns: {
        ArrayOfQueryColumn: {
            QueryColumn: [...]
        }
    },
    QueryJoins: {
        ArrayOfQueryJoin: {
            QueryJoin: [...]
        }
    },
    QueryDatasources: {
        ArrayOfQueryDatasource: {
            QueryDatasource: [...]
        }
    },
    Variables: {
        ArrayOfVariableDef: {
            VariableDef: [...]
        }
    },
    Resources: { ... }  // Embedded resources
}
```

---

## Global Variables

Extracted from `Variables.xml`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `Name` | `VariableDef.Name` | Yes | Variable identifier |
| `Value` | `VariableDef.DefaultValue` | Yes | Default value |
| `Type` | `VariableDef.DataType` | Yes | Resolved type name |
| `Source` | `VariableDef.DataSourceName` | Yes | Source if datasource-bound |
| `Description` | `VariableDef.Description` | Yes | Variable description |

### Type Resolution

| Code | Resolved Type |
|------|--------------|
| `A` | String |
| `L` | Boolean |
| `N` | Numeric |
| `D` | Date |
| `I` | Integer |
| `F` | Float |

---

## Indexes

Extracted from `DataModel.Definition.DataModelDefinition.Indexes`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `Name` | `Index.Name` | Yes | Index identifier |
| `Columns` | `Index.Columns.Column[].Name` | Yes | Comma-separated column list |

Indexes are used to identify filter columns in criteria (shown with "Index" badge in UI).

---

## Drilldown Views (Detail Views)

Extracted from `DataModel.Definition.DataModelDefinition.DetailViews`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `Name` | `View.Name` | Yes | View identifier |
| `Columns` | `View.Columns.Column[].Name` | Yes | Comma-separated column list |

---

## Queries

Queries are sorted by `Sequence` number. The last query is treated as the "Final Output".

### Query Fields

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `QueryName` | `Query.QueryName` | Yes | Query identifier |
| `Id` | `Query.Id` | Yes | GUID for notes |
| `Sequence` | `Query.Sequence` | Yes | Execution order |
| `Criteria` | `Query.Criteria.CriteriaSetItem` | Yes | Filter conditions |

### Query Card Display

Each query is rendered as a collapsible card showing:

| Section | Exposed | Content |
|---------|:-------:|---------|
| Header | Yes | Query name + badges (cols, filters, joins) |
| Notes | Yes | User-added annotations |
| Filters | Yes | Criteria conditions |
| Sources | Yes | Datasource list with types |
| Joins | Yes | Join table with type/columns |
| Columns | Yes | Column table with name/type/source |

---

## Query Columns

Extracted from `QueryColumns.xml`, filtered by `QueryName`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `ColumnName` | `QueryColumn.ColumnName` | Yes | Output column name |
| `DataSourceName` | `QueryColumn.DataSourceName` | Yes | Source datasource |
| `FieldId` | `QueryColumn.FieldId` | Yes | Source field name |
| `Expression` | `QueryColumn.Expression` | Yes | Calculated expression |
| `JavaType` | `QueryColumn.JavaType` | Yes | Primary data type |
| `DataType` | `QueryColumn.DataType` | Yes | Fallback data type |
| `Format` | `QueryColumn.Format` | Yes | Display format |
| `Description` | `QueryColumn.Description` | Yes | Column description |

### Column Source Display Logic

```
if (Expression exists):
    source = Expression
else if (DataSourceName AND FieldId):
    source = "{DataSourceName}.{FieldId}"
else:
    source = DataSourceName
```

---

## Query Joins

Extracted from `QueryJoins.xml`, filtered by `QueryName`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `JoinType` | `QueryJoin.JoinType` | Yes | Inner, Left, Right, etc. |
| `DataSource1` | `QueryJoin.DataSource1` | Yes | Left datasource |
| `Field1` | `QueryJoin.Field1` | Yes | Left field |
| `DataSource2` | `QueryJoin.DataSource2` | Yes | Right datasource |
| `Field2` | `QueryJoin.Field2` | Yes | Right field |

---

## Query Datasources

Extracted from `QueryDatasources.xml`, filtered by `QueryName`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `DataSourceName` | `QueryDatasource.DataSourceName` | Yes | Alias/short name |
| `DatasourceId` | `QueryDatasource.DatasourceId` | Yes | Full identifier |
| `DataSourceType` | `QueryDatasource.DataSourceType` | Yes | Type category |
| `ParameterValues` | `QueryDatasource.ParameterValues` | Yes | Source parameters |

### Datasource Types & Styling

| Type | Label | Color | Description |
|------|-------|-------|-------------|
| `DirectTable` | TABLE | Blue | Direct database table |
| `Warehouse` | WAREHOUSE | Cyan | Data warehouse table |
| `Query` | QUERY | Purple | Reference to another query |
| `Analyser` | ANALYSER | Amber | External analyser datasource |
| Other | (Type) | Gray | Default styling |

### Parameter Value Extraction

The actual table/query name is extracted from `ParameterValues.Parameters.ParameterField`:

```typescript
const fields = ParameterValues.Parameters.ParameterField[];
const tableName = fields.find(f => f.FieldName === 'TableName')?.Value;
const queryName = fields.find(f => f.FieldName === 'QueryName')?.Value;
const warehouseName = fields.find(f => f.FieldName === 'WarehouseName')?.Value;
```

This is displayed alongside the alias: `Alias (RealName)`

---

## Criteria (Filters)

Criteria are recursively extracted from `Query.Criteria.CriteriaSetItem`:

| Field | Source | Exposed | Description |
|-------|--------|:-------:|-------------|
| `ColumnId` | `CriteriaValue.ColumnId` | Yes | Filtered column |
| `Operator` | `CriteriaValue.Operator.Value` | Yes | Comparison operator |
| `Value1` | `CriteriaValue.Value1` | Yes | Primary value |
| `Value2` | `CriteriaValue.Value2` | Yes | Secondary value (Between) |

### Operator Normalization

Raw operators are normalized for display:

| Raw | Display | Notes |
|-----|---------|-------|
| `Equals` | equals | |
| `NotEquals` | not equals | |
| `GreaterThan` | greater than | |
| `LessThan` | less than | |
| `Between` | between | Shows "Value1 and Value2" |
| `IsNull` | is null | |
| `IsNotNull` | is not null | |
| `Contains` | contains | |
| `StartsWith` | starts with | |
| `EndsWith` | ends with | |

### Index Detection

If `ColumnId` matches an Index name, the filter is displayed with an "Index" badge and shows the indexed columns.

---

## Executive Summary Generation

The summary is auto-generated from the data structure:

```typescript
const summary = `This Data Model generates the "${finalQuery.QueryName}" dataset. 
It aggregates data from ${uniqueSources} external sources 
across ${queryCount} transformation steps 
to produce ${finalCols.length} output columns.`;
```

| Metric | Source | Description |
|--------|--------|-------------|
| Final Query Name | Last query by sequence | Primary output dataset |
| External Sources | Datasources where type != 'Query' | Unique source count |
| Transformation Steps | Total query count | Number of queries |
| Output Columns | Columns for final query | Column count |

---

## UI Layout

### Header Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Title | Yes | `metadata.name` |
| Description | Yes | `metadata.description` |
| Badge | Yes | "DATA MODEL" |
| Meta Grid | Yes | Owner, Version, Process Mode, Date, ID |

### Executive Summary

| Element | Exposed | Content |
|---------|:-------:|---------|
| Summary | Yes | Auto-generated narrative |

### Global Variables Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Table | Yes | Variable Name, Value, Type, Description |

### Indexes Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Table | Yes | Index Name, Columns |

### Drilldown Views Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Table | Yes | View Name, Columns |

### Final Output Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Query Card | Yes | Full query details (expanded by default) |

### Transformation Layers Section

| Element | Exposed | Content |
|---------|:-------:|---------|
| Query Cards | Yes | All queries except final (collapsed by default) |

---

## DOCX Export

The DOCX generator exports the following sections:

| Section | Exposed | Content |
|---------|:-------:|---------|
| Header | Yes | Name as heading |
| Metadata Table | Yes | Description, Version, Process Mode, Date |
| Executive Summary | Yes | Auto-generated narrative |
| Global Variables | Yes | Variable table with Name, Value, Type, Description |
| Indexes | Yes | Index table with Name, Columns |
| Transformation Layers | Yes | Per-query sections |
| Query Filters | Yes | Filter table with Column, Operator, Value |
| Query Columns | Yes | Column table with Name/Desc, Type/Format, Source |
| User Notes | Yes | Per-query annotations |

### DOCX Column Table Format

The column table uses a 3-column merged format:

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Name<br>*Description* | Type<br>*Format* | Source Expression |

---

## Expression Formatting

The `ExpressionFormatter` provides syntax highlighting for:

| Token Type | Color | Example |
|------------|-------|---------|
| Variables | Purple | `@DateFrom` |
| Tables/Datasources | Blue | `CustomerMaster.CustomerCode` |
| Strings | Amber | `"literal value"` |

---

## Raw Data (Not Yet Exposed in Reports)

### Resources.xml

Embedded resources (images, icons, etc.) are parsed but not displayed:

```typescript
{
    Resources: {
        Resource: [{
            ResourceId: string,
            ResourceType: string,
            Data: string  // Base64 encoded
        }]
    }
}
```

**Exposure Status:** Stored in `content.Resources`, not displayed

### Nested Criteria Sets

Complex nested criteria with `NestedSets.CriteriaSetItem` are recursively parsed but the AND/OR logic between sets is not visually represented.

**Exposure Status:** Flattened into single filter list

---

## Future Enhancements

1. **Display Resources** - Show embedded images/icons
2. **Criteria Logic Visualization** - Show AND/OR groupings
3. **Data Lineage Graph** - Visual representation of query dependencies
4. **Column Lineage** - Trace column origins through transformation layers
5. **Process Mode Explanation** - Explain implications of Stored vs Real-Time
6. **Mermaid Diagram** - Add flowchart like ETL reports
