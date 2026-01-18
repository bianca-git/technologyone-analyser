
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataModelGenerator } from '../src/lib/generators/DataModelGenerator';
import { db } from '../src/lib/db';

vi.mock('../src/lib/db', () => ({
    db: {
        dataModels: {
            get: vi.fn()
        }
    }
}));

describe('DataModelGenerator', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('throws error if model not found', async () => {
        vi.mocked(db.dataModels.get).mockResolvedValue(undefined);
        await expect(DataModelGenerator.generateHtmlView(999)).rejects.toThrow("Data Model not found");
    });

    it('generates complex html view for data model', async () => {
        const mockDM = {
            id: 202,
            filename: 'complex.t1dm',
            metadata: {
                name: "Budget Model",
                version: "2.1",
                owner: "Finance",
                dateModified: "2025-01-15T12:00:00Z"
            },
            // Partially mimic the huge JSON structure from DataModelParser
            content: {
                DataModel: {
                    DataModelDef: {
                        ProcessMode: "Stored"
                    }
                },
                Variables: {
                    ArrayOfVariableDef: {
                        VariableDef: [
                            { Name: "FiscalYear", DefaultValue: "2025", Description: "Current Year" }
                        ]
                    }
                },
                Queries: {
                    ArrayOfQuery: {
                        Query: [
                            { QueryName: "BaseData", Sequence: "1", Id: "Q1" },
                            { QueryName: "FinalAggregation", Sequence: "2", Id: "Q2" }
                        ]
                    }
                },
                QueryColumns: {
                     ArrayOfQueryColumn: {
                         QueryColumn: [
                             { QueryName: "BaseData", ColumnName: "Amount", DataType: "Decimal" },
                             { QueryName: "FinalAggregation", ColumnName: "Total", Expression: "SUM(Amount)" }
                         ]
                     }
                },
                QueryJoins: {
                     ArrayOfQueryJoin: {
                         QueryJoin: { QueryName: "FinalAggregation", JoinType: "Left", DataSource1: "BaseData", Field1: "ID", DataSource2: "Lookups", Field2: "ID" }
                     }
                }
            },
            dateAdded: new Date()
        };

        vi.mocked(db.dataModels.get).mockResolvedValue(mockDM as any);

        const html = await DataModelGenerator.generateHtmlView(202);

        // Header
        expect(html).toContain('Budget Model');
        expect(html).toContain('Stored');
        expect(html).toContain('Finance');

        // Variables
        expect(html).toContain('FiscalYear');
        expect(html).toContain('2025');

        // Queries (Transformation Layers)
        // Since there are 2 queries, BaseData is intermediate, FinalAggregation is Final.
        
        // Intermediate Query Checks
        expect(html).toContain('BaseData');
        expect(html).toContain('Transformation Layers (1)'); // 1 intermediate

        // Final Query Checks
        expect(html).toContain('FinalAggregation');
        expect(html).toContain('Final Output');
        
        // Columns
        expect(html).toContain('Amount');
        expect(html).toContain('Total');
        expect(html).toContain('SUM(Amount)');

        // Joins
        expect(html).toContain('Left');
        expect(html).toContain('BaseData.ID');
    });
});
