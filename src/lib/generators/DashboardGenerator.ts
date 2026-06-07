import { db } from '../db';
import { asNode, type XmlNode, type XmlValue } from '../parsers/types';

export class DashboardGenerator {
    static async generateHtmlView(id: number): Promise<string> {
        const dashboard = await db.dashboards.get(id);
        if (!dashboard) throw new Error('Dashboard not found');

        const content = dashboard.content;
        const metadata = dashboard.metadata;

        // --- Helpers ---
        const getList = (obj: XmlValue): XmlNode[] => {
            if (obj == null) return [];
            return (Array.isArray(obj) ? obj : [obj]) as XmlNode[];
        };

        const getText = (val: XmlValue): string => {
            if (val == null) return '';
            if (typeof val === 'object') {
                const node = asNode(val);
                return node && typeof node['#text'] === 'string' ? node['#text'] : '';
            }
            return String(val);
        };

        const formatDate = (dateStr: string) => {
            if (!dateStr) return 'N/A';
            try {
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return dateStr;
                const day = d.getDate();
                const month = d.toLocaleString('en-US', { month: 'short' });
                const year = d.getFullYear();
                const currentYear = new Date().getFullYear();
                return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
            } catch {
                return dateStr;
            }
        };

        const escapeHtml = (str: XmlValue): string => {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const renderTable = (headers: string[], rows: Record<string, string>[]) => {
            if (!rows || rows.length === 0) return '';
            const ths = headers
                .map(
                    (h) =>
                        `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`
                )
                .join('');
            const trs = rows
                .map((r) => {
                    const cells = headers
                        .map((_, i) => {
                            const val = r[`Col${i + 1}`] || '';
                            return `<td class="px-4 py-2 text-sm text-gray-700">${val}</td>`;
                        })
                        .join('');
                    return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
                })
                .join('');
            return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
        };

        // --- Extract Data ---
        const dashDef = asNode(asNode(content.Dashboard)?.EntityDef) || {};
        const dashLayout = asNode(asNode(dashDef.Definition)?.Dashboard) || {};
        const layoutItems = getList(asNode(dashLayout.Layout)?.LayoutItem);
        const visualizations = getList(asNode(content.Visualisations?.ArrayOfEntityDef)?.EntityDef);
        const variables = getList(asNode(content.Variables?.ArrayOfVariableDef)?.VariableDef);

        const widgetMap = new Map(visualizations.map((v) => [getText(v.GenericEntityId), v]));
        const displayDate = formatDate(metadata.dateModified || dashboard.dateAdded.toISOString());

        // --- Metadata Grid ---
        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Owner</span>
                    <span class="font-medium text-gray-800">${metadata.owner || dashDef.Owner || '-'}</span>
                </div>
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Folder</span>
                    <span class="font-medium text-gray-800 text-xs truncate" title="${metadata.parentPath || getText(dashDef.ParentFileItemPath) || ''}">${(metadata.parentPath || getText(dashDef.ParentFileItemPath) || '-').split('/').pop()}</span>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">System ID</span>
                    <span class="font-mono text-gray-600 text-xs">${(getText(dashDef.GenericEntityId) || '-').substring(0, 12)}...</span>
                </div>
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Reporting System</span>
                    <span class="font-medium text-gray-800">${dashDef.ReportingSystem || '-'}</span>
                </div>
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Published Date</span>
                    <span class="font-medium text-gray-800">${displayDate}</span>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Dashboard ID</span>
                    <span class="font-mono text-gray-500 text-[11px] truncate inline-block" title="${getText(dashDef.GenericEntityId)}">${(getText(dashDef.GenericEntityId) || 'N/A').substring(0, 12)}</span>
                </div>
            </div>
        `;

        // --- Executive Summary ---
        const widgetTypes = new Map<string, number>();
        visualizations.forEach((v) => {
            const type = getText(v.EntitySubType) || 'UNKNOWN';
            widgetTypes.set(type, (widgetTypes.get(type) || 0) + 1);
        });

        const typeBreakdown = Array.from(widgetTypes.entries())
            .map(([type, count]) => `${type}: ${count}`)
            .join(' • ');

        const summaryHtml = `
            <div class="p-6 bg-slate-50 border-l-4 border-emerald-400 rounded-r-xl shadow-sm">
                <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span class="text-lg">📋</span> Executive Summary
                </h3>
                <p class="text-slate-700 text-lg leading-relaxed">
                    This dashboard contains <strong>${visualizations.length} widgets</strong> (${typeBreakdown}) across <strong>${new Set(visualizations.map((v) => getText(v.AttributeString1))).size} data models</strong> to provide business intelligence and reporting capabilities.
                </p>
            </div>
        `;

        // --- Layout Diagram (Simple Grid Table) ---
        const buildLayoutGrid = () => {
            if (layoutItems.length === 0) {
                return '';
            }

            // Build widget grid - map by position
            let maxRow = 0;
            const widgetsByPos = new Map<string, { name: string; type: string; width: number }>();

            layoutItems.forEach((item) => {
                const widget = widgetMap.get(getText(item.Id));
                const x = Number(item.X) || 0;
                // Guard the 12-column grid: x >= 12 would make width <= 0, and a
                // zero/negative colspan never advances `col` in the render loop
                // below -> infinite loop. Skip out-of-range items, clamp width >= 1.
                if (x >= 12) return;
                const row = Math.floor((Number(item.Y) || 0) / 100);
                const width = Math.max(1, Math.min(Number(item.Width) || 1, 12 - x));

                maxRow = Math.max(maxRow, row);
                widgetsByPos.set(`${row},${x}`, {
                    name: getText(widget?.Description) || 'Widget',
                    type: getText(widget?.EntitySubType) || 'UNKNOWN',
                    width: width,
                });
            });

            let html = '<div style="overflow-x: auto; margin: 12px 0; border: 1px solid #000;">';
            html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';

            // Add column headers
            html += '<thead><tr>';
            for (let col = 0; col < 12; col++) {
                html += `<th style="border: 1px solid #000; padding: 1px; text-align: center; font-weight: 400; background: #f0f0f0; width: 8.33%; height: 14px; font-size: 7px; line-height: 1;">${col + 1}</th>`;
            }
            html += '</tr></thead>';

            html += '<tbody>';
            for (let row = 0; row <= maxRow; row++) {
                html += '<tr>';
                for (let col = 0; col < 12; ) {
                    const key = `${row},${col}`;
                    const cell = widgetsByPos.get(key);
                    if (cell) {
                        // Widget cell with colspan
                        const label = `${cell.type}: ${cell.name}`.substring(0, 35);
                        const height = Math.max(40, cell.width * 10);
                        html += `<td colspan="${cell.width}" style="border: 1px solid #000; padding: 4px; text-align: center; font-weight: 500; height: ${height}px; font-size: 10px; word-break: break-word;">${escapeHtml(label)}</td>`;
                        col += cell.width;
                    } else {
                        // Empty cell
                        html +=
                            '<td style="border: 1px solid #000; padding: 4px; background: #fafafa; height: 40px;"></td>';
                        col += 1;
                    }
                }
                html += '</tr>';
            }

            html += '</tbody></table></div>';
            return html;
        };

        // --- Dashboard-level Parameters Section ---
        let dashboardParamsHtml = '';
        const dashParams = asNode(dashLayout.Parameters)?.ParameterField;
        const dashParamsList = getList(dashParams);
        if (dashParamsList.length > 0) {
            const paramRows = dashParamsList.map((p) => ({
                Col1: escapeHtml(p.FieldName || 'N/A'),
                Col2: `<code class="bg-gray-100 px-2 py-1 rounded text-xs font-mono">${escapeHtml(p.Value || 'N/A')}</code>`,
                Col3: escapeHtml(p.Description || '-'),
            }));
            dashboardParamsHtml = `
                <details class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-indigo-50 hover:bg-indigo-100 transition-colors select-none border-t border-b border-indigo-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-indigo-600 text-lg">⚙️</span> Dashboard Parameters
                            <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">${dashParamsList.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">Dashboard-level parameters that affect all widgets:</p>
                        ${renderTable(['Field Name', 'Value', 'Description'], paramRows)}
                    </div>
                </details>
            `;
        }

        // --- Widget Summary Table ---
        let widgetSummaryHtml = '';
        if (visualizations.length > 0) {
            const widgetRows = visualizations.map((v, idx: number) => {
                const criteriaCount = this.countCriteria(v.AttributeText1);
                const paramCount = this.countParams(v.AttributeText2);
                return {
                    Col1: `${idx + 1}`,
                    Col2: getText(v.Description) || 'Unnamed',
                    Col3: getText(v.EntitySubType) || 'UNKNOWN',
                    Col4: getText(v.DatamodelDescription) || '-',
                    Col5:
                        criteriaCount > 0
                            ? `<span class="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">${criteriaCount}</span>`
                            : '-',
                    Col6:
                        paramCount > 0
                            ? `<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">${paramCount}</span>`
                            : '-',
                };
            });

            widgetSummaryHtml = `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-purple-50 hover:bg-purple-100 transition-colors select-none border-t border-b border-purple-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-purple-500 text-lg">🎛️</span> Widgets Summary
                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">${visualizations.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        ${renderTable(['#', 'Widget Name', 'Type', 'Data Model', 'Criteria', 'Parameters'], widgetRows)}
                    </div>
                </details>
            `;
        }

        // --- Detailed Widgets Section ---
        let detailedWidgetsHtml = '';
        if (visualizations.length > 0) {
            detailedWidgetsHtml =
                '<details class="group mb-6"><summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-purple-50 hover:bg-purple-100 transition-colors select-none border-t border-b border-purple-200"><span class="text-xl font-bold text-slate-800 flex items-center gap-3"><span class="text-purple-500 text-lg">📋</span> Widget Details</span></summary><div class="pt-4 pb-2 px-2 space-y-4">';

            visualizations.forEach((widget) => {
                const criteria = asNode(
                    asNode(asNode(widget.AttributeText1)?.CriteriaSetItem)?.CriteriaValues
                )?.CriteriaValue;
                const criteriaList = getList(criteria);
                const params = asNode(asNode(widget.AttributeText2)?.Parameters)?.ParameterField;
                const paramsList = getList(params);
                const tableDef = asNode(asNode(widget.Definition)?.Table);
                const columns = tableDef?.Columns ? getList(tableDef.Columns) : [];
                let filterHtml = '';
                let paramHtml = '';
                let columnHtml = '';

                if (criteriaList.length > 0) {
                    const filterRows = criteriaList.map((c) => ({
                        Col1: escapeHtml(c.ColumnId || 'N/A'),
                        Col2: escapeHtml(asNode(c.Operator)?.Value || '='),
                        Col3: `<code class="bg-gray-100 px-2 py-1 rounded text-xs font-mono">${escapeHtml(c.Value1 || 'N/A')}</code>`,
                        Col4: escapeHtml(c.Link || 'AND'),
                    }));
                    filterHtml = `
                        <div class="mt-3">
                            <h4 class="font-semibold text-gray-700 mb-2">🔍 Criteria (${criteriaList.length})</h4>
                            ${renderTable(['Column', 'Operator', 'Value', 'Link'], filterRows)}
                        </div>
                    `;
                }

                if (paramsList.length > 0) {
                    const paramRows = paramsList.map((p) => ({
                        Col1: escapeHtml(p.FieldName || 'N/A'),
                        Col2: `<code class="bg-gray-100 px-2 py-1 rounded text-xs font-mono">${escapeHtml(p.Value || 'N/A')}</code>`,
                    }));
                    paramHtml = `
                        <div class="mt-3">
                            <h4 class="font-semibold text-gray-700 mb-2">⚙️ Parameters (${paramsList.length})</h4>
                            ${renderTable(['Field Name', 'Value'], paramRows)}
                        </div>
                    `;
                }

                if (columns.length > 0) {
                    const columnRows = columns.map((col) => {
                        let formula = '';
                        let isCalculation = false;
                        if (col.Expression) {
                            formula = escapeHtml(col.Expression);
                            isCalculation = true;
                        } else if (col.Source) {
                            formula = escapeHtml(col.Source);
                            isCalculation = true;
                        }

                        // Format/Type display with badge styling
                        // String() guard: XML parsing can yield a non-string
                        // (e.g. {} from an empty tag); .includes() below would throw.
                        const formatType = String(col.Format || col.DataType || 'N/A');
                        const formatBadge =
                            formatType === 'N/A'
                                ? formatType
                                : formatType.includes('Currency')
                                  ? `<span class="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono">${formatType}</span>`
                                  : formatType.includes('Percent')
                                    ? `<span class="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono">${formatType}</span>`
                                    : formatType.includes('Date')
                                      ? `<span class="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs font-mono">${formatType}</span>`
                                      : formatType.includes('Number')
                                        ? `<span class="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-mono">${formatType}</span>`
                                        : `<span class="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs font-mono">${formatType}</span>`;

                        return {
                            Col1: escapeHtml(col.Id || col.Name || 'N/A'),
                            Col2: formatBadge,
                            Col3: escapeHtml(col.DisplayName || col.Label || '-'),
                            Col4:
                                col.Visible !== false
                                    ? '<span class="text-green-600 font-bold">✓</span>'
                                    : '<span class="text-red-600 font-bold">✗</span>',
                            Col5: formula
                                ? `<code class="bg-slate-100 text-slate-800 px-2 py-1 rounded text-xs font-mono block break-words max-w-sm">${formula}</code>`
                                : isCalculation
                                  ? '<em class="text-gray-500">no formula</em>'
                                  : '<em class="text-gray-500">source field</em>',
                            Col6: isCalculation
                                ? '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">CALCULATED</span>'
                                : '<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-bold">SOURCE</span>',
                        };
                    });
                    columnHtml = `
                        <div class="mt-3">
                            <h4 class="font-semibold text-gray-700 mb-2">📊 Columns (${columns.length})</h4>
                            ${renderTable(['Column ID', 'Format/Type', 'Display Name', 'Visible', 'Formula/Source', 'Type'], columnRows)}
                        </div>
                    `;
                }

                detailedWidgetsHtml += `
                    <div class="border border-purple-200 bg-purple-50 rounded-lg p-4">
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <h3 class="text-lg font-bold text-gray-800">${escapeHtml(widget.Description || 'Unnamed Widget')}</h3>
                                <span class="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded bg-purple-100 text-purple-800">${widget.EntitySubType || 'UNKNOWN'}</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-4 bg-white p-3 rounded border border-purple-100">
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Owner</div>
                                <div class="text-gray-700">${escapeHtml(widget.Owner || 'N/A')}</div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Data Model Name</div>
                                <div class="text-gray-700">${escapeHtml(widget.DatamodelDescription || 'N/A')}</div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Widget ID</div>
                                <div class="font-mono text-xs text-gray-700 break-all">${escapeHtml((getText(widget.GenericEntityId) || 'N/A').substring(0, 16))}...</div>
                            </div>
                        </div>
                        ${filterHtml}
                        ${paramHtml}
                        ${columnHtml}
                    </div>
                `;
            });

            detailedWidgetsHtml += '</div></details>';
        }

        // --- Variables Section ---
        let variablesHtml = '';
        if (variables.length > 0) {
            const typeMap: Record<string, string> = {
                A: 'String',
                L: 'Boolean',
                N: 'Numeric',
                D: 'Date',
                I: 'Integer',
                F: 'Float',
            };

            const varRows = variables.map((v) => ({
                Col1: getText(v.Name) || '-',
                Col2: typeMap[getText(v.VariableType)] || getText(v.VariableType) || '-',
                Col3: getText(v.DefaultValue) || '-',
                Col4: getText(v.SelectionTypeListType || v.ListType) || '-',
                Col5: getText(v.Description) || '-',
            }));

            variablesHtml = `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-green-50 hover:bg-green-100 transition-colors select-none border-t border-b border-green-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-green-600 text-lg">#️⃣</span> Variables
                            <span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">${variables.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">Dashboard-level variables and their definitions:</p>
                        ${renderTable(['Name', 'Type', 'Default Value', 'List Source', 'Description'], varRows)}
                    </div>
                </details>
            `;
        }

        // --- Data Model Dependencies ---
        const dmIds = new Set(visualizations.map((v) => getText(v.AttributeString1)).filter(Boolean));
        let dependenciesHtml = '';
        if (dmIds.size > 0) {
            const dmRows = Array.from(dmIds).map((id) => {
                const dmName =
                    getText(visualizations.find((v) => getText(v.AttributeString1) === id)?.DatamodelDescription) ||
                    'Unknown';
                const widgetCount = visualizations.filter((v) => getText(v.AttributeString1) === id).length;
                return {
                    Col1: dmName,
                    Col2: `${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`,
                };
            });

            dependenciesHtml = `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-cyan-50 hover:bg-cyan-100 transition-colors select-none border-t border-b border-cyan-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-cyan-600 text-lg">🔗</span> Data Model Dependencies
                            <span class="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full border border-cyan-200">${dmIds.size}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">Data models referenced by widgets in this dashboard:</p>
                        ${renderTable(['Data Model Name', 'Widget Count'], dmRows)}
                    </div>
                </details>
            `;
        }

        // --- Final Output ---
        return `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${escapeHtml(metadata.name || dashDef.Description || 'Dashboard')}</h2>
                    </div>
                    <span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-emerald-200">Dashboard</span>
                </div>
                ${metaGrid}
            </div>
            <div class="doc-body space-y-8">
                ${summaryHtml}

                <!-- Layout Diagram -->
                <div>
                    <h3 class="text-lg font-bold text-slate-800 mb-4">📐 Layout</h3>
                    ${buildLayoutGrid()}
                </div>

                ${dashboardParamsHtml}
                ${widgetSummaryHtml}
                ${detailedWidgetsHtml}
                ${variablesHtml}
                ${dependenciesHtml}
            </div>
        `;
    }

    private static countCriteria(criteriaText: XmlValue): number {
        const criteria = asNode(asNode(criteriaText)?.CriteriaSetItem);
        if (!criteria) return 0;
        const values = asNode(criteria.CriteriaValues)?.CriteriaValue;
        if (!values) return 0;
        return Array.isArray(values) ? values.length : 1;
    }

    private static countParams(paramsText: XmlValue): number {
        const params = asNode(asNode(paramsText)?.Parameters)?.ParameterField;
        if (!params) return 0;
        return Array.isArray(params) ? params.length : 1;
    }
}
