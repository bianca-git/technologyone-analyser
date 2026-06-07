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

describe('XlOneParser — variables, criteria, row commands', () => {
    // Mirrors the real Definition-sheet layout: REPORT VARIABLES is a table
    // (header row B..F, then data rows), criteria is a side-column (G label,
    // H value) block under a column, ROW COMMANDS is a table (header A..F).
    const SS = [
        'FORMAT CIAXLONE REPORT', // 0
        'REPORT VARIABLES', // 1
        'Variable', // 2
        'Description', // 3
        'Type/Edit', // 4
        'Value', // 5
        'List Values', // 6
        'Period', // 7  (variable name)
        'Period to report', // 8 (description)
        'List', // 9 (type)
        '2025-06', // 10 (value)
        'P1;P2;P3', // 11 (list values)
        'COLUMN DEFINITION', // 12
        'Name:', // 13
        'ColumnDefn1', // 14
        'Criteria:', // 15
        'Column Name:', // 16
        'Action:', // 17
        'Field:', // 18
        'Details:', // 19
        'Display:', // 20
        'AccountCode', // 21 (criteria column name value)
        'Equals', // 22 (action value)
        'GL.Account', // 23 (field value)
        '1000', // 24 (details value)
        'Visible', // 25 (display value)
        'ROW COMMANDS', // 26
        'Command', // 27
        'Details', // 28
        'Selection', // 29
        'Search', // 30
        'Value (Fr)', // 31
        'Value (To)', // 32
        'LIST', // 33 (row command)
        'expand', // 34
    ];

    const SHEET = `<worksheet><sheetData>
        ${row(1, cell('A1', 0))}
        ${row(2, cell('A2', 1))}
        ${row(3, cell('B3', 2) + cell('C3', 3) + cell('D3', 4) + cell('E3', 5) + cell('F3', 6))}
        ${row(4, cell('A4', 7) + cell('B4', 7) + cell('C4', 8) + cell('D4', 9) + cell('E4', 10) + cell('F4', 11))}
        ${row(5, cell('A5', 12))}
        ${row(6, cell('A6', 13) + cell('B6', 14))}
        ${row(7, cell('A7', 15))}
        ${row(8, cell('G8', 16) + cell('H8', 21))}
        ${row(9, cell('G9', 17) + cell('H9', 22))}
        ${row(10, cell('G10', 18) + cell('H10', 23))}
        ${row(11, cell('G11', 19) + cell('H11', 24))}
        ${row(12, cell('G12', 20) + cell('H12', 25))}
        ${row(13, cell('A13', 26))}
        ${row(14, cell('A14', 27) + cell('B14', 28) + cell('C14', 29) + cell('D14', 30) + cell('E14', 31) + cell('F14', 32))}
        ${row(15, cell('A15', 33) + cell('B15', 34))}
    </sheetData></worksheet>`;

    it('parses the variables table', async () => {
        const result = await XlOneParser.parse(await makeT1xl(HEADER_ONLY, SS, SHEET));
        expect(result.sheet.variables.length).toBe(1);
        const v = result.sheet.variables[0];
        expect(v.name).toBe('Period');
        expect(v.description).toBe('Period to report');
        expect(v.type).toBe('List');
        expect(v.value).toBe('2025-06');
        expect(v.listValues).toBe('P1;P2;P3');
    });

    it('parses side-column criteria into the current column', async () => {
        const result = await XlOneParser.parse(await makeT1xl(HEADER_ONLY, SS, SHEET));
        expect(result.sheet.columns.length).toBe(1);
        const crit = result.sheet.columns[0].criteria;
        expect(crit.length).toBe(1);
        expect(crit[0].columnName).toBe('AccountCode');
        expect(crit[0].action).toBe('Equals');
        expect(crit[0].field).toBe('GL.Account');
        expect(crit[0].details).toBe('1000');
        expect(crit[0].display).toBe('Visible');
    });

    it('parses the row commands table', async () => {
        const result = await XlOneParser.parse(await makeT1xl(HEADER_ONLY, SS, SHEET));
        expect(result.sheet.rowCommands.length).toBe(1);
        expect(result.sheet.rowCommands[0].command).toBe('LIST');
        expect(result.sheet.rowCommands[0].details).toBe('expand');
    });
});
