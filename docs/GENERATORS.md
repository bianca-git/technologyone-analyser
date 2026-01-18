# Generators Documentation

Generators in **TechnologyOne Analyser** are responsible for transforming the internal parsed data structure (as produced by Parsers) into human-readable formats.

## Overview

The application features two primary types of generators for each entity type (ETL and Data Model):

1.  **HTML Generators**: For on-screen rendering within the application.
2.  **Docx Generators**: For exporting documentation to Microsoft Word.

## 1. ETL Generator (`src/lib/generators/EtlGenerator.ts`)

This class renders the detailed step-by-step view of an ETL process.

### Key Logic Flow

1.  **Preparation**:
    - Fetches the report from `IndexedDB`.
    - Calls `EtlParser.parseSteps()` to convert the raw XML tree into a flat or nested execution tree.
    - Extracts metadata (Status, Owner, Dates).

2.  **Header Generation**:
    - Renders title, description, and a metadata grid.
    - Color-coded "Business View" or "Technical View" badge.

3.  **Automatic Summarization**:
    - Scans the execution tree for key actions (Source extraction, Calculations, Exports).
    - Generates a natural language narrative (e.g., _"This process extracts data from 'GeneralLedger', performs business calculations, and publishes results to the 'Warehouse'."_).

4.  **Wait for User Interaction (Variables)**:
    - Renders a `<details>` block listing global variables and parameters.

5.  **Recursive Step Rendering**:
    - Iterates through the execution tree.
    - **Grouping**: Handles nested structures like `loops`, `groups`, and `decisions` by rendering distinct visual containers with icons (e.g., ↻ for loops, ❓ for decisions).
    - **Contextualization**: Uses logic to determine if a step is "Technical" or "Business" relevant.
    - **Formatting**: Applies `ExpressionFormatter` to SQL snippets or code blocks to provide syntax highlighting.
    - **Annotations**: Renders user-added "Step Notes" (persisted in DB).

## 2. Docx Generator (`src/lib/generators/DocxGenerator.ts`)

This class mirrors the logic of the HTML generators but outputs a `.docx` file using the `docx` library.

### Strategy

- **Paragraph construction**: Instead of HTML strings, it builds `new Paragraph()`, `new Table()`, and `new TextRun()` objects.
- **Styling**: Maps the CSS styles (e.g., bold, colors) to Word styles.
- **Structure**:
  1.  **Title Page**: Large bold title, generated date.
  2.  **Metadata Table**: Owner, Version, Process ID.
  3.  **Executive Summary**: Same text generation logic as HTML.
  4.  **Variables Table**: Full list of parameters.
  5.  **Step-by-Step Guide**: Iterates through steps, creating headings and tables for data dictionaries.

## 3. Data Model Generator (`src/lib/generators/DataModelGenerator.ts`)

Renders the visual representation of a `.t1dm` file.

### features

- **Metadata**: Shows Process Mode (Stored vs Live).
- **Source Analysis**: Lists all SQL sources or tables feeding the model.
- **Variable List**: Global variables used in the model.
- **Table Relations**: (Planned) Visualizing joins between tables.

## Shared Utilities

### `ExpressionFormatter`

Used by all generators to:

- Colorize table names (e.g., wrapper in a badge).
- Highlight SQL keywords.
- Format logic tables into readable HTML/Word tables.
