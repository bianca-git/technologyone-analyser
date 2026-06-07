import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { XlOneParser } from '../src/lib/parsers/XlOneParser';

/** Build a minimal .t1xl File with the given Report.xml and optional xlsx parts. */
async function makeT1xl(reportXml: string, sharedStrings?: string[], sheetXml?: string): Promise<File> {
    const outer = new JSZip();
    outer.file('Report.xml', reportXml);

    if (sharedStrings) {
        const inner = new JSZip();
        const si = sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('');
        inner.file(
            'xl/sharedStrings.xml',
            `<?xml version="1.0"?><sst count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${si}</sst>`
        );
        inner.file('xl/worksheets/sheet1.xml', sheetXml || '<worksheet><sheetData/></worksheet>');
        const innerBlob = await inner.generateAsync({ type: 'uint8array' });
        outer.file('Report.xlsx', innerBlob);
    }

    const blob = await outer.generateAsync({ type: 'blob' });
    return new File([blob], 'Report.t1xl');
}

const HEADER_ONLY = `<?xml version="1.0" encoding="utf-8"?>
<MyXLOneHeader>
  <ReportId>0725a29d-1be8-4651-893a-9ef859fa3661</ReportId>
  <Title>Transactions</Title>
  <Type>B</Type>
  <UserId>BWILKINS</UserId>
  <Datasource>7f09c258-8b0e-40a8-851d-9d49c0ba6215</Datasource>
  <ReportingSystem>$DEFAULT</ReportingSystem>
  <ParentFileItemPath>/Home/BWILKINS</ParentFileItemPath>
  <ReportStorageType>A</ReportStorageType>
  <Definition>&lt;DbReportDef&gt;&lt;ReportSuite&gt;CES&lt;/ReportSuite&gt;&lt;/DbReportDef&gt;</Definition>
</MyXLOneHeader>`;

describe('XlOneParser — header', () => {
    it('parses MyXLOneHeader fields', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.header.title).toBe('Transactions');
        expect(result.header.type).toBe('B');
        expect(result.header.datasource).toBe('7f09c258-8b0e-40a8-851d-9d49c0ba6215');
        expect(result.header.userId).toBe('BWILKINS');
        expect(result.header.parentPath).toBe('/Home/BWILKINS');
    });

    it('unescapes and parses the nested DbReportDef', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.definition.ReportSuite).toBe('CES');
    });

    it('returns empty sheet sections when no xlsx present', async () => {
        const file = await makeT1xl(HEADER_ONLY);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.variables).toEqual([]);
        expect(result.sheet.columns).toEqual([]);
        expect(result.sheet.rowCommands).toEqual([]);
        expect(result.sheet.settings).toEqual({});
    });
});

// Cell helper: <c r="A1" t="s"><v>IDX</v></c> references sharedStrings[IDX].
function cell(ref: string, idx: number): string {
    return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
}
function row(rNum: number, cells: string): string {
    return `<row r="${rNum}">${cells}</row>`;
}

describe('XlOneParser — embedded xlsx grid', () => {
    // Shared-string table mirroring the real Transactions sample layout.
    const SS = [
        'FORMAT CIAXLONE REPORT', // 0
        'REPORT SETTINGS', // 1
        'Description:', // 2
        'Transactions', // 3
        'Narration:', // 4
        'Created By:', // 5
        'BWILKINS - 26-Apr-2025', // 6
        'REPORT VARIABLES', // 7
        'COLUMN DEFINITION', // 8
        'Name:', // 9
        'ColumnDefn1', // 10
        'Data Source:', // 11
        'Transactions (Financial System Administration) (7f09c258-8b0e-40a8-851d-9d49c0ba6215)', // 12
        'Parameters:', // 13
        'DataSourceType=CiADataSource;ChartName=GLCHART', // 14
        'ROW COMMANDS', // 15
    ];

    const SHEET = `<worksheet><sheetData>
        ${row(1, cell('A1', 1))}
        ${row(2, cell('A2', 2) + cell('B2', 3))}
        ${row(3, cell('A3', 4))}
        ${row(4, cell('A4', 5) + cell('B4', 6))}
        ${row(5, cell('A5', 8))}
        ${row(6, cell('A6', 9) + cell('B6', 10))}
        ${row(7, cell('A7', 11) + cell('B7', 12))}
        ${row(8, cell('A8', 13) + cell('B8', 14))}
        ${row(9, cell('A9', 15))}
    </sheetData></worksheet>`;

    it('reconstructs settings as key/value', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.settings['Description']).toBe('Transactions');
        expect(result.sheet.settings['Created By']).toBe('BWILKINS - 26-Apr-2025');
    });

    it('extracts a column definition with parsed data source ref', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.columns.length).toBe(1);
        const col = result.sheet.columns[0];
        expect(col.name).toBe('ColumnDefn1');
        expect(col.dataSource?.name).toBe('Transactions');
        expect(col.dataSource?.system).toBe('Financial System Administration');
        expect(col.dataSource?.guid).toBe('7f09c258-8b0e-40a8-851d-9d49c0ba6215');
    });

    it('parses key=value; parameter strings', async () => {
        const file = await makeT1xl(HEADER_ONLY, SS, SHEET);
        const result = await XlOneParser.parse(file);
        expect(result.sheet.columns[0].parameters['DataSourceType']).toBe('CiADataSource');
        expect(result.sheet.columns[0].parameters['ChartName']).toBe('GLCHART');
    });
});
