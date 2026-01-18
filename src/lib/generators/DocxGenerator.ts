import { db } from '../db';
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    WidthType,
    HeadingLevel,
    TextRun,
    Header,
    Footer,
    AlignmentType,
    ShadingType,
    PageNumber,
    BorderStyle
} from 'docx';
import { EtlParser } from '../parsers/EtlParser';

export class DocxGenerator {

    // --- Helpers ---
    private static createText(text: string, opts: any = {}) {
        return new TextRun({ text: text || '', font: "Segoe UI", size: 22, ...opts });
    }

    private static createHeaderCell(text: string) {
        return new TableCell({
            children: [new Paragraph({ children: [this.createText(text, { bold: true, size: 20 })] })],
            shading: { fill: "E0E0E0", type: ShadingType.CLEAR },
            verticalAlign: AlignmentType.CENTER
        });
    }

    private static createCell(text: string | Paragraph[], opts: any = {}) {
        const children = typeof text === 'string'
            ? [new Paragraph({ children: [this.createText(text, { size: 20, ...opts })] })]
            : text;
        return new TableCell({ children, verticalAlign: AlignmentType.CENTER });
    }

    // Reuse the Executive Summary logic from EtlGenerator
    private static generateEtlSummary(flow: any[]) {
        const getSourceNames = (s: any) => {
            if (s.RawType === 'RunDirectQuery' || s.RawType === 'RunTableQuery')
                return s.Details.find((d: string) => d.startsWith('Source Table:'))?.split(': ')[1];
            if (s.RawType === 'RunDatasourceQuery' || s.RawType === 'RunSimpleQuery')
                return s.Details.find((d: string) => d.startsWith('Source:'))?.split(': ')[1];
            if (s.RawType === 'LoadTextFile')
                return s.Details.find((d: string) => d.startsWith('File:'))?.split(': ')[1];
            return null;
        };

        const getTargetNames = (s: any) => {
            if (s.RawType === 'ImportWarehouseData') return `the ${s.Output?.name || 'Warehouse'}`;
            if (s.RawType === 'ExportToExcel') return `an Excel file`;
            if (s.RawType === 'SendEmail') return `Email recipients`;
            if (s.RawType === 'SaveText' || s.RawType === 'SaveTextfile') return `a Text file`;
            return null;
        };

        const sources = [...new Set(flow.map(getSourceNames).filter(Boolean))];
        const targets = [...new Set(flow.map(getTargetNames).filter(Boolean))];

        const hasCalcs = flow.some(s => s.RawType === 'AddColumn' || s.RawType === 'UpdateColumn' || s.RawType === 'CalculateVariable');
        const hasJoins = flow.some(s => s.RawType === 'JoinTable');
        const hasConditions = flow.some(s => s.RawType === 'Decision' || s.RawType === 'Branch');

        let parts = [];
        if (sources.length > 0) parts.push(`extracts data from ${sources.join(', ')}`);
        if (hasJoins) parts.push(`combines multiple datasets`);
        if (hasCalcs) parts.push(`performs business calculations`);

        let targetAction = hasConditions ? "and, based on certain conditions, distributes results to " : "and publishes results to ";
        if (targets.length > 0) parts.push(`${targetAction}${targets.join(', ')}`);

        if (parts.length === 0) return "This process performs a sequence of data operations.";
        const narrative = parts.slice(0, -1).join(', ') + (parts.length > 1 ? ' and ' : '') + parts.slice(-1);
        return `This process ${narrative}.`;
    }

    // --- ETL Report Extraction ---
    static async downloadDocx(reportId: number, mode: 'business' | 'technical' = 'technical') {
        const report = await db.reports.get(reportId);
        if (!report) throw new Error('Report not found');

        const flowData = EtlParser.parseSteps(report.rawSteps, mode);
        const sections: any[] = [];

        // 1. Header Information
        sections.push(new Paragraph({
            children: [this.createText(report.metadata.name, { bold: true, size: 32 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 }
        }));

        // Meta Table
        const metaRows = [
            ["Description", report.metadata.description],
            ["Version", `${report.metadata.version} (${report.metadata.status === 'P' ? 'Published' : 'Draft'})`],
            ["Owner", report.metadata.owner],
            ["Last Modified", report.metadata.dateModified || '-']
        ];

        sections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: metaRows.map(r => new TableRow({
                children: [
                    this.createHeaderCell(r[0]!),
                    this.createCell(r[1]!)
                ]
            }))
        }));
        sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));

        // 2. Executive Summary
        sections.push(new Paragraph({ children: [this.createText("Executive Summary", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));
        sections.push(new Paragraph({ children: [this.createText(this.generateEtlSummary(flowData.executionFlow), { italic: true })], spacing: { after: 300 } }));

        // 3. Variables & Parameters
        if (flowData.variables.length > 0) {
            sections.push(new Paragraph({ children: [this.createText("Variables & Parameters", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));

            const vHeader = new TableRow({
                children: [this.createHeaderCell("Name"), this.createHeaderCell("Value / Setting")]
            });

            const vRows = flowData.variables.map((v: any) => new TableRow({
                children: [
                    this.createCell(v.Name, { bold: true }),
                    this.createCell(v.Value)
                ]
            }));

            sections.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [vHeader, ...vRows] }));
            sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));
        }

        // 4. Process Logic (The Steps)
        sections.push(new Paragraph({ children: [this.createText("Process Details", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));

        const processStep = (item: any) => {
            const indent = item.Depth * 300;

        // Step Header
            sections.push(new Paragraph({
                children: [this.createText(`${item.Phase}: ${item.Step}`, { bold: true, size: 24 })],
                heading: HeadingLevel.HEADING_3,
                indent: { left: indent },
                spacing: { before: 200, after: 100 }
            }));

            // Context
            sections.push(new Paragraph({
                children: [
                    this.createText("Purpose: ", { bold: true }),
                    this.createText(item.Context)
                ],
                indent: { left: indent + 300 },
                spacing: { after: 100 }
            }));

            if (mode === 'business' && item.SmartDesc) {
                sections.push(new Paragraph({
                    children: [this.createText("Summary: " + item.SmartDesc, { italic: true, color: "0055AA" })],
                    indent: { left: indent + 300 },
                    spacing: { after: 100 }
                }));
            }

            // Note
            if (report.stepNotes?.[item.id]) {
                sections.push(new Paragraph({
                    children: [this.createText("Note: " + report.stepNotes[item.id], { italic: true, color: "D97706" })],
                    indent: { left: indent + 300 },
                    spacing: { after: 100 }
                }));
            }

            // Data Dictionary (Output Schema)
            if (item.DataDictionary && item.DataDictionary.length > 0) {
                sections.push(new Paragraph({
                    children: [this.createText("Generated Output Schema", { bold: true, size: 20, color: "666666" })],
                    indent: { left: indent + 300 },
                    spacing: { before: 100, after: 50 }
                }));

                const ddHeader = new TableRow({
                    children: ["Output Column", "Type", "Length", "Description"].map(h =>
                        new TableCell({
                            children: [new Paragraph({ children: [this.createText(h, { bold: true, size: 18 })] })],
                            shading: { fill: "F3F4F6" }
                        }))
                });

                const ddRows = item.DataDictionary.map((d: any) => new TableRow({
                    children: [
                        this.createCell(d.Name || '', { size: 18 }),
                        this.createCell(d.Type || '', { size: 18 }),
                        this.createCell(d.Length || '-', { size: 18 }),
                        this.createCell(d.Description || '', { size: 18 })
                    ]
                }));

                sections.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    indent: { size: indent + 300, type: WidthType.DXA },
                    rows: [ddHeader, ...ddRows]
                }));
                sections.push(new Paragraph({ text: "", spacing: { after: 100 } }));
            }

            // Main Data Table (Transformations/Formulas)
            if (item.TableData && item.TableData.length > 0) {
                const headers = item.Headers || ["Col 1", "Col 2"];

                // Render Logic Table logic
                const createLogicTable = (rules: any[]) => {
                    const header = new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [this.createText("Outcome", { bold: true, size: 16 })] })], shading: { fill: "F1F5F9" }, width: { size: 30, type: WidthType.PERCENTAGE } }),
                            new TableCell({ children: [new Paragraph({ children: [this.createText("When", { bold: true, size: 16 })] })], shading: { fill: "F1F5F9" }, width: { size: 70, type: WidthType.PERCENTAGE } })
                        ]
                    });

                    const rRows = rules.map((r: any) => new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [this.createText(r.outcome, { font: "Courier New", size: 16 })] })] }),
                            new TableCell({ children: [new Paragraph({ children: [this.createText(r.condition, { font: "Courier New", size: 16 })] })] })
                        ]
                    }));

                    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rRows] });
                };

                const tHeader = new TableRow({
                    children: headers.map((h: string) => new TableCell({
                         children: [new Paragraph({ children: [this.createText(h, { bold: true, size: 18 })] })],
                         shading: { fill: "E5E7EB" }
                     }))
                 });

                const tRows = item.TableData.map((row: any) => {
                    const cells = headers.map((_: any, i: number) => {
                         // Check for Rules in Col 2 (index 1) which indicates a Logic Table
                         if (i === 1 && row.Rules) {
                             return new TableCell({ children: [createLogicTable(row.Rules)] });
                         }

                         let val = row[`Col${i + 1}`] || (i === 0 ? row.Name : row.Value) || '';
                         let font = "Segoe UI";
                         if (i === 1 && (headers.includes('Formula') || headers.includes('Expression'))) {
                             font = "Courier New";
                         }

                         return new TableCell({ children: [new Paragraph({ children: [this.createText(val, { font, size: 18 })] })] });
                     });
                     return new TableRow({ children: cells });
                 });

                sections.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    indent: { size: indent + 300, type: WidthType.DXA },
                    rows: [tHeader, ...tRows]
                }));
                sections.push(new Paragraph({ text: "", spacing: { after: 100 } }));
            }

            // Recursion
            if (item.children && item.children.length > 0) {
                item.children.forEach((child: any) => processStep(child));
            }
        };

        flowData.executionFlow.forEach((step: any) => processStep(step));

        await this.generateAndDownload(report.metadata.name + "_ETL", sections);
    }

    // --- Data Model Extraction ---
    static async downloadDataModelDocx(id: number, _mode: 'business' | 'technical' = 'technical') {
        const dm = await db.dataModels.get(id);
        if (!dm) throw new Error('Data Model not found');

        const content = dm.content;
        const metadata = dm.metadata;
        const sections: any[] = [];

        // 1. Header
        sections.push(new Paragraph({
            children: [this.createText(metadata.name, { bold: true, size: 32 })],
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 }
        }));

        const metaRows = [
            ["Description", metadata.description],
            ["Version", metadata.version],
            ["Process Mode", content.DataModel?.DataModelDef?.ProcessMode || 'N/A'],
            ["Last Modified", metadata.dateModified || '-']
        ];

        sections.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: metaRows.map(r => new TableRow({
                children: [this.createHeaderCell(r[0]!), this.createCell(r[1]!)]
            }))
        }));
        sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));

        // 2. Executive Summary
        // Re-implementing logic from DataModelGenerator
        const getList = (obj: any) => Array.isArray(obj) ? obj : (obj ? [obj] : []);
        const rawQueries = getList(content.Queries?.ArrayOfQuery?.Query).sort((a: any, b: any) => (Number(a.Sequence) || 0) - (Number(b.Sequence) || 0));
        const finalQuery = rawQueries.length > 0 ? rawQueries[rawQueries.length - 1] : null;
        const allDS = getList(content.QueryDatasources?.ArrayOfQueryDatasource?.QueryDatasource);
        const uniqueSources = new Set(allDS.filter((d: any) => d.DataSourceType !== 'Query').map((d: any) => d.DataSourceName || d.TableName)).size;
        const finalCols = getList(content.QueryColumns?.ArrayOfQueryColumn?.QueryColumn).filter((c: any) => c.QueryName === finalQuery?.QueryName);

        const summaryText = finalQuery
            ? `This Data Model generates the "${finalQuery.QueryName}" dataset. It aggregates data from ${uniqueSources} external sources across ${rawQueries.length} transformation steps to produce ${finalCols.length} output columns.`
            : "No queries defined.";

        sections.push(new Paragraph({ children: [this.createText("Executive Summary", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));
        sections.push(new Paragraph({ children: [this.createText(summaryText, { italic: true })], spacing: { after: 300 } }));

        // 3. Global Variables (with Source removed per request)
        const variables = getList(content.Variables?.ArrayOfVariableDef?.VariableDef);
        if (variables.length > 0) {
            sections.push(new Paragraph({ children: [this.createText("Global Variables", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));

            const vHeader = new TableRow({
                children: [this.createHeaderCell("Name"), this.createHeaderCell("Value"), this.createHeaderCell("Type"), this.createHeaderCell("Description")]
            });

            // Resolve Types
            const resolveType = (t: string) => {
                const types: Record<string, string> = { 'A': 'String', 'L': 'Boolean', 'N': 'Numeric', 'D': 'Date', 'I': 'Integer', 'F': 'Float' };
                return types[t] || t || 'String';
            };

            const vRows = variables.map((v: any) => new TableRow({
                children: [
                    this.createCell(v.Name, { bold: true }),
                    this.createCell(v.DefaultValue),
                    this.createCell(resolveType(v.DataType || v.VariableType)),
                    this.createCell(v.Description)
                ]
            }));

            sections.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [vHeader, ...vRows] }));
            sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));
        }

        // 4. Indexes
        const indexes = getList(content.DataModel?.Definition?.DataModelDefinition?.Indexes?.Index);
        if (indexes.length > 0) {
            sections.push(new Paragraph({ children: [this.createText("Indexes", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));
            const iHeader = new TableRow({ children: [this.createHeaderCell("Index Name"), this.createHeaderCell("Columns")] });
            const iRows = indexes.map((i: any) => new TableRow({
                children: [
                    this.createCell(i.Name, { bold: true }),
                    this.createCell(getList(i.Columns?.Column).map((c: any) => c.Name).join(', '))
                ]
            }));
            sections.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [iHeader, ...iRows] }));
            sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));
        }

        // 5. Query Logic
        sections.push(new Paragraph({ children: [this.createText("Transformation Layers", { bold: true, size: 28 })], heading: HeadingLevel.HEADING_2, spacing: { after: 150 } }));

        // Map indexes for filter lookup
        const indexMap = new Map(indexes.map((i: any) => [i.Name, i]));

        rawQueries.forEach((q: any) => {
            const qName = q.QueryName;

            // Title
            sections.push(new Paragraph({
                children: [this.createText(qName, { bold: true, size: 24 })],
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 100 },
                border: { bottom: { color: "CCCCCC", space: 1, style: BorderStyle.SINGLE, size: 6 } }
            }));

            // Step Note
            if (dm.stepNotes?.[q.Id]) {
                sections.push(new Paragraph({
                     children: [this.createText("Note: " + dm.stepNotes[q.Id], { italic: true, color: "D97706" })],
                     spacing: { after: 100 }
                }));
            }

            // Filters
            if (q.Criteria?.CriteriaSetItem) {
                const filters: any[] = [];
                const processCriteria = (crit: any) => {
                    const values = getList(crit.CriteriaValues?.CriteriaValue);
                    values.forEach((v: any) => {
                        if (v.ColumnId && v.Operator?.Value) {
                            let op = v.Operator.Value.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
                            let val = v.Value1 || '';
                            if (v.Operator.Value === 'Between') val = `${v.Value1 || '?'} and ${v.Value2 || '?'}`;

                            const index = indexMap.get(v.ColumnId);
                            filters.push({ col: v.ColumnId, op, val, isIndex: !!index, indexCols: index?.Columns ? getList(index.Columns.Column).map((c: any) => c.Name).join(', ') : '' });
                        }
                    });
                    if (crit.NestedSets?.CriteriaSetItem) getList(crit.NestedSets.CriteriaSetItem).forEach(processCriteria);
                };
                processCriteria(q.Criteria.CriteriaSetItem); // Process parent set

                if (filters.length > 0) {
                    sections.push(new Paragraph({ children: [this.createText("Filters", { bold: true, size: 20 })], spacing: { after: 50 } }));
                    const fHeader = new TableRow({ children: [this.createHeaderCell("Column"), this.createHeaderCell("Operator"), this.createHeaderCell("Value")] });
                    const fRows = filters.map(f => {
                        const colText = f.isIndex ? `${f.col} (Index on: ${f.indexCols})` : f.col;
                        return new TableRow({
                            children: [
                                this.createCell(colText, { bold: f.isIndex }),
                                this.createCell(f.op),
                                this.createCell(f.val, { size: 18 })
                            ]
                        });
                     });
                    sections.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [fHeader, ...fRows] }));
                    sections.push(new Paragraph({ text: "", spacing: { after: 150 } }));
                }
            }

            // Columns (Name | Type | Source) - 3 Column Layout
            const myCols = getList(content.QueryColumns?.ArrayOfQueryColumn?.QueryColumn).filter((c: any) => c.QueryName === qName);
            if (myCols.length > 0) {
                sections.push(new Paragraph({ children: [this.createText("Columns", { bold: true, size: 20 })], spacing: { after: 50 } }));

                const cHeader = new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [this.createText("Name / Description", { bold: true, size: 18 })] })], shading: { fill: "E0E0E0" }, width: { size: 30, type: WidthType.PERCENTAGE } }),
                        new TableCell({ children: [new Paragraph({ children: [this.createText("Type / Format", { bold: true, size: 18 })] })], shading: { fill: "E0E0E0" }, width: { size: 20, type: WidthType.PERCENTAGE } }),
                        new TableCell({ children: [new Paragraph({ children: [this.createText("Source", { bold: true, size: 18 })] })], shading: { fill: "E0E0E0" }, width: { size: 50, type: WidthType.PERCENTAGE } })
                    ]
                });

                const cRows = myCols.map((c: any) => {
                    // Logic for Name/Desc stacking
                    const namePara = new Paragraph({ children: [this.createText(c.ColumnName, { bold: true })] });
                    const descPara = c.Description ? new Paragraph({ children: [this.createText(c.Description, { italic: true, size: 18, color: "666666" })] }) : null;

                    // Logic for Type/Format stacking
                    const typePara = new Paragraph({ children: [this.createText(c.JavaType || c.DataType || 'String')] });
                    const fmtPara = (c.Format && c.Format !== '-') ? new Paragraph({ children: [this.createText(c.Format, { italic: true, size: 18, color: "666666" })] }) : null;

                    // Source/Table formatting
                    let source = c.DataSourceName || '';
                    if (c.Expression) source = c.Expression;
                    else if (c.DataSourceName && c.FieldId) source = `${c.DataSourceName}.${c.FieldId}`;

                    return new TableRow({
                        children: [
                            this.createCell(descPara ? [namePara, descPara] : [namePara]),
                            this.createCell(fmtPara ? [typePara, fmtPara] : [typePara]),
                            this.createCell(source, { font: "Courier New", size: 18 })
                        ]
                    });
                });

                sections.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [cHeader, ...cRows] }));
            }
            sections.push(new Paragraph({ text: "", spacing: { after: 300 } }));
        });

        await this.generateAndDownload(metadata.name + "_DataModel", sections);
    }

    private static async generateAndDownload(filename: string, sections: any[]) {
        const doc = new Document({
            sections: [{
                headers: { default: new Header({ children: [new Paragraph({ children: [this.createText("Generated Specification", { size: 16, color: "888888" })], alignment: AlignmentType.RIGHT })] }) },
                footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], font: "Segoe UI", size: 18 })], alignment: AlignmentType.CENTER })] }) },
                children: sections
            }]
        });

        const blob = await Packer.toBlob(doc);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        document.body.appendChild(a);
        a.href = url;
        a.download = `${filename}.docx`;
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}
