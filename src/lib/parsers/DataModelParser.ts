import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export class DataModelParser {
    private static parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
    });

    static async parse(file: File): Promise<any> {
        const zip = await JSZip.loadAsync(file);
        const result: any = {};

        const fileNames = [
            'DataModel.xml',
            'Queries.xml',
            'QueryColumns.xml',
            'QueryJoins.xml',
            'QueryDatasources.xml',
            'Variables.xml'
        ];

        for (const fileName of fileNames) {
            const f = zip.file(fileName);
            if (f) {
                const content = await f.async('string');
                try {
                    result[fileName.replace('.xml', '')] = this.parser.parse(content);
                } catch (e) {
                    console.warn(`Failed to parse ${fileName}`, e);
                }
            }
        }

        this.deepParse(result);
        return result;
    }

    private static deepParse(obj: any) {
        if (!obj || typeof obj !== 'object') return;

        Object.keys(obj).forEach(key => {
            const val = obj[key];
            if (typeof val === 'string' && (
                key.includes('Definition') ||
                key === 'Criteria' ||
                key === 'QueryListCriteria' ||
                key === 'ParameterValues'
            )) {
                try {
                    // Start parsing
                    obj[key] = this.parser.parse(val);
                    // Recursively parse the result
                    this.deepParse(obj[key]);
                } catch (e) {
                    // Ignore non-xml/invalid
                }
            }
            else if (typeof val === 'object') {
                this.deepParse(val);
            }
        });
    }
}
