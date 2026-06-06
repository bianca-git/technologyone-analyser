/**
 * Shared executive-summary logic for ETL flows.
 *
 * Both the HTML view (EtlGenerator) and the Word export (DocxGenerator) need
 * to derive the same set of sources/targets and the same narrative sentence
 * from a parsed flow. They used to carry forked copies of this logic, and the
 * copies had already drifted — the Docx fork was missing the Analyser source
 * branches, so Word exports listed fewer sources than the HTML view.
 *
 * This module is the single source of truth. Extraction is identical for both
 * callers; only the per-item *formatting* differs, supplied via SummaryFormatter.
 */

import type { EtlStep } from '../parsers/types';

export interface EtlSummaryFormatter {
    /** A table / warehouse / variable source name. */
    table: (name: string) => string;
    /** A file source/target name. */
    file: (name: string) => string;
    /** A target (e.g. warehouse). */
    target: (name: string) => string;
    /** An Analyser datasource name. */
    analyser: (name: string) => string;
    /** The "Email recipients" target phrase. */
    emailRecipients: () => string;
}

/** Plain-text formatter (Word export): mirrors the old DocxGenerator output. */
export const plainSummaryFormatter: EtlSummaryFormatter = {
    table: (name) => name,
    file: (name) => name,
    target: (name) => `the ${name}`,
    analyser: (name) => name,
    emailRecipients: () => 'Email recipients',
};

function normalizeTableName(name: string): string {
    return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Extract the unique source and target lists from a parsed ETL flow.
 * The returned strings are already formatted via `fmt`.
 */
export function extractSourcesAndTargets(
    flow: EtlStep[],
    fmt: EtlSummaryFormatter
): { sources: string[]; targets: string[] } {
    const sources: string[] = [];
    const targets: string[] = [];
    const sourceNames = new Set<string>();
    const targetNames = new Set<string>();

    flow.forEach((s: EtlStep) => {
        // Sources from step Inputs (tables, warehouse, variables, etc.)
        if (s.Inputs && Array.isArray(s.Inputs)) {
            s.Inputs.forEach((input: string) => {
                if (input && input !== 'dataset' && input !== 'target' && input !== 'DATA') {
                    const sourceKey = normalizeTableName(input);
                    if (sourceKey && !sourceNames.has(sourceKey)) {
                        sourceNames.add(sourceKey);
                        sources.push(fmt.table(sourceKey));
                    }
                }
            });
        }

        // Query-specific sources (more detailed context)
        if (s.RawType === 'RunDirectQuery' || s.RawType === 'RunTableQuery') {
            const tableName = s.Details.find((d: string) => d.startsWith('Source Table:'))?.split(': ')[1];
            if (tableName) {
                const sourceKey = normalizeTableName(tableName);
                if (!sourceNames.has(sourceKey)) {
                    sourceNames.add(sourceKey);
                    sources.push(fmt.table(sourceKey));
                }
            }
        } else if (s.RawType === 'RunDatasourceQuery' || s.RawType === 'RunSimpleQuery') {
            const source = s.Details.find((d: string) => d.startsWith('Source:'))?.split(': ')[1];
            if (source) {
                const sourceKey = normalizeTableName(source);
                if (!sourceNames.has(sourceKey)) {
                    sourceNames.add(sourceKey);
                    sources.push(fmt.table(sourceKey));
                }
            }
        } else if (s.RawType === 'RunAnalyserQuery' || s.RawType === 'LoadAnalyserData') {
            const analyserName = s.Details.find(
                (d: string) => d.startsWith('Analyser:') || d.startsWith('Source:')
            )?.split(': ')[1];
            if (analyserName) {
                const sourceKey = normalizeTableName(analyserName);
                if (!sourceNames.has(sourceKey)) {
                    sourceNames.add(sourceKey);
                    sources.push(fmt.analyser(sourceKey));
                }
            }
        } else if (s.RawType === 'LoadTextFile') {
            const file = s.Details.find((d: string) => d.startsWith('File:'))?.split(': ')[1];
            if (file && !sourceNames.has(file)) {
                sourceNames.add(file);
                sources.push(fmt.file(file.trim()));
            }
        }

        // Analyser type in source metadata
        if (s.SourceType === 'Analyser') {
            const analyserName = s.Details.find((d: string) => d.startsWith('Source:'))?.split(': ')[1] || s.Step;
            if (analyserName) {
                const sourceKey = normalizeTableName(analyserName);
                if (!sourceNames.has(sourceKey)) {
                    sourceNames.add(sourceKey);
                    sources.push(fmt.analyser(sourceKey));
                }
            }
        }

        // Targets
        if (s.RawType === 'ImportWarehouseData') {
            const warehouse = s.Output?.name || 'Warehouse';
            const targetKey = `WAREHOUSE_${warehouse}`;
            if (!targetNames.has(targetKey)) {
                targetNames.add(targetKey);
                targets.push(fmt.target(warehouse.trim()));
            }
        } else if (s.RawType === 'ExportToExcel') {
            const filename = s.Output?.name || s.Details.find((d: string) => d.startsWith('File:'))?.split(': ')[1];
            const targetName = filename ? `${fmt.file(filename.trim())} (Excel)` : `an Excel file`;
            const targetKey = `EXCEL_${filename}`;
            if (!targetNames.has(targetKey)) {
                targetNames.add(targetKey);
                targets.push(targetName);
            }
        } else if (s.RawType === 'SendEmail') {
            const targetKey = 'EMAIL';
            if (!targetNames.has(targetKey)) {
                targetNames.add(targetKey);
                targets.push(fmt.emailRecipients());
            }
        } else if (s.RawType === 'SaveText' || s.RawType === 'SaveTextfile') {
            const filename = s.Output?.name || s.Details.find((d: string) => d.startsWith('File:'))?.split(': ')[1];
            const targetName = filename ? `${fmt.file(filename.trim())} (Text file)` : `a Text file`;
            const targetKey = `TEXT_${filename}`;
            if (!targetNames.has(targetKey)) {
                targetNames.add(targetKey);
                targets.push(targetName);
            }
        } else if (s.Outputs && Array.isArray(s.Outputs)) {
            s.Outputs.forEach((output: string) => {
                if (output && output !== 'dataset' && output !== 'target') {
                    const targetKey = normalizeTableName(output);
                    if (targetKey && !targetNames.has(targetKey)) {
                        targetNames.add(targetKey);
                        targets.push(fmt.table(targetKey));
                    }
                }
            });
        }
    });

    return { sources, targets };
}

/**
 * Build the one-sentence executive narrative from already-formatted
 * source/target lists plus the raw flow (used to detect joins/calcs/branches).
 */
export function buildEtlNarrative(sources: string[], targets: string[], flow: EtlStep[]): string {
    const hasCalcs = flow.some(
        (s: EtlStep) => s.RawType === 'AddColumn' || s.RawType === 'UpdateColumn' || s.RawType === 'CalculateVariable'
    );
    const hasJoins = flow.some((s: EtlStep) => s.RawType === 'JoinTable');
    const hasConditions = flow.some((s: EtlStep) => s.RawType === 'Decision' || s.RawType === 'Branch');

    const parts: string[] = [];
    if (sources.length > 0) parts.push(`extracts data from ${sources.join(', ')}`);
    if (hasJoins) parts.push(`combines multiple datasets`);
    if (hasCalcs) parts.push(`performs business calculations`);

    if (targets.length > 0) {
        if (hasConditions) {
            parts.push(`based on certain conditions, distributes results to ${targets.join(', ')}`);
        } else {
            parts.push(`publishes results to ${targets.join(', ')}`);
        }
    }

    if (parts.length === 0) return 'This process performs a sequence of data operations.';

    let narrative = parts.join(', ');
    const lastComma = narrative.lastIndexOf(', ');
    if (lastComma !== -1) {
        narrative = narrative.substring(0, lastComma) + ' and ' + narrative.substring(lastComma + 2);
    }
    return `This process ${narrative}.`;
}
