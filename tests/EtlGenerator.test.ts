
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EtlGenerator } from '../src/lib/generators/EtlGenerator';
import { db } from '../src/lib/db';

// Mock DB
vi.mock('../src/lib/db', () => ({
    db: {
        reports: {
            get: vi.fn()
        }
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

    it('generates html for a simple report', async () => {
        // Mock Data
        const mockReport = {
            id: 1,
            filename: 'test.t1etlp',
            metadata: {
                name: "Test Process",
                id: "PROC-01",
                version: "1.0",
                owner: "Admin",
                dateModified: "2025-01-01"
            },
            rawSteps: {
                ArrayOfStep: {
                    Step: [
                        {
                            StepId: 1,
                            ParentStepId: 0,
                            Name: "Load Data",
                            StepType: "RunDirectQuery",
                            Sequence: 1,
                            Definition: {
                                StorageObject: {
                                    TableName: "SourceTable",
                                    Columns: {
                                        ColumnItem: [{ ColumnName: "ColA", DataType: "String" }]
                                    }
                                }
                            }
                        }
                    ]
                }
            },
            dateAdded: new Date()
        };

        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const html = await EtlGenerator.generateHtmlView(1, 'technical');

        // Assertions
        expect(db.reports.get).toHaveBeenCalledWith(1);
        
        // Header info
        expect(html).toContain('Test Process');
        expect(html).toContain('PROC-01');
        
        // Summary
        expect(html).toContain('Executive Summary');
        
        // Step Content
        expect(html).toContain('Load Data');
        expect(html).toContain('RunDirectQuery'); // Technical mode shows types
        expect(html).toContain('SourceTable');
    });

    it('hides technical details in business mode', async () => {
         const mockReport = {
            id: 1,
            filename: 'test.t1etlp',
            metadata: { name: "Biz Process", version: "1.0", id: "B1" },
            rawSteps: {
                ArrayOfStep: {
                    Step: [
                        {
                            StepId: 1, ParentStepId: 0, Name: "Tech Step", StepType: "RunDirectQuery", Sequence: 1,
                            Definition: { StorageObject: { TableName: "T1" } }
                        }
                    ]
                }
            },
            dateAdded: new Date()
        };

        vi.mocked(db.reports.get).mockResolvedValue(mockReport as any);

        const html = await EtlGenerator.generateHtmlView(1, 'business');

        // Business mode logic often filters out certain step types or details
        // In EtlParser (Business Mode), RunDirectQuery might be simplified or hidden if not white-listed, 
        // OR context is simplified.
        // Let's check context. 
        expect(html).toContain('Biz Process');
        // "RunDirectQuery" type label is hidden in business mode (logic in renderStep: `${mode === 'technical' ? ...}`)
        expect(html).not.toContain('(RunDirectQuery)'); 
    });
});
