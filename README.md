# Documentation - 2026-01-19

This directory contains automatically generated documentation for the TechnologyOne Analyser project.

## Project Overview

**TechnologyOne Analyser** is a web-based utility for analyzing, visualizing, and documenting Technology One (T1) ETL processes and Data Models. It allows users to upload `.t1etlp` (ETL) and `.t1dm` (Data Model) files, which are then parsed, stored locally (using IndexedDB), and presented in both "Business" and "Technical" views.

## Documentation Index

- **[Architecture](./docs/ARCHITECTURE.md)**: High-level overview of the application structure, technology stack, and core data flows.
- **[File Processor](./docs/FILE_PROCESSOR.md)**: Details on the file ingestion pipeline, validation, and storage mechanisms.
- **[Generators](./docs/GENERATORS.md)**: Explanation of the logic used to generate HTML views and downloadable DOCX reports.
- **[GitHub Integration](./docs/GITHUB_INTEGRATION.md)**: Guide on setting up feedback mechanisms and handling API security.
- **Parsers (Coming Soon)**: Deep dive into the XML parsing logic for T1 file formats.

## Key Features

1.  **File Ingestion**: Drag-and-drop support for `.t1etlp` and `.t1dm` files via `FileProcessor`.
2.  **Local Storage**: Uses `Dexie.js` to store parsed data in the browser (IndexedDB).
3.  **Visualization**:
    - **Dashboard**: List of uploaded models and reports.
    - **ETL View**: Detailed step-by-step breakdown of ETL processes.
    - **Data Model View**: Visualization of tables, joins, filters, and sources.
4.  **Reporting**: Export documentation to Microsoft Word (`.docx`).
5.  **Views**: Toggle between "Business" (high-level) and "Technical" (detailed) perspectives.
6.  **Offline Security**: Integrated `OfflineVerifier` ensures zero-data exfiltration by enforcing a physical network disconnect before processing sensitive data.

## 📢 Call for Feedback

We are currently acting as a "Beta" for the **ETL** and **Data Model** modules. We specifically seek feedback on:

1.  **ETL Visualization**: Does the "Business View" accurately summarize your complex ETL processes? Are complex loops and branches rendering logically?
2.  **Data Model Accuracy**: Are all Tables, Joins, and Filters displaying correctly for your `.t1dm` files?
3.  **Parsing Edge Cases**: If you have a file that fails to parse or looks "empty", please report it.

*Note: Dashboards and XlOne reports are currently in active development (see Roadmap).*

## Roadmap

### ✅ Core Platform (Completed)
- [x] **Offline Security**: Integrated `OfflineVerifier` for strict air-gapped protection.
- [x] **PWA / Capability**: Full offline installation, caching, and Service Worker support.
- [x] **Export Engine**: Universal `.docx` generator for documentation.

### 🔄 Module: Integration & ETL (Current)
- [x] **ETL Parser (`.t1etlp`)**: Full step-by-step visualization, loop handling, and logic extraction.
- [ ] **Advanced Logic**: Better distinct handling for `StartProcess`, `Script`, and `DTS` tasks.

### 📊 Module: BI & Analytics (Active Development)
- [x] **Data Models (`.t1dm`)**:
    - Visualization of Tables, Joins, and Sources.
    - Deep parsing of "Query" definitions and variable dependencies.
    - Business/Technical view toggles.
- [ ] **Dashboards (`.t1db`)**:
    - Parsing `Dashboard.xml` and `Visualisations.xml` layouts.
    - Visualizing Widget placement and data binding.
    - Extracting Filter dependency chains.
- [ ] **XlOne Reports (`.t1xl`)**:
    - Decoding proprietary Excel-based report definitions.
    - Mapping Data Model dependencies within spreadsheet cells.

### 📑 Module: Reporting & Distribution (Planned)
- [ ] **Playlists (`.t1pl`)**:
    - Mapping Report distribution groups.
    - Visualizing scheduling and Bursting rules.

### 🎨 UX & Reliability
- [ ] **Recursive XML Parsing**: Handle deeply nested encoded XML strings often found in older T1 versions.
- [ ] **Dark Mode**: Native visual theme support.
- [ ] **Mobile Responsiveness**: Better touch optimization for tablet review.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
