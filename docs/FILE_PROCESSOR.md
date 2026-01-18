# File Processor Documentation

The `FileProcessor` class (`src/lib/FileProcessor.ts`) is responsible for handling the ingestion of files uploaded by the user. It abstracts the complexity of file reading, decompression, parsing, and storage.

## core Responsibilities

1.  **File Type Detection**: Distinguishes between ETL processes (`.t1etlp`) and Data Models (`.t1dm`).
2.  **Decompression**: Handles `.zip` archives (for ETL files).
3.  **Parsing**: Orchestrates XML parsing using `fast-xml-parser`.
4.  **Metadata Extraction**: Normalises headers (Name, Owner, Date) from different file versions.
5.  **Storage**: Persists the processed data into `IndexedDB`.

## Supported File Types

### 1. ETL Packages (`.t1etlp`)
These are essentially ZIP files containing multiple XML descriptors.

**Processing Flow:**
1.  **Unzip**: Uses `JSZip` to open the archive.
2.  **Extract Components**: Looks for `Processes.xml` and `Steps.xml`.
3.  **Parse XML**: Converts the XML content into a JavaScript Object.
4.  **Deep Parsing**: Iterates through Step Definitions. If a definition contains an embedded XML string (common in T1 exports), it recursively parses that string into an object. This ensures that downstream generators don't have to deal with string-encoded XML.
5.  **Metadata**: Extracts Publisher information from `VersionNarration` using regex matching (e.g., "Published by USER on DATE").

### 2. Data Models (`.t1dm`)
These are typically XML files (or ZIPs masquerading as XMLs in some versions, but treated here via `DataModelParser`).

**Processing Flow:**
1.  **Delegate**: Calls `DataModelParser.parse(file)`.
2.  **Metadata**:
    *   **Name Cleaning**: Implements a strategy to clean up filenames. It strips GUIDs and timestamps from the filename if an internal Description is not available.
    *   **Mode Extraction**: Identifies if the model is `Stored` or `Live` (ProcessMode).

## Usage Example

```typescript
import { FileProcessor } from './lib/FileProcessor';

// Inside a drag-and-drop handler
async function handleDrop(files: File[]) {
    for (const file of files) {
        try {
            const id = await FileProcessor.processAndSave(file);
            console.log(`File processed and saved with ID: ${id}`);
        } catch (error) {
            console.error("Processing failed", error);
        }
    }
}
```

## Dependencies
- `jszip`: For opening ETL packages.
- `fast-xml-parser`: For converting XML to JSON.
- `db`: The local Dexie database instance.
