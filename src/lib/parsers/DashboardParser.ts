import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { DashboardParsed, XmlNode } from './types';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

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

export class DashboardParser {
    static async parse(file: File): Promise<DashboardParsed> {
        const zip = await JSZip.loadAsync(file);
        const result: DashboardParsed = {};

        // Parse ALL XML files in the Dashboard package
        const fileNames = [
            'Dashboard.xml',
            'Visualisations.xml',
            'Links.xml',
            'Variables.xml',
            'Resources.xml',
            'Theme.xml',
        ];

        for (const fileName of fileNames) {
            const f = zip.file(fileName);
            if (f) {
                const content = await f.async('string');
                try {
                    const parsed = parser.parse(content) as XmlNode;
                    // Deep parse ALL nested XML strings recursively
                    deepParseAllXml(parsed);
                    result[fileName.replace('.xml', '')] = parsed;
                } catch (e) {
                    console.warn(`Failed to parse ${fileName}`, e);
                }
            }
        }

        return result;
    }
}
