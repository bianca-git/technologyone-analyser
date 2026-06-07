import { db } from '../db';
import { ExpressionFormatter } from '../formatters/ExpressionFormatter';
import type { XlReportParsed, XlColumnDefn } from '../parsers/types';

const esc = (v: unknown): string => ExpressionFormatter.escapeHtml(String(v ?? ''));

/** Minimal shape of a Data Model record used for cross-module lineage links. */
type DmRef = { id?: number; metadata: { name: string } };

export class XlOneGenerator {
    static async generateHtmlView(id: number): Promise<string> {
        const record = await db.xlReports.get(id);
        if (!record) throw new Error('XlOne Report not found');

        const c: XlReportParsed = record.content;
        const h = c.header;
        const meta = record.metadata;

        // Cross-module lineage: map datasource GUID -> stored Data Model.
        const dataModels = await db.dataModels.toArray();
        const dmByGuid = new Map<string | undefined, DmRef>(dataModels.map((dm) => [dm.metadata.id, dm]));

        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                ${this.metaCell('Owner', meta.owner || h.userId || '-')}
                ${this.metaCell('Folder', (meta.parentPath || h.parentPath || '-').split('/').pop() || '-')}
                ${this.metaCell('Type', h.type || '-')}
                ${this.metaCell('Reporting System', h.reportingSystem || '-')}
                ${this.metaCell('Report ID', (h.reportId || 'N/A').substring(0, 12))}
                ${this.metaCell('Data Source', this.dmLink(h.datasource, dmByGuid), true)}
            </div>
        `;

        const settingsHtml = this.renderSettings(c.sheet.settings);
        const variablesHtml = this.renderVariables(c.sheet.variables);
        const columnsHtml = this.renderColumns(c.sheet.columns, dmByGuid);
        const rowCommandsHtml = this.renderRowCommands(c.sheet.rowCommands);

        return `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${esc(meta.name || h.title || 'XlOne Report')}</h2>
                    <span class="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-amber-200">XlOne Report</span>
                </div>
                ${metaGrid}
            </div>
            <div class="doc-body space-y-8">
                ${settingsHtml}
                ${columnsHtml}
                ${variablesHtml}
                ${rowCommandsHtml}
            </div>
        `;
    }

    /**
     * Render a label/value cell. `value` is escaped by default; pass `isHtml=true`
     * ONLY for values that are already-safe generated HTML (e.g. a dmLink anchor).
     * Never infer "safe HTML" from the value's content — file-derived fields can
     * start with '<' and would bypass escaping (XSS).
     */
    private static metaCell(label: string, value: string, isHtml = false): string {
        return `
            <div>
                <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">${esc(label)}</span>
                <span class="font-medium text-gray-800">${isHtml ? value : esc(value)}</span>
            </div>`;
    }

    /** Render the datasource GUID as a link if a matching Data Model is stored. */
    private static dmLink(guid: string, dmByGuid: Map<string | undefined, DmRef>): string {
        if (guid == null || guid === '') return esc('-');
        const dm = dmByGuid.get(guid);
        if (dm && dm.id != null) {
            return `<a class="text-blue-600 hover:underline cursor-pointer" onclick="window.navigateTo('detail', ${dm.id}, 'datamodel')">${esc(dm.metadata.name)}</a>`;
        }
        return `<span class="font-mono text-xs text-gray-600">${esc(guid.substring(0, 12))}</span>`;
    }

    /**
     * Label a column's data source: always show the parsed name; if the GUID
     * matches a stored Data Model, make the name a clickable lineage link.
     */
    private static dataSourceLabel(
        ds: NonNullable<XlColumnDefn['dataSource']>,
        dmByGuid: Map<string | undefined, DmRef>
    ): string {
        const dm = ds.guid ? dmByGuid.get(ds.guid) : undefined;
        if (dm && dm.id != null) {
            return `<a class="text-blue-600 hover:underline cursor-pointer" onclick="window.navigateTo('detail', ${dm.id}, 'datamodel')">${esc(dm.metadata.name || ds.name)}</a>`;
        }
        const name = ds.name || ds.guid || '-';
        return esc(name);
    }

    private static section(title: string, icon: string, badge: number | string, body: string, open = true): string {
        return `
            <details ${open ? 'open' : ''} class="group">
                <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-50 hover:bg-slate-100 transition-colors select-none border-t border-b border-slate-200">
                    <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                        <span class="text-lg">${icon}</span> ${esc(title)}
                        <span class="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">${esc(badge)}</span>
                    </span>
                </summary>
                <div class="pt-4 pb-2 px-2">${body}</div>
            </details>`;
    }

    private static table(headers: string[], rows: string[][]): string {
        if (rows.length === 0) return '';
        const ths = headers
            .map(
                (header) =>
                    `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${esc(header)}</th>`
            )
            .join('');
        const trs = rows
            .map(
                (r) =>
                    `<tr class="border-t border-gray-100 hover:bg-gray-50">${r
                        .map((cellHtml) => `<td class="px-4 py-2 text-sm text-gray-700">${cellHtml}</td>`)
                        .join('')}</tr>`
            )
            .join('');
        return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
    }

    private static renderSettings(settings: Record<string, string>): string {
        const keys = Object.keys(settings);
        if (keys.length === 0) return '';
        const rows = keys.map((k) => [`<span class="font-semibold">${esc(k)}</span>`, esc(settings[k])]);
        return this.section('Report Settings', '📋', keys.length, this.table(['Setting', 'Value'], rows));
    }

    private static renderVariables(variables: XlReportParsed['sheet']['variables']): string {
        if (variables.length === 0) return '';
        const rows = variables.map((v) => [esc(v.name), esc(v.description), esc(v.type), esc(v.value), esc(v.listValues)]);
        return this.section(
            'Variables',
            '#️⃣',
            variables.length,
            this.table(['Name', 'Description', 'Type', 'Value', 'List Values'], rows)
        );
    }

    private static renderColumns(columns: XlColumnDefn[], dmByGuid: Map<string | undefined, DmRef>): string {
        if (columns.length === 0) return '';
        const blocks = columns
            .map((col) => {
                const ds = col.dataSource
                    ? this.dataSourceLabel(col.dataSource, dmByGuid)
                    : esc('-');
                const paramRows = Object.entries(col.parameters).map(([k, v]) => [esc(k), esc(v)]);
                const criteriaRows = col.criteria.map((cr) => [
                    esc(cr.columnName),
                    esc(cr.action),
                    esc(cr.field),
                    esc(cr.details),
                    esc(cr.display),
                ]);
                return `
                    <div class="border border-slate-200 bg-slate-50 rounded-lg p-4 mb-3">
                        <h3 class="text-lg font-bold text-gray-800">${esc(col.name || 'Column Definition')}</h3>
                        <p class="text-sm text-gray-600 mt-1">Data Source: ${ds}</p>
                        ${paramRows.length ? `<h4 class="font-semibold text-gray-700 mt-3 mb-2">Parameters</h4>${this.table(['Key', 'Value'], paramRows)}` : ''}
                        ${criteriaRows.length ? `<h4 class="font-semibold text-gray-700 mt-3 mb-2">Criteria</h4>${this.table(['Column', 'Action', 'Field', 'Details', 'Display'], criteriaRows)}` : ''}
                    </div>`;
            })
            .join('');
        return this.section('Column Definitions', '📊', columns.length, blocks);
    }

    private static renderRowCommands(rowCommands: XlReportParsed['sheet']['rowCommands']): string {
        if (rowCommands.length === 0) return '';
        const rows = rowCommands.map((rc) => [
            esc(rc.command),
            esc(rc.details),
            esc(rc.selection),
            esc(rc.search),
            esc(rc.valueFrom),
            esc(rc.valueTo),
        ]);
        return this.section(
            'Row Commands',
            '⛓️',
            rowCommands.length,
            this.table(['Command', 'Details', 'Selection', 'Search', 'Value (Fr)', 'Value (To)'], rows)
        );
    }
}
