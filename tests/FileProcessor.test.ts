
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileProcessor } from '../src/lib/FileProcessor';
import { db } from '../src/lib/db';
import { DataModelParser } from '../src/lib/parsers/DataModelParser';
import JSZip from 'jszip';

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

// Mock JSZip
vi.mock('jszip', () => {
    return {
        default: {
            loadAsync: vi.fn()
        }
    };
});

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
            vi.mocked(JSZip.loadAsync).mockRejectedValue(new Error("Invalid zip"));
            await expect(FileProcessor.processAndSave(file)).rejects.toThrow("Invalid zip");
        });

        it('should process .t1etlp files correctly (Happy Path)', async () => {
            const file = new File(['dummy zip'], 'test_process.t1etlp', { type: 'application/zip' });

            // Mock content
            const mockProcessesXml = `
             <ArrayOfProcess>
                <Process>
                    <ProcessId>PROC-99</ProcessId>
                    <Name>My Test Process</Name>
                    <Version>1.2</Version>
                    <Status>P</Status>
                    <Owner>SuperAdmin</Owner>
                    <DateSaved>2025-10-10T10:00:00</DateSaved>
                    <Description>A test process description</Description>
                </Process>
             </ArrayOfProcess>
             `;
            // Nested Definition encoded in XML 
            const mockStepsXml = `
                <ArrayOfStep>
                    <Step>
                        <Name>Step One</Name>
                        <Definition>
                            &lt;StorageObject&gt;&lt;ColumnMapping&gt;&lt;TableColumnMapping&gt;&lt;DataType&gt;String&lt;/DataType&gt;&lt;/TableColumnMapping&gt;&lt;/ColumnMapping&gt;&lt;/StorageObject&gt;
                        </Definition>
                    </Step>
                </ArrayOfStep>
             `;

            // Mock JSZip behavior
            const mockFileFn = vi.fn((filename) => {
                if (filename === 'Processes.xml') {
                    return { async: vi.fn().mockResolvedValue(mockProcessesXml) };
                }
                if (filename === 'Steps.xml') {
                    return { async: vi.fn().mockResolvedValue(mockStepsXml) };
                }
                return null;
            });

            vi.mocked(JSZip.loadAsync).mockResolvedValue({
                file: mockFileFn
            } as any);

            const result = await FileProcessor.processAndSave(file);

            expect(result).toBe(101);
            expect(JSZip.loadAsync).toHaveBeenCalledWith(file);
            expect(db.reports.add).toHaveBeenCalledWith(expect.objectContaining({
                filename: 'test_process.t1etlp',
                metadata: expect.objectContaining({
                    name: 'My Test Process',
                    id: 'PROC-99',
                    owner: 'SuperAdmin',
                    version: '1.2'
                })
            }));
        });

        it('should extract publisher from narration if owner is generic', async () => {
            const file = new File(['dummy zip'], 'test.t1etlp', { type: 'application/zip' });

            const mockProcessesXml = `
            <ArrayOfProcess>
                <Process>
                    <ProcessId>ID</ProcessId>
                    <Owner>System</Owner>
                    <Narration>Published by REAL_USER on 01-Jan-2026 12:00:00</Narration>
                </Process>
            </ArrayOfProcess>
            `;

            const mockFileFn = vi.fn((filename) => {
                if (filename === 'Processes.xml') return { async: vi.fn().mockResolvedValue(mockProcessesXml) };
                if (filename === 'Steps.xml') return { async: vi.fn().mockResolvedValue('<Steps></Steps>') };
                return null;
            });

            vi.mocked(JSZip.loadAsync).mockResolvedValue({
                file: mockFileFn
            } as any);

            await FileProcessor.processAndSave(file);

            expect(db.reports.add).toHaveBeenCalledWith(expect.objectContaining({
                metadata: expect.objectContaining({
                    owner: 'REAL_USER',
                })
            }));
        });

        it('should handle missing Processes.xml', async () => {
            const file = new File(['dummy zip'], 'broken.t1etlp', { type: 'application/zip' });

            const mockFileFn = vi.fn(() => null); // File not found

            vi.mocked(JSZip.loadAsync).mockResolvedValue({
                file: mockFileFn
            } as any);

            await expect(FileProcessor.processAndSave(file)).rejects.toThrow('Invalid T1ETLP file: Processes.xml not found');
        });
    });
});
