import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { db } from './db';

import { DataModelParser } from './parsers/DataModelParser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export class FileProcessor {
    static async processAndSave(file: File): Promise<number> {
        console.log(`Processing ${file.name}...`);

        if (file.name.toLowerCase().endsWith('.t1dm')) {
            return this.processDataModel(file);
        }

        // 1. Unzip
        const zip = await JSZip.loadAsync(file);
        const processesFile = zip.file('Processes.xml');
        const stepsFile = zip.file('Steps.xml');

        if (!processesFile) {
            throw new Error('Invalid T1ETLP file: Processes.xml not found');
        }

        // 2. Parse XML
        const procContent = await processesFile.async('string');
        const procXml = parser.parse(procContent);

        let stepsXml: any = {};
        if (stepsFile) {
            const stepsContent = await stepsFile.async('string');
            stepsXml = parser.parse(stepsContent);

            // 3. Deep Parse Definitions (Ported from scripts/inspect_etl_deep.ts)
            const deepParseStep = (step: any) => {
                Object.keys(step).forEach(key => {
                    if (key.includes('Definition') && typeof step[key] === 'string') {
                        try {
                            const parsed = parser.parse(step[key]);
                            step[key] = parsed;

                            // 3a. Deep Parse TableColumnMapping if present
                            // Often TableColumnMapping is an array of objects where DataType might be hidden
                            const storage = parsed?.StorageObject;
                            if (storage && storage.ColumnMapping?.TableColumnMapping) {
                                // Sometimes TableColumnMapping entries contain further nested XML or complex structures
                                // Ensure DataType is accessible
                                const mappings = Array.isArray(storage.ColumnMapping.TableColumnMapping)
                                    ? storage.ColumnMapping.TableColumnMapping
                                    : [storage.ColumnMapping.TableColumnMapping];

                                mappings.forEach((_m: any) => {
                                    // Verify if DataType is here. If it's undefined, it might be in a nested Definition?
                                    // Usually it is a direct property: <DataType>String</DataType>
                                    // No extra action needed if fast-xml-parser handles it, but good to inspect.
                                });
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                });
                if (step.children) {
                    step.children.forEach(deepParseStep);
                }
            };

            const steps = stepsXml.ArrayOfStep?.Step;
            if (steps && Array.isArray(steps)) {
                steps.forEach(deepParseStep);
            } else if (steps) {
                deepParseStep(steps);
            }
        }

        // 4. Extract Basic Metadata
        // fast-xml-parser might return the root element or not depending on structure.
        // 4. Extract Basic Metadata
        const rawProcs = procXml?.ArrayOfProcess?.Process || procXml?.Process?.ArrayOfProcess?.Process;
        const procList = Array.isArray(rawProcs) ? rawProcs : (rawProcs ? [rawProcs] : []);

        const getUnique = (arr: any[], key: string) => [...new Set(arr.map(x => x[key]).filter(Boolean))].join(', ');

        const rawOwner = getUnique(procList, 'Owner') || 'N/A';
        let publisher = rawOwner;
        let publishedDate = getUnique(procList, 'DateSaved') || getUnique(procList, 'DateModified') || new Date().toISOString();
        const narration = getUnique(procList, 'VersionNarration') || getUnique(procList, 'Narration') || '';

        // Try to extract actual publisher and date from narration (e.g. "Published by MGUPTA on 28-Nov-2025 17:55:48")
        if (narration && narration.includes('Published by ')) {
            const match = narration.match(/Published by\s+([A-Za-z0-9_]+)(?:\s+on\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4}\s+[0-9:]{8}))?/i);
            if (match) {
                if (match[1]) publisher = match[1];
                if (match[2]) publishedDate = match[2];
            }
        }

        const metadata = {
            name: getUnique(procList, 'Name') || 'N/A',
            id: getUnique(procList, 'ProcessId') || 'N/A',
            version: getUnique(procList, 'Version') || 'N/A',
            owner: publisher,
            description: getUnique(procList, 'Description') || 'N/A',
            status: getUnique(procList, 'Status') || 'D',
            narration: narration,
            dateModified: publishedDate
        };

        // 5. Save to DB
        const reportId = await db.reports.add({
            filename: file.name,
            metadata,
            rawProcess: procXml,
            rawSteps: stepsXml,
            dateAdded: new Date()
        });

        console.log(`Saved report ${reportId} to DB`);
        return reportId as number;
    }

    private static async processDataModel(file: File): Promise<number> {
        const content = await DataModelParser.parse(file);

        // Extract basic metadata safely
        // Extract basic metadata safely
        // Step 111 and 113 show 'DataModelDef' as the key, but checking both just in case
        const dmDef = content.DataModel?.DataModelDef || content.DataModel?.DataModelDefinition || {};

        // Extract ProcessMode deeply
        const rootDef = dmDef.Definition?.DataModelDefinition || dmDef;
        const processMode = rootDef.ProcessMode || 'N/A';

        // Name Strategy:
        // 1. Description from XML (usually the cleanest name)
        // 2. Fallback to Filename, with GUID/Timestamp stripped
        let cleanName = dmDef.Description;
        if (!cleanName) {
            cleanName = file.name.replace(/\.t1dm$/i, '');
            // Remove GUID if present (e.g. _c2dfa917-7450-42b8-a5bb-f5802916cedc...)
            cleanName = cleanName.replace(/_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}.*$/, '');
        }

        const metadata = {
            name: cleanName,
            id: dmDef.DataModelId || 'N/A', // Extract GUID
            description: dmDef.Description || 'Imported Data Model',
            version: dmDef.Version || '1.0',
            owner: dmDef.Owner || 'Unknown',
            processMode: processMode,
            dateModified: new Date().toISOString()
        };

        const id = await db.dataModels.add({
            filename: file.name,
            metadata,
            content, // Parsed JSON of all XMLs
            dateAdded: new Date()
        });

        console.log(`Saved Data Model ${id} to DB`);
        return id as number;
    }
}
