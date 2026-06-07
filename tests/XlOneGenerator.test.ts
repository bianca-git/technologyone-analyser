import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../src/lib/db';
import { XlOneGenerator } from '../src/lib/generators/XlOneGenerator';
import type { XlReportParsed } from '../src/lib/parsers/types';

vi.mock('../src/lib/db', () => ({
    db: {
        xlReports: { get: vi.fn() },
        dataModels: { toArray: vi.fn() },
    },
}));

function makeParsed(overrides: Partial<XlReportParsed> = {}): XlReportParsed {
    return {
        header: {
            reportId: 'rid',
            title: 'My Report',
            description: '',
            category: '',
            type: 'B',
            sheetName: 'Definition',
            userId: 'TESTER',
            datasource: 'ds-guid',
            reportingSystem: '$DEFAULT',
            parentPath: '/Home/TESTER',
            storageType: 'A',
        },
        definition: { ReportSuite: 'CES' },
        sheet: { settings: {}, variables: [], columns: [], rowCommands: [] },
        ...overrides,
    };
}

function mockRecord(content: XlReportParsed, metadata: Record<string, unknown>) {
    return { id: 1, filename: 'r.t1xl', metadata, content, dateAdded: new Date() };
}

describe('XlOneGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(db.dataModels.toArray).mockResolvedValue([]);
    });

    it('throws if the report is not found', async () => {
        vi.mocked(db.xlReports.get).mockResolvedValue(undefined);
        await expect(XlOneGenerator.generateHtmlView(999)).rejects.toThrow('XlOne Report not found');
    });

    it('renders the report title and owner', async () => {
        vi.mocked(db.xlReports.get).mockResolvedValue(mockRecord(makeParsed(), { name: 'My Report', owner: 'TESTER' }));
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).toContain('My Report');
        expect(html).toContain('TESTER');
        expect(html).toContain('XlOne Report');
    });

    it('escapes file-derived values to prevent XSS', async () => {
        const content = makeParsed({
            header: { ...makeParsed().header, title: '<script>alert(1)</script>' },
            sheet: {
                settings: { Narration: '<img src=x onerror=alert(2)>' },
                variables: [],
                columns: [],
                rowCommands: [],
            },
        });
        vi.mocked(db.xlReports.get).mockResolvedValue(mockRecord(content, { name: '<script>alert(1)</script>' }));
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).not.toContain('<img src=x onerror=alert(2)>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('renders a column definition with its data source name', async () => {
        const content = makeParsed({
            sheet: {
                settings: {},
                variables: [],
                columns: [
                    {
                        name: 'ColumnDefn1',
                        dataSource: { raw: 'Transactions (Sys) (guid)', name: 'Transactions', system: 'Sys', guid: 'guid' },
                        parameters: {},
                        runtime: {},
                        criteria: [],
                    },
                ],
                rowCommands: [],
            },
        });
        vi.mocked(db.xlReports.get).mockResolvedValue(mockRecord(content, { name: 'r' }));
        const html = await XlOneGenerator.generateHtmlView(1);
        expect(html).toContain('ColumnDefn1');
        expect(html).toContain('Transactions');
    });
});
