import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { db } from './db';

import { DataModelParser } from './parsers/DataModelParser';
import { DashboardParser } from './parsers/DashboardParser';
import { XlOneParser } from './parsers/XlOneParser';
import { asNode, type XmlNode, type XmlValue } from './parsers/types';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

/**
 * Coerce a leaf XmlValue to a string. With `ignoreAttributes: false`, attributed
 * nodes parse as `{ '@_x': ..., '#text': ... }`; extract `#text` so metadata
 * isn't stored as "[object Object]". '' for other objects/arrays/nullish.
 */
function getText(val: XmlValue): string {
    if (val == null) return '';
    if (typeof val === 'object') {
        const node = asNode(val);
        return node && typeof node['#text'] === 'string' ? node['#text'] : '';
    }
    return String(val);
}

/**
 * Recursively parse any string field that looks like XML.
 * This ensures ALL nested XML content is fully extracted.
 */
function deepParseAllXml(obj: XmlNode): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (
            (typeof val === 'string' && val.trim().startsWith('<?xml')) ||
            (typeof val === 'string' && val.trim().startsWith('<') && val.trim().endsWith('>'))
        ) {
            try {
                const parsed = parser.parse(val as string) as XmlNode;
                obj[key] = parsed;
                // Recursively parse the newly parsed object
                deepParseAllXml(parsed);
            } catch (_e) {
                // Not valid XML, leave as string
            }
        } else if (Array.isArray(val)) {
            val.forEach((item) => deepParseAllXml(item as XmlNode));
        } else if (val && typeof val === 'object') {
            deepParseAllXml(val as XmlNode);
        }
    });
}

export class FileProcessor {
    static async processAndSave(file: File): Promise<number> {
        console.log(`Processing ${file.name}...`);

        if (file.name.toLowerCase().endsWith('.t1dm')) {
            return this.processDataModel(file);
        }

        if (file.name.toLowerCase().endsWith('.t1db')) {
            return this.processDashboard(file);
        }

        if (file.name.toLowerCase().endsWith('.t1xl')) {
            return this.processXlReport(file);
        }

        // 1. Unzip
        const zip = await JSZip.loadAsync(file);

        // 2. Parse ALL XML files in the archive
        const rawData: Record<string, any> = {};

        const xmlFiles = ['Processes.xml', 'Steps.xml', 'Variables.xml', 'FileLocations.xml', 'Attachments.xml'];

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
        const procList = Array.isArray(rawProcs) ? rawProcs : rawProcs ? [rawProcs] : [];

        const getUnique = (arr: any[], key: string) => [...new Set(arr.map((x) => x[key]).filter(Boolean))].join(', ');

        const rawOwner = getUnique(procList, 'Owner') || 'N/A';
        let publisher = rawOwner;
        let publishedDate =
            getUnique(procList, 'DateSaved') || getUnique(procList, 'DateModified') || new Date().toISOString();
        const narration = getUnique(procList, 'VersionNarration') || getUnique(procList, 'Narration') || '';

        // Try to extract actual publisher and date from narration (e.g. "Published by MGUPTA on 28-Nov-2025 17:55:48")
        if (narration && narration.includes('Published by ')) {
            const match = narration.match(
                /Published by\s+([A-Za-z0-9_]+)(?:\s+on\s+([0-9]{1,2}-[A-Za-z]{3}-[0-9]{4}\s+[0-9:]{8}))?/i
            );
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
            parentPath: getUnique(procList, 'ParentFileItemPath') || '',
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
            dateAdded: new Date(),
        });

        console.log(`Saved report ${reportId} to DB`);
        return reportId as number;
    }

    private static async processDataModel(file: File): Promise<number> {
        const content = await DataModelParser.parse(file);

        // Extract basic metadata safely
        const dataModel = asNode(content.DataModel);
        const dmDef = asNode(dataModel?.DataModelDef) || asNode(dataModel?.DataModelDefinition) || {};

        // Extract ProcessMode deeply
        const rootDef = asNode(asNode(dmDef.Definition)?.DataModelDefinition) || dmDef;
        const processMode = getText(rootDef.ProcessMode) || 'N/A';

        // Name Strategy:
        // 1. Description from XML (usually the cleanest name)
        // 2. Fallback to Filename, with GUID/Timestamp stripped
        let cleanName = getText(dmDef.Description);
        if (!cleanName) {
            cleanName = file.name.replace(/\.t1dm$/i, '');
            // Remove GUID if present (e.g. _c2dfa917-7450-42b8-a5bb-f5802916cedc...)
            cleanName = cleanName.replace(
                /_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}.*$/,
                ''
            );
        }

        const metadata = {
            name: cleanName,
            id: getText(dmDef.DataModelId) || 'N/A',
            description: getText(dmDef.Description) || 'Imported Data Model',
            version: getText(dmDef.Version) || '1.0',
            owner: getText(dmDef.Owner) || 'Unknown',
            processMode: processMode,
            dateModified: new Date().toISOString(),
        };

        const id = await db.dataModels.add({
            filename: file.name,
            metadata,
            content, // Parsed JSON of all XMLs
            dateAdded: new Date(),
        });

        console.log(`Saved Data Model ${id} to DB`);
        return id as number;
    }

    private static async processDashboard(file: File): Promise<number> {
        const content = await DashboardParser.parse(file);

        // Extract metadata from Dashboard.xml
        const dashDef = asNode(asNode(content.Dashboard)?.EntityDef) || {};

        // Name: Use Description as the primary name
        const name = getText(dashDef.Description) || file.name.replace(/\.t1db$/i, '');

        const metadata = {
            name: name,
            id: getText(dashDef.GenericEntityId) || 'N/A',
            description: getText(dashDef.Description),
            owner: getText(dashDef.Owner) || 'Unknown',
            parentPath: getText(dashDef.ParentFileItemPath),
            dateModified: new Date().toISOString(),
        };

        const id = await db.dashboards.add({
            filename: file.name,
            metadata,
            content, // Parsed JSON of all XMLs
            dateAdded: new Date(),
        });

        console.log(`Saved Dashboard ${id} to DB`);
        return id as number;
    }

    private static async processXlReport(file: File): Promise<number> {
        const content = await XlOneParser.parse(file);

        const name = content.header.title || file.name.replace(/\.t1xl$/i, '');

        const metadata = {
            name,
            id: content.header.reportId || 'N/A',
            description: content.header.description,
            owner: content.header.userId || 'Unknown',
            parentPath: content.header.parentPath,
            type: content.header.type,
            datasource: content.header.datasource,
            dateModified: new Date().toISOString(),
        };

        const id = await db.xlReports.add({
            filename: file.name,
            metadata,
            content,
            dateAdded: new Date(),
        });

        console.log(`Saved XlOne Report ${id} to DB`);
        return id as number;
    }
}
