import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
    asNode,
    type XmlNode,
    type XmlValue,
    type XlReportParsed,
    type XlDefinitionSheet,
    type XlColumnDefn,
    type XlCriteriaRow,
    type XlDataSourceRef,
} from './types';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
});

/**
 * Recursively parse any string field that looks like XML (mirrors the helper in
 * DashboardParser / FileProcessor). Handles the entity-escaped DbReportDef inside
 * the <Definition> element.
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

/** Coerce a leaf XmlValue to a string, extracting `#text` for attributed nodes. */
function getText(val: XmlValue): string {
    if (val == null) return '';
    if (typeof val === 'object') {
        const node = asNode(val);
        return node && typeof node['#text'] === 'string' ? node['#text'] : '';
    }
    return String(val);
}

function emptySheet(): XlDefinitionSheet {
    return { settings: {}, variables: [], columns: [], rowCommands: [] };
}

/** Parse a `key=value;key=value;` string into an object (trailing `;` tolerated). */
function parseKvString(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    if (raw == null || raw === '') return out;
    raw.split(';').forEach((pair) => {
        if (pair === '') return;
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim();
        if (k !== '') out[k] = v;
    });
    return out;
}

/** Parse "Name (System) (GUID)" into its parts. GUID is the last (...) group. */
function parseDataSourceRef(raw: string): XlDataSourceRef {
    const guidMatch = raw.match(/\(([0-9a-fA-F-]{36})\)\s*$/);
    const guid = guidMatch ? guidMatch[1] : '';
    const rest = guid ? raw.slice(0, guidMatch!.index).trim() : raw.trim();
    const sysMatch = rest.match(/\(([^)]*)\)\s*$/);
    const system = sysMatch ? sysMatch[1] : '';
    const name = sysMatch ? rest.slice(0, sysMatch.index).trim() : rest;
    return { raw, name, system, guid };
}

/** Build the shared-strings array from sharedStrings.xml. */
function readSharedStrings(xml: string): string[] {
    const root = parser.parse(xml) as XmlNode;
    const sst = asNode(root.sst);
    if (!sst) return [];
    const siRaw = sst.si;
    const siList = (Array.isArray(siRaw) ? siRaw : siRaw == null ? [] : [siRaw]) as XmlValue[];
    return siList.map((si) => {
        const node = asNode(si);
        if (!node) return getText(si);
        // <si><t>text</t></si> OR <si><r><t>..</t></r>...</si> (rich text runs)
        if (node.t != null) return getText(node.t);
        if (node.r != null) {
            const runs = (Array.isArray(node.r) ? node.r : [node.r]) as XmlValue[];
            return runs.map((run) => getText(asNode(run)?.t)).join('');
        }
        return '';
    });
}

/** Column letters from a cell ref like "B12" -> "B". */
function colOf(ref: string): string {
    const m = ref.match(/^([A-Z]+)/);
    return m ? m[1] : '';
}
/** Row number from a cell ref like "B12" -> 12. */
function rowOf(ref: string): number {
    const m = ref.match(/(\d+)$/);
    return m ? Number(m[1]) : 0;
}

/** Build a Map<cellRef, string> resolving shared-string cells to text. */
function readSheetCells(xml: string, shared: string[]): Map<string, string> {
    const root = parser.parse(xml) as XmlNode;
    const sheetData = asNode(asNode(root.worksheet)?.sheetData);
    const cells = new Map<string, string>();
    if (!sheetData) return cells;
    const rowsRaw = sheetData.row;
    const rows = (Array.isArray(rowsRaw) ? rowsRaw : rowsRaw == null ? [] : [rowsRaw]) as XmlValue[];
    rows.forEach((r) => {
        const rowNode = asNode(r);
        if (!rowNode) return;
        const cRaw = rowNode.c;
        const cArr = (Array.isArray(cRaw) ? cRaw : cRaw == null ? [] : [cRaw]) as XmlValue[];
        cArr.forEach((c) => {
            const cNode = asNode(c);
            if (!cNode) return;
            const ref = getText(cNode['@_r']);
            if (ref === '') return;
            const tType = getText(cNode['@_t']);
            const v = getText(cNode.v);
            if (tType === 's') {
                const idx = Number(v);
                cells.set(ref, shared[idx] != null ? shared[idx] : '');
            } else if (v !== '') {
                cells.set(ref, v);
            } else {
                const inline = getText(asNode(cNode.is)?.t);
                if (inline !== '') cells.set(ref, inline);
            }
        });
    });
    return cells;
}

/**
 * Reconstruct the Definition sheet sections from a resolved cell map. The sheet
 * is a labelled grid: a label in column A, its value in the next column(s).
 * Section headers (REPORT SETTINGS / COLUMN DEFINITION / ROW COMMANDS) switch
 * the active block. Column B holds the value for a column-A label.
 */
function reconstructSheet(cells: Map<string, string>): XlDefinitionSheet {
    const sheet: XlDefinitionSheet = emptySheet();
    if (cells.size === 0) return sheet;

    // Group cells by row, ordered.
    const byRow = new Map<number, Map<string, string>>();
    for (const [ref, val] of cells) {
        const rn = rowOf(ref);
        if (!byRow.has(rn)) byRow.set(rn, new Map());
        byRow.get(rn)!.set(colOf(ref), val);
    }
    const rowNums = Array.from(byRow.keys()).sort((a, b) => a - b);

    // Block discriminator. 'variables'/'rowcommands' are tabular (header row of
    // column labels, then data rows). 'settings'/'column' are label:value rows.
    type Block = 'none' | 'settings' | 'column' | 'variables' | 'rowcommands';
    let block: Block = 'none';
    let current: XlColumnDefn | null = null;

    // Header column-letter -> field label, captured from the first row after a
    // tabular section header (REPORT VARIABLES / ROW COMMANDS).
    let tableHeader: Map<string, string> | null = null;

    // Criteria for the current column is a vertical label:value block in a side
    // column (col G label, col H value in the samples). A new "Column Name:" label
    // starts a fresh criteria row.
    let pendingCriteria: XlCriteriaRow | null = null;
    const criteriaFieldFor = (label: string): keyof XlCriteriaRow | null => {
        switch (label) {
            case 'Column Name':
                return 'columnName';
            case 'Action':
                return 'action';
            case 'Field':
                return 'field';
            case 'Details':
                return 'details';
            case 'Display':
                return 'display';
            default:
                return null;
        }
    };
    const flushCriteria = () => {
        if (pendingCriteria && current) current.criteria.push(pendingCriteria);
        pendingCriteria = null;
    };

    const flushColumn = () => {
        flushCriteria();
        if (current) {
            sheet.columns.push(current);
            current = null;
        }
    };

    /** Read the data cells of a tabular row against the captured header map. */
    const rowValues = (cols: Map<string, string>): string[] => {
        if (!tableHeader) return [];
        return Array.from(tableHeader.keys()).map((col) => (cols.get(col) || '').trim());
    };

    for (const rn of rowNums) {
        const cols = byRow.get(rn)!;
        const a = (cols.get('A') || '').trim();
        const b = (cols.get('B') || '').trim();

        // --- Section headers switch the active block ---
        if (a === 'REPORT SETTINGS') {
            flushColumn();
            block = 'settings';
            tableHeader = null;
            continue;
        }
        if (a === 'REPORT VARIABLES') {
            flushColumn();
            block = 'variables';
            tableHeader = null; // captured on the next row
            continue;
        }
        if (a === 'COLUMN DEFINITION') {
            flushColumn();
            block = 'column';
            current = { name: '', dataSource: null, parameters: {}, runtime: {}, criteria: [] };
            tableHeader = null;
            continue;
        }
        if (a === 'ROW COMMANDS') {
            flushColumn();
            block = 'rowcommands';
            tableHeader = null; // captured on the next row
            continue;
        }
        if (a === 'FORMAT CIAXLONE REPORT') continue;

        // --- Side-column criteria (label:value in cols G/H) for the current column ---
        if (block === 'column' && current) {
            const g = (cols.get('G') || '').trim();
            if (g !== '') {
                const cf = criteriaFieldFor(g.replace(/:$/, ''));
                if (cf) {
                    if (cf === 'columnName') {
                        flushCriteria();
                        pendingCriteria = { columnName: '', action: '', field: '', details: '', display: '' };
                    }
                    if (pendingCriteria) pendingCriteria[cf] = (cols.get('H') || '').trim();
                    continue;
                }
            }
        }

        if (block === 'settings') {
            if (a === '') continue;
            sheet.settings[a.replace(/:$/, '')] = b;
        } else if (block === 'column' && current) {
            if (a === '') continue;
            const label = a.replace(/:$/, '');
            if (label === 'Name') current.name = b;
            else if (label === 'Data Source') current.dataSource = parseDataSourceRef(b);
            else if (label === 'Parameters') current.parameters = parseKvString(b);
            else if (label === 'Runtime') current.runtime = parseKvString(b);
            // 'Criteria:' label row itself carries no value; rows handled above.
        } else if (block === 'variables') {
            if (tableHeader == null) {
                // First row after the section header carries the column labels.
                tableHeader = new Map();
                for (const [col, val] of cols) {
                    const t = (val || '').trim();
                    if (t !== '') tableHeader.set(col, t);
                }
                continue;
            }
            const vals = rowValues(cols);
            // Skip an all-empty row.
            if (vals.every((v) => v === '')) continue;
            sheet.variables.push({
                name: vals[0] || a,
                description: vals[1] || '',
                type: vals[2] || '',
                value: vals[3] || '',
                listValues: vals[4] || '',
            });
        } else if (block === 'rowcommands') {
            if (tableHeader == null) {
                tableHeader = new Map();
                for (const [col, val] of cols) {
                    const t = (val || '').trim();
                    if (t !== '') tableHeader.set(col, t);
                }
                continue;
            }
            const vals = rowValues(cols);
            if (vals.every((v) => v === '')) continue;
            sheet.rowCommands.push({
                command: vals[0] || '',
                details: vals[1] || '',
                selection: vals[2] || '',
                search: vals[3] || '',
                valueFrom: vals[4] || '',
                valueTo: vals[5] || '',
            });
        }
    }
    flushColumn();
    return sheet;
}

export class XlOneParser {
    static async parse(file: File): Promise<XlReportParsed> {
        const zip = await JSZip.loadAsync(file);

        // --- Outer Report.xml ---
        const reportFile = zip.file('Report.xml');
        let headerNode: XmlNode = {};
        if (reportFile) {
            const content = await reportFile.async('string');
            try {
                const parsed = parser.parse(content) as XmlNode;
                deepParseAllXml(parsed);
                headerNode = asNode(parsed.MyXLOneHeader) || {};
            } catch (e) {
                console.warn('Failed to parse Report.xml', e);
            }
        }

        const definition = asNode(headerNode.Definition)
            ? asNode(asNode(headerNode.Definition)?.DbReportDef) || {}
            : {};

        const header = {
            reportId: getText(headerNode.ReportId),
            title: getText(headerNode.Title),
            description: getText(headerNode.Description),
            category: getText(headerNode.Category),
            type: getText(headerNode.Type),
            sheetName: getText(headerNode.SheetName),
            userId: getText(headerNode.UserId),
            datasource: getText(headerNode.Datasource),
            reportingSystem: getText(headerNode.ReportingSystem),
            parentPath: getText(headerNode.ParentFileItemPath),
            storageType: getText(headerNode.ReportStorageType),
        };

        // --- Embedded xlsx Definition sheet ---
        let sheet = emptySheet();
        const xlsxName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.xlsx'));
        if (xlsxName) {
            try {
                const xlsxBytes = await zip.file(xlsxName)!.async('uint8array');
                const inner = await JSZip.loadAsync(xlsxBytes);
                const ssFile = inner.file('xl/sharedStrings.xml');
                const sheetFile =
                    inner.file('xl/worksheets/sheet1.xml') ||
                    inner.file(Object.keys(inner.files).find((n) => /xl\/worksheets\/.*\.xml$/.test(n)) || '');
                const shared = ssFile ? readSharedStrings(await ssFile.async('string')) : [];
                if (sheetFile) {
                    const cells = readSheetCells(await sheetFile.async('string'), shared);
                    sheet = reconstructSheet(cells);
                }
            } catch (e) {
                console.warn('Failed to parse embedded xlsx', e);
            }
        }

        return { header, definition, sheet };
    }
}
