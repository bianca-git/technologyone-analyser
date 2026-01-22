# TechnologyOne File Formats

This document describes the proprietary file formats used by TechnologyOne (T1) that this application can parse and visualise. Understanding these formats is essential for contributors working on parsers or debugging parsing issues.

## Overview

TechnologyOne exports its configurations as **ZIP archives** with custom extensions. Despite the custom extensions, they can be opened with any standard ZIP utility.

| Extension | Type | Contents |
|-----------|------|----------|
| `.t1etlp` | ETL Process Package | Process metadata, step definitions, variables |
| `.t1dm` | Data Model Package | Query definitions, columns, joins, datasources |
| `.t1db` | Dashboard Package | *(Planned)* Widget layouts, visualisation configs |
| `.t1xl` | XlOne Report | *(Planned)* Excel-based report definitions |
| `.t1pl` | Playlist | *(Planned)* Report distribution configurations |

---

## ETL Process Package (`.t1etlp`)

ETL (Extract, Transform, Load) packages define data processing workflows. They are the core automation mechanism in T1 for moving and transforming data between systems.

### Archive Structure

```
myprocess.t1etlp (ZIP)
├── Processes.xml        # Process metadata (name, owner, version)
├── Steps.xml            # Step definitions (the actual workflow)
├── Variables.xml        # Variable/parameter definitions
├── FileLocations.xml    # File path references
├── Attachments.xml      # Embedded file attachments
└── [Content_Types].xml  # MIME type declarations (standard OPC)
```

### File Descriptions

#### `Processes.xml`

Contains process-level metadata. A package typically contains one process, but the schema supports arrays.

```xml
<?xml version="1.0" encoding="utf-8"?>
<ArrayOfProcess>
  <Process>
    <ProcessId>7bb05bc3-3868-4eab-82e1-9287e8560f6e</ProcessId>
    <Version>1</Version>
    <Status>D</Status>                    <!-- D=Draft, P=Published -->
    <ProcessType>$ETL</ProcessType>
    <Name>COMMENTS</Name>
    <Description>Incoming Period Variance Comments</Description>
    <Owner>BWILKINS</Owner>
    <VersionNarration>Published by USER on 28-Nov-2025</VersionNarration>
    <ParentFileItemPath>/Data/AFRG/ETLs</ParentFileItemPath>
  </Process>
</ArrayOfProcess>
```

**Key Fields:**
| Field | Description |
|-------|-------------|
| `ProcessId` | GUID uniquely identifying this process |
| `Status` | `D` (Draft) or `P` (Published) |
| `Owner` | Username who owns/created the process |
| `VersionNarration` | Free-text field often containing publish info |
| `ParentFileItemPath` | Location in T1's file system hierarchy |

#### `Steps.xml`

The heart of the ETL - defines the execution workflow as a hierarchical tree of steps.

```xml
<?xml version="1.0" encoding="utf-8"?>
<ArrayOfStep>
  <Step>
    <ProcessId>7bb05bc3-...</ProcessId>
    <StepId>2</StepId>
    <StepType>CreateTable</StepType>
    <ParentStepId>0</ParentStepId>       <!-- 0 = root level -->
    <Sequence>1</Sequence>                <!-- Execution order -->
    <Definition><!-- XML-encoded StorageObject --></Definition>
    <OutputTableName>TMP_COMMENTS</OutputTableName>
    <OutputTableDefinition><!-- XML-encoded TableDefinition --></OutputTableDefinition>
    <Name>Create Table</Name>
    <Description>User-provided description</Description>
    <IsActive>true</IsActive>
  </Step>
</ArrayOfStep>
```

**Step Hierarchy:**
Steps form a tree structure via `ParentStepId`:
- `ParentStepId = 0` means root-level step
- Child steps (e.g., inside a Loop or Decision) reference their parent's `StepId`
- `Sequence` determines execution order among siblings

**Common Step Types:**

| StepType | Purpose | Key Storage Fields |
|----------|---------|-------------------|
| `CreateTable` | Create in-memory table | `OutputTableData`, `OutputTableDefinition` |
| `RunDirectQuery` | Query external datasource | `TableName`, `Columns`, `Criteria` |
| `RunTableQuery` | Query internal memory table | `TableName`, `Columns` |
| `AddColumn` | Add calculated column | `InputTableName`, `Columns[].Expression` |
| `UpdateColumn` | Modify existing column | `InputTableName`, `Columns[].Expression` |
| `ImportWarehouseData` | Write to T1 warehouse | `TableName`, `ImportOption`, `ColumnMapping` |
| `DeleteWarehouseData` | Remove warehouse data | `TableName`, `Criteria` |
| `JoinTable` | Combine two tables | `JoinTable1`, `JoinTable2`, `Joins` |
| `AppendTable` | Append rows to table | `InputTableName`, `AppendToTableName` |
| `Loop` | Iterate over items | `InputVariable`, child steps |
| `Decision` | Conditional branching | `InputTableName`, child `Branch` steps |
| `Branch` | Condition within Decision | `Expression` |
| `Group` | Logical grouping | Child steps only |
| `SetVariable` | Set variable value | `VariableName`, `VariableValue` |
| `CalculateVariable` | Compute variable | `VariableName`, `Expression` |
| `ExportToExcel` | Export to Excel file | `FileName`, `SheetName` |
| `SendEmail` | Send email | `SendTo`, `SubjectLine`, `Attachments` |
| `LoadTextFile` | Load text/CSV file | `FileName`, `MemoryTableName` |
| `SaveText` | Write text file | `FileName`, content |
| `PurgeTable` | Clear memory table | `TableToPurge` |

#### Nested XML in `Definition`

**Critical Implementation Detail:** The `Definition` field contains XML that is *itself XML-encoded* (escaped). This means `<` becomes `&lt;`, etc.

```xml
<Definition>&lt;?xml version="1.0"?&gt;
&lt;StorageObject&gt;
  &lt;InputTableName&gt;TMP_DATA&lt;/InputTableName&gt;
  &lt;Columns&gt;
    &lt;ColumnItemDef&gt;
      &lt;ColumnName&gt;Total&lt;/ColumnName&gt;
      &lt;Expression&gt;[Amount] * [Quantity]&lt;/Expression&gt;
    &lt;/ColumnItemDef&gt;
  &lt;/Columns&gt;
&lt;/StorageObject&gt;</Definition>
```

The parser must:
1. Parse the outer XML
2. Detect string fields containing XML (e.g., `Definition`, `OutputTableDefinition`)
3. Parse those strings as XML recursively

#### `Variables.xml`

Defines process parameters that can be set at runtime.

```xml
<ArrayOfC2GenericVariable>
  <C2GenericVariable>
    <VariableId>b56843ef-...</VariableId>
    <OwnerId>7bb05bc3-...</OwnerId>      <!-- Links to ProcessId -->
    <Name>VAR_JSON</Name>
    <Description>Json</Description>
    <VariableType>A</VariableType>        <!-- A=Alphanumeric, N=Numeric, D=Date -->
    <DefaultValue>...</DefaultValue>
    <IsDisplayable>true</IsDisplayable>
    <IsEditable>true</IsEditable>
    <IsMandatory>true</IsMandatory>
    <Sequence>1</Sequence>
    <!-- QueryListCriteria, Definition may contain nested XML -->
  </C2GenericVariable>
</ArrayOfC2GenericVariable>
```

**Variable Types:**
| Code | Type |
|------|------|
| `A` | Alphanumeric (String) |
| `N` | Numeric |
| `D` | Date |
| `L` | List/Picklist |

---

## Data Model Package (`.t1dm`)

Data Models define the schema and queries for T1's reporting and BI tools. They describe what data to fetch, how to join it, and what columns to expose.

### Archive Structure

```
mymodel.t1dm (ZIP)
├── DataModel.xml        # Model metadata (name, owner, mode)
├── Queries.xml          # Query definitions
├── QueryColumns.xml     # Column definitions per query
├── QueryJoins.xml       # Join relationships
├── QueryDatasources.xml # Data source references
├── Variables.xml        # Model parameters
└── Resources.xml        # Embedded resources
```

### File Descriptions

#### `DataModel.xml`

Root metadata for the data model. Contains nested `Definition` with DetailViews and Indexes.

```xml
<?xml version="1.0" encoding="utf-8"?>
<DataModelDef>
  <DataModelId>5f81cae8-4dec-4924-ba3f-1574fc74ff1d</DataModelId>
  <Description>AFRG_B_DM</Description>
  <Notes />
  <ProcessMode>Stored</ProcessMode>       <!-- Stored or RealTime -->
  <Owner>BWILKINS</Owner>
  <ReportingSystem>$DEFAULT</ReportingSystem>
  <DataSourceStatus>Pending</DataSourceStatus>
  <ParentFileItemPath>/Home/BWILKINS</ParentFileItemPath>
  <Definition><!-- XML-encoded DataModelDefinition --></Definition>
</DataModelDef>
```

**Key Fields:**
| Field | Description |
|-------|-------------|
| `DataModelId` | GUID uniquely identifying this model |
| `ProcessMode` | `Stored` (cached/pre-processed) or `RealTime` (live query) |
| `Owner` | Creator username |
| `DataSourceStatus` | `Pending`, `Ready`, `Available`, `Error` |
| `Definition` | Nested XML containing DetailViews and Indexes |

**Nested Definition Structure:**

The `Definition` field contains XML-encoded `DataModelDefinition`:

```xml
<DataModelDefinition>
  <DefKey>01746227-dc93-41cf-b181-8d5cef68f666</DefKey>
  
  <!-- Detail Views: Pre-configured column layouts for drilldown -->
  <DetailViews>
    <DetailView>
      <DetailViewName>VIEW1</DetailViewName>
      <Description>Drilldown</Description>
      <IsDefault>false</IsDefault>
      <Columns>
        <DetailViewColumnItem>
          <ColumnName>LDG_NAME</ColumnName>
          <Sequence>0</Sequence>
          <Description>Ledger Name</Description>
          <Width>200</Width>
          <Format></Format>
        </DetailViewColumnItem>
        <!-- More columns... -->
      </Columns>
    </DetailView>
  </DetailViews>
  
  <!-- Indexes: Performance optimization for stored models -->
  <Indexes>
    <Index>
      <IndexName>IDX1</IndexName>
      <Description>Index 1</Description>
      <Columns>
        <IndexColumnItem>
          <ColumnName Description="Ledger Name">LDG_NAME</ColumnName>
        </IndexColumnItem>
      </Columns>
    </Index>
  </Indexes>
  
  <!-- Processing Preferences -->
  <ProcessingPreferences>
    <DeleteStorageMethod>Auto</DeleteStorageMethod>  <!-- Auto, Manual, Never -->
  </ProcessingPreferences>
</DataModelDefinition>
```

#### `Queries.xml`

Defines the queries that make up the model. Models can have multiple queries that build on each other.

```xml
<ArrayOfQuery>
  <Query>
    <DataModelId>76583817-...</DataModelId>
    <QueryName>QRY_COREFIN</QueryName>
    <QueryType>Run</QueryType>            <!-- Run, Append, Union -->
    <Sequence>2</Sequence>
    <Description>Core Financial Data</Description>
    <Criteria><!-- XML-encoded CriteriaSetItem --></Criteria>
    <Definition><!-- XML-encoded QueryDefinition --></Definition>
    <Suite>CES</Suite>                    <!-- T1 Suite (CES=Core Enterprise) -->
    <IsActive>true</IsActive>
    <OutputLimit>10000000</OutputLimit>
    <ApplyDistinct>false</ApplyDistinct>
  </Query>
</ArrayOfQuery>
```

**Query Types:**
| Type | Purpose |
|------|---------|
| `Run` | Standard query execution |
| `Append` | Append results to existing dataset |
| `Union` | Union with previous query results |

**Nested Criteria Example:**
```xml
<Criteria>
  <CriteriaSetItem>
    <CriteriaValues>
      <CriteriaValue>
        <ColumnId>CFD_BAL_AMT1</ColumnId>
        <Operator><Value>NotEquals</Value></Operator>
        <Value1>0.00</Value1>
        <Link>OR</Link>
      </CriteriaValue>
    </CriteriaValues>
    <Link>AND</Link>
  </CriteriaSetItem>
</Criteria>
```

#### `QueryColumns.xml`

Defines the columns selected/calculated in each query.

```xml
<ArrayOfQueryColumn>
  <QueryColumn>
    <DataModelId>76583817-...</DataModelId>
    <QueryName>QRY_COREFIN</QueryName>
    <ColumnName>LDG_NAME</ColumnName>
    <ColumnType>Display</ColumnType>       <!-- Display, Sum, Count, Avg, etc. -->
    <DataType>String</DataType>            <!-- String, Long, Decimal, Date -->
    <Description>Ledger Name</Description>
    <DataSourceName>CFD</DataSourceName>   <!-- Which datasource this comes from -->
    <FieldId>LDG_NAME</FieldId>            <!-- Source field identifier -->
    <Sequence>1</Sequence>
    <Format>#,##0.00</Format>              <!-- Display format -->
    <MaxLength>80</MaxLength>
    <DecimalPlaces>0</DecimalPlaces>
    <IsVisible>true</IsVisible>
    <IsCalculate>false</IsCalculate>
    <Expression />                          <!-- For calculated columns -->
  </QueryColumn>
</ArrayOfQueryColumn>
```

**Column Types:**
| Type | Description |
|------|-------------|
| `Display` | Simple display column |
| `Sum` | Aggregated sum |
| `Count` | Row count |
| `Avg` | Average |
| `Min` / `Max` | Minimum/Maximum |
| `Calculate` | Computed expression |

**Data Types:**
| Type | Description |
|------|-------------|
| `String` | Text |
| `Long` | Integer |
| `Decimal` | Floating point |
| `Date` | Date/DateTime |
| `Boolean` | True/False |

#### `QueryJoins.xml`

Defines relationships between datasources within a query.

```xml
<ArrayOfQueryJoin>
  <QueryJoin>
    <DataModelId>76583817-...</DataModelId>
    <QueryName>QRY_COREFIN</QueryName>
    <Sequence>1</Sequence>
    <DataSource1>CFD</DataSource1>         <!-- Left side -->
    <Field1>COSTCEN</Field1>
    <DataSource2>CC</DataSource2>          <!-- Right side -->
    <Field2>COSTCEN</Field2>
    <JoinType>LeftOuterOptional</JoinType>
    <Criteria><!-- XML-encoded join conditions --></Criteria>
  </QueryJoin>
</ArrayOfQueryJoin>
```

**Join Types:**
| Type | SQL Equivalent |
|------|----------------|
| `Inner` | INNER JOIN |
| `LeftOuter` | LEFT OUTER JOIN |
| `LeftOuterOptional` | LEFT OUTER JOIN (optional) |
| `RightOuter` | RIGHT OUTER JOIN |
| `FullOuter` | FULL OUTER JOIN |
| `Cross` | CROSS JOIN |

#### `QueryDatasources.xml`

Lists the data sources referenced by queries. Contains nested `ParameterValues` specifying the actual warehouse/table.

```xml
<ArrayOfQueryDatasource>
  <QueryDatasource>
    <DataModelId>76583817-...</DataModelId>
    <QueryName>QRY_COREFIN</QueryName>
    <DataSourceId>f2d14339-...</DataSourceId>
    <DataSourceName>CFD</DataSourceName>           <!-- Alias used in joins/columns -->
    <DataSourceType>Warehouse</DataSourceType>     <!-- Warehouse, View, Query -->
    <AnalyserItemService>T1.Warehouse.Compatibility.Table.TableDataAnalyserItemService</AnalyserItemService>
    <ParameterValues><!-- XML-encoded Parameters --></ParameterValues>
    <ProductCode>CORE</ProductCode>
    <IncludeFields>false</IncludeFields>
  </QueryDatasource>
</ArrayOfQueryDatasource>
```

**Nested ParameterValues Structure:**

```xml
<Parameters>
  <ParameterField>
    <FieldName>Suite</FieldName>
    <Value>CES</Value>                    <!-- Core Enterprise Suite -->
  </ParameterField>
  <ParameterField>
    <FieldName>WarehouseName</FieldName>
    <Value>AFRG</Value>                   <!-- Warehouse identifier -->
  </ParameterField>
  <ParameterField>
    <FieldName>TableName</FieldName>
    <Value>AFRG_B_BALANCES_RAW</Value>    <!-- Actual table name -->
  </ParameterField>
</Parameters>
```

**DataSource Types:**
| Type | Description |
|------|-------------|
| `Warehouse` | T1 Warehouse table |
| `View` | Database view |
| `Query` | Reference to another query in the model |
| `External` | External data connection |

#### `Variables.xml`

Parameters for the data model (similar structure to ETL variables).

---

## Common Patterns

### Nested/Encoded XML

Both file types extensively use XML-within-XML. Fields that commonly contain nested XML:
- `Definition`
- `OutputTableDefinition`
- `Criteria`
- `QueryListCriteria`
- `ParameterValues`

**Parsing Strategy:**
```typescript
// Pseudo-code for recursive XML parsing
function deepParse(obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string' && looksLikeXml(obj[key])) {
      obj[key] = parseXml(obj[key]);
      deepParse(obj[key]); // Recurse
    } else if (typeof obj[key] === 'object') {
      deepParse(obj[key]);
    }
  }
}
```

### GUID References

All major entities use GUIDs for identification:
- `ProcessId` / `DataModelId` - Root entity identifier
- `StepId` - Step within a process (often numeric, not GUID)
- `VariableId` - Variable identifier
- `DefKey` - Definition key (internal reference)

### Filename Conventions

Exported files often include metadata in the filename:
```
{Name}_{GUID}_{Timestamp}.t1etlp
COMMENTS_7bb05bc3-3868-4eab-82e1-9287e8560f6e_20260116103005590.t1etlp
```

The application strips GUIDs and timestamps when displaying names.

---

## Expression Syntax

T1 uses a custom expression language in calculated columns and variables.

### Variable References
```
[ColumnName]          -- Column reference
{&VariableName}       -- Process variable
{@VariableName}       -- System variable
```

### Common Functions
```
IIF(condition, true_value, false_value)   -- Conditional
CASE WHEN x THEN y ELSE z END             -- Case statement
NewGuid()                                  -- Generate GUID
Format(value, 'pattern')                   -- String formatting
DateAdd('d', 1, [DateCol])                -- Date arithmetic
IsNull([Col], 'default')                  -- Null handling
```

### Operators
```
=, <>, <, >, <=, >=   -- Comparison
AND, OR, NOT          -- Logical
+, -, *, /            -- Arithmetic
&                     -- String concatenation
```

---

## Troubleshooting

### Common Parsing Issues

1. **Empty Results**: Check if `IsActive` is `false` - inactive steps/queries are skipped
2. **Missing Data**: Nested XML wasn't recursively parsed
3. **Malformed Expressions**: T1 allows some invalid XML characters in expressions
4. **Version Differences**: Older T1 versions may have different XML structures

### Debugging Tips

1. **Manual Extraction**: Rename `.t1etlp` to `.zip` and extract
2. **XML Inspection**: Use an XML formatter to inspect `Definition` fields
3. **Decode Escaped XML**: Use an HTML decoder on nested XML strings
4. **Check Sequences**: Steps may be out of order - always sort by `Sequence`

---

## Parser Coverage

This section documents what content is currently parsed vs ignored by the application. Use this as a reference for contributing new parser features.

### ETL Package (`.t1etlp`) - Parser Coverage

#### Files Parsed

| File | Status | Notes |
|------|--------|-------|
| `Processes.xml` | **Parsed** | Full metadata extraction |
| `Steps.xml` | **Parsed** | Full step tree with recursive `Definition` parsing |

#### Files NOT Parsed

| File | Status | Contents | Contribution Opportunity |
|------|--------|----------|-------------------------|
| `Variables.xml` | **NOT PARSED** | Process parameters, default values, picklist definitions | Display variables in ETL view, show parameter dependencies |
| `FileLocations.xml` | **NOT PARSED** | Server folder references, file paths used by steps | Show file I/O dependencies in technical view |
| `Attachments.xml` | **NOT PARSED** | Embedded file attachments (scripts, templates) | Extract and display attached files |
| `[Content_Types].xml` | **Ignored** | Standard OPC MIME declarations | Not needed |

#### `Variables.xml` Structure (Not Parsed)

```xml
<ArrayOfC2GenericVariable>
  <C2GenericVariable>
    <VariableId>b56843ef-2517-4405-b26d-a6868208cbf3</VariableId>
    <OwnerId>7bb05bc3-...</OwnerId>           <!-- Links to ProcessId -->
    <Name>VAR_JSON</Name>
    <Description>Json input data</Description>
    <VariableType>A</VariableType>             <!-- A=String, N=Numeric, D=Date, L=List -->
    <DefaultValue>{"key": "value"}</DefaultValue>
    <IsDisplayable>true</IsDisplayable>        <!-- Show in UI when running -->
    <IsEditable>true</IsEditable>              <!-- User can modify -->
    <IsMandatory>true</IsMandatory>            <!-- Required input -->
    <Sequence>1</Sequence>                     <!-- Display order -->
    <ListType />                               <!-- For picklist variables -->
    <QueryListCriteria><!-- Nested XML --></QueryListCriteria>
    <Definition><!-- Nested XML: custom list items --></Definition>
  </C2GenericVariable>
</ArrayOfC2GenericVariable>
```

**Why it matters:** Variables define the inputs to an ETL process. Without parsing this, the application cannot show:
- What parameters the process accepts
- Default values
- Whether parameters are required
- Picklist/dropdown options

#### `FileLocations.xml` Structure (Not Parsed)

```xml
<ArrayOfFileLocation>
  <FileLocation>
    <ProcessId>a794effe-...</ProcessId>
    <Name>USER AREA</Name>
    <LocationType>ServerFolder</LocationType>   <!-- ServerFolder, FTP, etc. -->
    <Description>User Area</Description>
    <Definition>
      <!-- Contains: -->
      <ServerFolder>$USRAREA</ServerFolder>     <!-- T1 system variable -->
      <SubPath>/exports</SubPath>
      <OverrideSuite>CES</OverrideSuite>
      <AllowUpload>true</AllowUpload>
    </Definition>
  </FileLocation>
</ArrayOfFileLocation>
```

**Why it matters:** File locations define where ETL steps read/write files. Steps like `ExportToExcel`, `LoadTextFile`, `SaveText` reference these locations.

---

### Data Model Package (`.t1dm`) - Parser Coverage

#### Files Parsed

| File | Status | Notes |
|------|--------|-------|
| `DataModel.xml` | **Parsed** | Metadata + nested `Definition` (DetailViews, Indexes) |
| `Queries.xml` | **Parsed** | Query definitions with nested `Criteria` |
| `QueryColumns.xml` | **Parsed** | Column definitions |
| `QueryJoins.xml` | **Parsed** | Join relationships with nested `Criteria` |
| `QueryDatasources.xml` | **Parsed** | Datasource references with nested `ParameterValues` |
| `Variables.xml` | **Parsed** | Model parameters |

#### Files NOT Parsed

| File | Status | Contents | Contribution Opportunity |
|------|--------|----------|-------------------------|
| `Resources.xml` | **NOT PARSED** | Embedded resources (images, templates) | Display resource inventory |

#### `Resources.xml` Structure (Not Parsed)

```xml
<ArrayOfResourceModelCoreDef>
  <!-- Usually empty, but can contain: -->
  <ResourceModelCoreDef>
    <ResourceId>...</ResourceId>
    <ResourceType>Image</ResourceType>
    <ResourceName>logo.png</ResourceName>
    <ResourceData><!-- Base64 encoded --></ResourceData>
  </ResourceModelCoreDef>
</ArrayOfResourceModelCoreDef>
```

**Note:** In practice, most Data Model exports have empty `Resources.xml`. This is low priority.

---

### Nested XML Fields - Deep Parsing Coverage

The parsers recursively parse nested XML in certain fields. Here's the current coverage:

#### ETL Parser (`FileProcessor.ts`)

| Field Pattern | Parsed | Location |
|---------------|--------|----------|
| `*Definition` | **Yes** | Any field containing "Definition" |

**Not recursively parsed:**
- `Attributes` field (contains custom colour settings)
- Fields in `Variables.xml` (file not loaded)

#### Data Model Parser (`DataModelParser.ts`)

| Field Pattern | Parsed |
|---------------|--------|
| `*Definition` | **Yes** |
| `Criteria` | **Yes** |
| `QueryListCriteria` | **Yes** |
| `ParameterValues` | **Yes** |

---

### Step Types - Parsing Coverage

The `EtlParser.ts` handles these step types with specific logic:

#### Fully Supported (Detailed Extraction)

| StepType | Extracts |
|----------|----------|
| `RunDirectQuery` | Table, Columns, Criteria, Data Dictionary |
| `RunTableQuery` | Table, Columns |
| `RunDatasourceQuery` | Datasource, Parameters, Columns, Criteria |
| `RunSimpleQuery` | Datasource, Columns, Criteria |
| `AddColumn` | Column definitions, Expressions, Logic Rules (IIF) |
| `UpdateColumn` | Column definitions, Expressions, Logic Rules |
| `ImportWarehouseData` | Target table, Column mappings, Import mode, Criteria |
| `DeleteWarehouseData` | Target table, Criteria |
| `CreateTable` | Table definition, Columns |
| `JoinTable` | Join definitions (Table1, Table2, Type) |
| `AppendTable` | Source and target tables |
| `SetVariable` | Variable name, value/expression |
| `CalculateVariable` | Variable name, expression, Logic Rules |
| `Loop` | Iterator variable, inferred purpose |
| `Decision` | Input table |
| `Branch` | Condition expression |
| `Group` | Children only (structural) |
| `ExportToExcel` | Filename, Sheet, Location |
| `SendEmail` | Recipients, Subject, Attachments |
| `LoadTextFile` | Filename, Encoding, Start/Stop conditions |
| `SaveText` | Filename |
| `PurgeTable` | Table to purge |

#### Partially Supported (Basic Display Only)

| StepType | Current Support | Missing |
|----------|-----------------|---------|
| `FilterTable` | Name only | Filter criteria extraction |
| `SortTable` | Name only | Sort column details |
| `DeleteColumn` | Name only | Which columns deleted |
| `RenameColumn` | Name only | Old/new column names |

#### Not Supported (Exist in T1, Not in Samples)

These step types exist in TechnologyOne but haven't been observed in sample files:

| StepType | Purpose |
|----------|---------|
| `StartProcess` | Call another ETL process |
| `Script` | Execute custom script (VB/C#) |
| `DTS` | SQL Server DTS package execution |
| `ExecuteSQL` | Raw SQL execution |
| `FTP` | File transfer operations |
| `Zip` / `Unzip` | Archive operations |
| `WaitForFile` | File polling |
| `Notification` | System notifications |

**Contribution Note:** If you have sample files with these step types, please contribute them to help expand parser coverage.

---

## References

- Source: `src/lib/FileProcessor.ts` - Main file ingestion
- Source: `src/lib/parsers/EtlParser.ts` - ETL parsing logic
- Source: `src/lib/parsers/DataModelParser.ts` - Data Model parsing logic
