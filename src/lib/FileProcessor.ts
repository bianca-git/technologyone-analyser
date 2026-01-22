import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { db } from './db';

import { DataModelParser } from './parsers/DataModelParser';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

/**
 * Recursively parse any string field that looks like XML.
 * This ensures ALL nested XML content is fully extracted.
 */
function deepParseAllXml(obj: any): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (typeof val === 'string' && val.trim().startsWith('<?xml') || 
            (typeof val === 'string' && val.trim().startsWith('<') && val.trim().endsWith('>'))) {
            try {
                const parsed = parser.parse(val);
                obj[key] = parsed;
                // Recursively parse the newly parsed object
                deepParseAllXml(obj[key]);
            } catch (_e) {
                // Not valid XML, leave as string
            }
        } else if (Array.isArray(val)) {
            val.forEach(item => deepParseAllXml(item));
        } else if (typeof val === 'object') {
            deepParseAllXml(val);
        }
    });
}

export class FileProcessor {
    static async processAndSave(file: File): Promise<number> {
        console.log(`Processing ${file.name}...`);

        if (file.name.toLowerCase().endsWith('.t1dm')) {
            return this.processDataModel(file);
        }

        // 1. Unzip
        const zip = await JSZip.loadAsync(file);
        
        // 2. Parse ALL XML files in the archive
        const rawData: Record<string, any> = {};
        
        const xmlFiles = [
            'Processes.xml',
            'Steps.xml',
            'Variables.xml',
            'FileLocations.xml',
            'Attachments.xml'
        ];

        for (const fileName of xmlFiles) {
            const f = zip.file(fileName);
            if (f) {
                const content = await f.async('string');
                try {
                    const parsed = parser.parse(content);
                    // Deep parse ALL nested XML strings recursively
                    deepParseAllXml(parsed);
                    rawData[fileName.replace('.xml', '')] = parsed;
                } catch (e) {
                    console.warn(`Failed to parse ${fileName}`, e);
                }
            }
        }

        if (!rawData.Processes) {
            throw new Error('Invalid T1ETLP file: Processes.xml not found');
        }

        // 3. Extract Basic Metadata
        const procXml = rawData.Processes;
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
            dateModified: publishedDate,
            // HIGH VALUE fields
            processType: getUnique(procList, 'ProcessType') || '$ETL',
            parentPath: getUnique(procList, 'ParentFileItemPath') || ''
        };

        // 4. Save to DB - now includes all parsed XML files
        const reportId = await db.reports.add({
            filename: file.name,
            metadata,
            rawProcess: rawData.Processes,
            rawSteps: rawData.Steps || {},
            rawVariables: rawData.Variables || {},
            rawFileLocations: rawData.FileLocations || {},
            rawAttachments: rawData.Attachments || {},
            dateAdded: new Date()
        });

        console.log(`Saved report ${reportId} to DB`);
        return reportId as number;
    }

    private static async processDataModel(file: File): Promise<number> {
        const content = await DataModelParser.parse(file);

        // Extract basic metadata safely
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
            id: dmDef.DataModelId || 'N/A',
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
