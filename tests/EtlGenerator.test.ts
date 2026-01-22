
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EtlGenerator } from '../src/lib/generators/EtlGenerator';
import { db } from '../src/lib/db';
import { EtlParser } from '../src/lib/parsers/EtlParser';

// Mock DB
vi.mock('../src/lib/db', () => ({
    db: {
        reports: {
            get: vi.fn()
        }
    }
}));

vi.mock('../src/lib/parsers/EtlParser', () => ({
    EtlParser: {
        parseSteps: vi.fn()
    }
}));

describe('EtlGenerator', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns error html if report not found', async () => {
        vi.mocked(db.reports.get).mockResolvedValue(undefined);
        const html = await EtlGenerator.generateHtmlView(999, 'technical');
        expect(html).toContain('Report not found');
    });

    it('generates summary correctly', async () => {
        const mockReport = {
            id: 1,
            metadata: { name: "Test", version: "1.0" },
            rawSteps: {},
            dateAdded: new Date()
        };
        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const mockFlow = {
            executionTree: [],
            variables: [],
            variableSet: new Set(),
            tableSet: new Set(),
            executionFlow: [
                { RawType: 'RunDirectQuery', Details: ['Source Table: SRC'] },
                { RawType: 'ImportWarehouseData', Output: { name: 'DEST' } }
            ]
        };
        vi.mocked(EtlParser.parseSteps).mockReturnValue(mockFlow as any);

        const html = await EtlGenerator.generateHtmlView(1, 'technical');

        expect(html).toContain('extracts data from <span class="t1-table-badge" data-type="table">𝄜 SRC</span>');
        expect(html).toContain('publishes results to <strong>the DEST</strong>');
        expect(html).toContain('Executive Summary');
    });

    it('renders recursive groups correctly', async () => {
        const mockReport = {
            id: 1,
            metadata: { name: "Test", version: "1.0" },
            rawSteps: {},
            dateAdded: new Date()
        };
        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const mockFlow = {
            executionTree: [
                {
                    Step: 'My Group',
                    RawType: 'Group',
                    Phase: 'Phase 1',
                    Context: 'Processing',
                    Details: [],
                    children: [
                        { Step: 'Child Step', RawType: 'Action', Phase: 'Phase 1.1', Context: 'Actioning', Details: [] }
                    ]
                }
            ],
            executionFlow: [],
            variables: [],
            variableSet: new Set(),
            tableSet: new Set(),
        };
        vi.mocked(EtlParser.parseSteps).mockReturnValue(mockFlow as any);

        const html = await EtlGenerator.generateHtmlView(1, 'technical');

        expect(html).toContain('My Group');
        expect(html).toContain('Child Step');
        expect(html).toContain('border-slate-300'); // Check for group styling
    });

    it('renders step notes if present', async () => {
        const mockReport = {
            id: 1,
            metadata: { name: "Test", version: "1.0" },
            rawSteps: {},
            dateAdded: new Date(),
            stepNotes: {
                "step-123": "This is a note"
            }
        };
        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const mockFlow = {
            executionTree: [
                { id: "step-123", Step: "Note Step", RawType: "Action", Phase: "", Context: "", Details: [] }
            ],
            executionFlow: [],
            variables: [],
            variableSet: new Set(),
            tableSet: new Set(),
        };
        vi.mocked(EtlParser.parseSteps).mockReturnValue(mockFlow as any);

        const html = await EtlGenerator.generateHtmlView(1, 'technical');
        
        expect(html).toContain('This is a note');
        expect(html).toContain('step-notes-container');
    });

    it('renders variables table', async () => {
        const mockReport = {
            id: 1,
            metadata: { name: "Test", version: "1.0" },
            rawSteps: {},
            dateAdded: new Date()
        };
        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const mockFlow = {
            executionTree: [],
            executionFlow: [],
            variables: [{ Name: 'Var1', Value: '100' }],
            variableSet: new Set(),
            tableSet: new Set(),
        };
        vi.mocked(EtlParser.parseSteps).mockReturnValue(mockFlow as any);

        const html = await EtlGenerator.generateHtmlView(1, 'technical');
        expect(html).toContain('Var1');
        expect(html).toContain('100');
        expect(html).toContain('Variables & Parameters');
    });
});
