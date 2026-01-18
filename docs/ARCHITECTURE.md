# Architecture Overview

## Technology Stack

- **Build System**: Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS (v4)
- **Database**: Dexie.js (IndexedDB wrapper)
- **Document Generation**: `docx` library
- **XML Parsing**: `fast-xml-parser`

## Application Structure

The application follows a **Vanilla SPA (Single Page Application)** architecture without a heavy frontend framework like React or Vue. It relies on direct DOM manipulation and full-page re-rendering for simplicity given the local-tool nature of the project.

### 1. Entry Point (`src/main.ts`)

The `main.ts` file acts as the central controller. It is responsible for:

-   **State Management**: Holds simple state variables (`currentView`, `currentReportId`, `currentMode`).
-   **Routing**: Handles basic view switching between 'dashboard' and 'detail' views.
-   **Rendering**: Contains the main `render()` loop and HTML template functions (`header`, `dashboardLayout`).
-   **Event Handling**: Exposes global functions on the `window` object (e.g., `window.navigateTo`) for HTML event attributes.

### 2. Core Library (`src/lib/`)

The core logic is modularized into the `lib` directory:

#### File Processing Pipeline
`FileProcessor.ts` is the gateway for data ingestion.
1.  **Input**: Accepts `File` objects (from drag-and-drop or input).
2.  **Detection**: Determines file type (ETL vs Data Model) based on extension or content.
3.  **Parsing**: Delegates to specific parsers (`EtlParser`, `DataModelParser`).
4.  **Storage**: Saves the parsed JSON object into IndexedDB via `db.ts`.

#### Data Parsing (`src/lib/parsers/`)
Responsible for converting raw XML/JSON from T1 files into the application's internal data structures.
-   **`EtlParser.ts`**: Parses `.t1etlp` files. Extracts steps, descriptions, and flow logic.
-   **`DataModelParser.ts`**: Parses `.t1dm` files. Extracts tables, joins, variables, and data sources.

#### Generators (`src/lib/generators/`)
Responsible for presentation logic.
-   **HTML Generators** (`EtlGenerator.ts`, `DataModelGenerator.ts`):
    -   Accept an ID.
    -   Fetch data from `db`.
    -   Return an **HTML string** representing the detail view.
    -   Handle "Business" vs "Technical" view logic (hiding/showing specific details).
-   **Docx Generator** (`DocxGenerator.ts`):
    -   Accepts an ID.
    -   Generates a downloadable Microsoft Word document mirroring the detail view.

### 3. Data Storage (`src/lib/db.ts`)

The application is "Local-First". All data is stored in the user's browser using **IndexedDB**.
-   **Dexie.js** is used as an abstraction layer.
-   **Schema**:
    -   `reports`: Stores ETL process definitions.
    -   `dataModels`: Stores Data Model definitions.

## Data Flow

1.  **Security Check**: `OfflineVerifier` interrupts usage until the device is confirmed offline (Air-Gapped state).
2.  **Upload**: User drops a file -> `FileProcessor` reads it -> `Parser` converts it -> `db` stores it.
3.  **Dashboard**: `main.ts` queries `db.reports` and `db.dataModels` -> Renders list.
4.  **Detail View**: User clicks item -> `main.ts` switches view -> Calls `Generator.generateHtmlView(id)` -> Injects HTML into DOM.
5.  **Export**: User clicks Export -> Calls `DocxGenerator` -> Triggers browser download.

### 4. UX / Security Components (`src/lib/ux/`)

-   **`OfflineVerifier.ts`**:
    -   **Purpose**: Enforces a strict "Air-Gapped" environment for data privacy.
    -   **Mechanism**: Monitors `navigator.onLine` and performs active "pings" (HEAD requests to reliable endpoints) to detect true connectivity status (e.g., distinguishing between "LAN connected but no internet" vs "True Offline").
    -   **UI**: Injects a strictly styled overlay that blocks interaction until the user disconnects Wi-Fi/Ethernet.
