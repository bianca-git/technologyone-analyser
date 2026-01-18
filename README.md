# Documentation - 2026-01-19

This directory contains automatically generated documentation for the TechnologyOne Analyser project.

## Project Overview

**TechnologyOne Analyser** is a web-based utility for analyzing, visualizing, and documenting Technology One (T1) ETL processes and Data Models. It allows users to upload `.t1etlp` (ETL) and `.t1dm` (Data Model) files, which are then parsed, stored locally (using IndexedDB), and presented in both "Business" and "Technical" views.

## Documentation Index

- **[Architecture](./docs/ARCHITECTURE.md)**: High-level overview of the application structure, technology stack, and core data flows.
- **[File Processor](./docs/FILE_PROCESSOR.md)**: Details on the file ingestion pipeline, validation, and storage mechanisms.
- **[Generators](./docs/GENERATORS.md)**: Explanation of the logic used to generate HTML views and downloadable DOCX reports.
- **Parsers (Coming Soon)**: Deep dive into the XML parsing logic for T1 file formats.

## Key Features

1.  **File Ingestion**: Drag-and-drop support for `.t1etlp` and `.t1dm` files via `FileProcessor`.
2.  **Local Storage**: Uses `Dexie.js` to store parsed data in the browser (IndexedDB).
3.  **Visualization**:
    - **Dashboard**: List of uploaded models and reports.
    - **ETL View**: Detailed step-by-step breakdown of ETL processes.
    - **Data Model View**: Visualization of tables, joins, and sources.
4.  **Reporting**: Export documentation to Microsoft Word (`.docx`).
5.  **Views**: Toggle between "Business" (high-level) and "Technical" (detailed) perspectives.

## Roadmap

- [ ] **TODO**: Integrate further reporting metadata styles
- [ ] **TODO**: Enable local install

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
