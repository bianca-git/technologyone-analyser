
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileProcessor } from '../src/lib/FileProcessor';
import { db } from '../src/lib/db';
import { DataModelParser } from '../src/lib/parsers/DataModelParser';

// Mocks
vi.mock('../src/lib/db', () => ({
    db: {
        reports: {
            add: vi.fn().mockResolvedValue(101),
        },
        dataModels: {
            add: vi.fn().mockResolvedValue(202),
        }
    }
}));

vi.mock('../src/lib/parsers/DataModelParser', () => ({
    DataModelParser: {
        parse: vi.fn()
    }
}));

describe('FileProcessor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('processAndSave', () => {
        it('should process .t1dm files correctly', async () => {
             // Polyfill File if needed (Node 20+ has it, jsdom has it)
            const file = new File(['<xml>dummy</xml>'], 'test_model.t1dm', { type: 'text/xml' });
            
            // Mock Parser Output
            const mockParsedContent = {
                DataModel: {
                    DataModelDef: {
                        Description: "Test Model",
                        DataModelId: "guide-123",
                        Version: "1.0",
                        Owner: "Tester"
                    }
                }
            };
            vi.mocked(DataModelParser.parse).mockResolvedValue(mockParsedContent);

            const result = await FileProcessor.processAndSave(file);
            
            expect(result).toBe(202);
            expect(DataModelParser.parse).toHaveBeenCalledWith(file);
            expect(db.dataModels.add).toHaveBeenCalledWith(expect.objectContaining({
                filename: 'test_model.t1dm',
                metadata: expect.objectContaining({
                    name: "Test Model",
                    id: "guide-123"
                })
            }));
        });

        it('should fail on invalid zip for .t1etlp', async () => {
            const file = new File(['not a zip'], 'bad.t1etlp');
            await expect(FileProcessor.processAndSave(file)).rejects.toThrow();
        });
    });
});
