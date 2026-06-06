import { describe, it, expect } from 'vitest';
import {
    extractSourcesAndTargets,
    buildEtlNarrative,
    plainSummaryFormatter,
} from '../src/lib/generators/EtlSummary';
import type { EtlSummaryFormatter } from '../src/lib/generators/EtlSummary';

// HTML formatter mirrors the one in EtlGenerator (kept local to the test so we
// can assert the two callers extract the SAME source/target set regardless of
// how each one formats the names).
const htmlFormatter: EtlSummaryFormatter = {
    table: (n) => `<table>${n}</table>`,
    file: (n) => `<file>${n}</file>`,
    target: (n) => `<target>the ${n}</target>`,
    analyser: (n) => `<analyser>${n}</analyser>`,
    emailRecipients: () => `<email>recipients</email>`,
};

describe('EtlSummary', () => {
    it('extracts sources and targets from a basic flow', () => {
        const flow = [
            { RawType: 'RunDirectQuery', Details: ['Source Table: SRC'] },
            { RawType: 'ImportWarehouseData', Output: { name: 'DEST' } },
        ];
        const { sources, targets } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        expect(sources).toEqual(['SRC']);
        expect(targets).toEqual(['the DEST']);
    });

    it('includes Analyser sources (the branch the Docx fork used to miss)', () => {
        const flow = [
            { RawType: 'RunAnalyserQuery', Details: ['Analyser: My Analyser'] },
            { SourceType: 'Analyser', Details: ['Source: Meta Analyser'], Step: 'S' },
        ];
        const { sources } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        expect(sources).toContain('MY ANALYSER');
        expect(sources).toContain('META ANALYSER');
    });

    it('extracts the same source/target SET for HTML and plain formatters', () => {
        const flow = [
            { RawType: 'RunDirectQuery', Details: ['Source Table: SRC'] },
            { RawType: 'RunAnalyserQuery', Details: ['Analyser: AN'] },
            { RawType: 'LoadTextFile', Details: ['File: data.csv'] },
            { RawType: 'ImportWarehouseData', Output: { name: 'WH' } },
        ];

        const strip = (s: string) => s.replace(/<[^>]+>/g, '');
        const html = extractSourcesAndTargets(flow, htmlFormatter);
        const plain = extractSourcesAndTargets(flow, plainSummaryFormatter);

        expect(html.sources.map(strip)).toEqual(plain.sources.map(strip));
        expect(html.targets.map(strip)).toEqual(plain.targets.map(strip));
    });

    it('excludes the synthetic DATA output from targets', () => {
        const flow = [{ RawType: 'LoadTextFile', Details: ['File: in.csv'], Outputs: ['DATA', 'REAL_TARGET'] }];
        const { targets } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        expect(targets).not.toContain('DATA');
        expect(targets).toContain('REAL_TARGET');
    });

    it('de-duplicates sources/targets despite surrounding whitespace', () => {
        const flow = [
            { RawType: 'LoadTextFile', Details: ['File:  data.csv '] },
            { RawType: 'LoadTextFile', Details: ['File: data.csv'] },
            { RawType: 'ImportWarehouseData', Output: { name: ' WH ' } },
            { RawType: 'ImportWarehouseData', Output: { name: 'WH' } },
        ];
        const { sources, targets } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        expect(sources).toEqual(['data.csv']);
        expect(targets).toEqual(['the WH']);
    });

    it('de-duplicates Excel and Text file targets despite whitespace', () => {
        const flow = [
            { RawType: 'ExportToExcel', Output: { name: ' report.xlsx ' } },
            { RawType: 'ExportToExcel', Output: { name: 'report.xlsx' } },
            { RawType: 'SaveText', Output: { name: ' out.txt ' } },
            { RawType: 'SaveText', Output: { name: 'out.txt' } },
        ];
        const { targets } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        expect(targets).toEqual(['report.xlsx (Excel)', 'out.txt (Text file)']);
    });

    it('builds a narrative sentence with joins and conditions', () => {
        const flow = [
            { RawType: 'RunDirectQuery', Details: ['Source Table: SRC'] },
            { RawType: 'JoinTable' },
            { RawType: 'Decision' },
            { RawType: 'ImportWarehouseData', Output: { name: 'WH' } },
        ];
        const { sources, targets } = extractSourcesAndTargets(flow, plainSummaryFormatter);
        const narrative = buildEtlNarrative(sources, targets, flow);
        expect(narrative).toContain('extracts data from SRC');
        expect(narrative).toContain('combines multiple datasets');
        expect(narrative).toContain('distributes results to the WH');
        expect(narrative.startsWith('This process')).toBe(true);
    });

    it('falls back to a generic sentence when nothing is extracted', () => {
        expect(buildEtlNarrative([], [], [])).toBe('This process performs a sequence of data operations.');
    });
});
