import { db } from '../db';

export class DashboardGenerator {
    static async generateHtmlView(id: number, _mode: 'business' | 'technical' = 'business'): Promise<string> {
        const dashboard = await db.dashboards.get(id);
        if (!dashboard) throw new Error("Dashboard not found");

        const content = dashboard.content;
        const metadata = dashboard.metadata;

        // --- Helpers ---
        const getList = (obj: any): any[] => {
            if (!obj) return [];
            return Array.isArray(obj) ? obj : [obj];
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

        const escapeHtml = (str: string): string => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const renderTable = (headers: string[], rows: any[]) => {
            if (!rows || rows.length === 0) return '';
            const ths = headers.map(h => `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`).join('');
            const trs = rows.map((r) => {
                const cells = headers.map((_, i) => {
                    const val = r[`Col${i + 1}`] || '';
                    return `<td class="px-4 py-2 text-sm text-gray-700">${val}</td>`;
                }).join('');
                return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
            }).join('');
            return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
        };

        // --- Extract Data ---
        const dashDef = content.Dashboard?.EntityDef || {};
        const dashLayout = dashDef.Definition?.Dashboard || {};
        const layoutItems = getList(dashLayout.Layout?.LayoutItem || []);
        const visualizations = getList(content.Visualisations?.ArrayOfEntityDef?.EntityDef || []);
        const variables = getList(content.Variables?.ArrayOfVariableDef?.VariableDef || []);

        const widgetMap = new Map(visualizations.map((v: any) => [v.GenericEntityId, v]));
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
                    <span class="font-medium text-gray-800 text-xs truncate" title="${metadata.parentPath || dashDef.ParentFileItemPath || ''}">${(metadata.parentPath || dashDef.ParentFileItemPath || '-').split('/').pop()}</span>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">System ID</span>
                    <span class="font-mono text-gray-600 text-xs">${(dashDef.GenericEntityId || '-').substring(0, 12)}...</span>
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
                    <span class="font-mono text-gray-500 text-[11px] truncate inline-block" title="${dashDef.GenericEntityId}">${(dashDef.GenericEntityId || 'N/A').substring(0, 12)}</span>
                </div>
            </div>
        `;

        // --- Executive Summary ---
        const widgetTypes = new Map<string, number>();
        visualizations.forEach((v: any) => {
            const type = v.EntitySubType || 'UNKNOWN';
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
                    This dashboard contains <strong>${visualizations.length} widgets</strong> (${typeBreakdown}) across <strong>${new Set(visualizations.map((v: any) => v.AttributeString1)).size} data models</strong> to provide business intelligence and reporting capabilities.
                </p>
            </div>
        `;

        // --- Layout Diagram ---
        const buildLayoutDiagram = () => {
            if (layoutItems.length === 0) {
                return '<p class="text-gray-500 italic">No layout items defined</p>';
            }

            let maxX = 0, maxY = 0;
            layoutItems.forEach((item: any) => {
                maxX = Math.max(maxX, (item.X || 0) + (item.Width || 1));
                maxY = Math.max(maxY, (item.Y || 0) + (item.Height || 1));
            });

            const normalizeRow = (y: number) => Math.floor((y || 0) / 100);
            const maxRow = normalizeRow(maxY);

            const grid: (string | null)[][] = Array(maxRow + 1)
                .fill(null)
                .map(() => Array(12).fill(null));

            layoutItems.forEach((item: any) => {
                const widget = widgetMap.get(item.Id);
                const x = item.X || 0;
                const row = normalizeRow(item.Y || 0);
                const width = Math.min(item.Width || 1, 12 - x);

                if (row <= maxRow && width > 0) {
                    const label = `${widget?.Description || 'Widget'}`.substring(0, 18);
                    for (let col = x; col < Math.min(x + width, 12); col++) {
                        grid[row][col] = label;
                    }
                }
            });

            let diagram = '<pre class="bg-slate-50 border border-slate-300 rounded p-3 overflow-x-auto text-xs font-mono text-slate-700 mb-4">';
            diagram += '╔' + Array(12).fill('═════════╦').slice(0, -1).join('') + '═════════╗\n';

            for (let row = 0; row <= maxRow; row++) {
                diagram += '║';
                for (let col = 0; col < 12; col++) {
                    const cell = grid[row][col] || '';
                    diagram += ` ${cell.padEnd(7)} ║`;
                }
                diagram += '\n';
                if (row < maxRow) {
                    diagram += '╠' + Array(12).fill('═════════╬').slice(0, -1).join('') + '═════════╣\n';
                }
            }

            diagram += '╚' + Array(12).fill('═════════╩').slice(0, -1).join('') + '═════════╝';
            diagram += '</pre>';

            return diagram;
        };

        // --- Widget Details Section ---
        let widgetDetailsHtml = '';
        if (visualizations.length > 0) {
            const widgetRows = visualizations.map((v: any) => {
                const filterCount = this.countFilters(v.AttributeText1);
                const paramCount = this.countParams(v.AttributeText2);
                return {
                    Col1: v.Description || 'Unnamed',
                    Col2: v.EntitySubType || 'UNKNOWN',
                    Col3: (v.AttributeString1 || '-').substring(0, 12) + '...',
                    Col4: v.DatamodelDescription || '-',
                    Col5: filterCount > 0 ? filterCount.toString() : '-',
                    Col6: paramCount > 0 ? paramCount.toString() : '-'
                };
            });

            widgetDetailsHtml = `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-purple-50 hover:bg-purple-100 transition-colors select-none border-t border-b border-purple-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-purple-500 text-lg">🎛️</span> Widget Details
                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">${visualizations.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        ${renderTable(['Widget Name', 'Type', 'Data Model ID', 'Data Model Name', 'Filters', 'Parameters'], widgetRows)}
                    </div>
                </details>
            `;
        }

        // --- Variables Section ---
        let variablesHtml = '';
        if (variables.length > 0) {
            const typeMap: Record<string, string> = {
                'A': 'String',
                'L': 'Boolean',
                'N': 'Numeric',
                'D': 'Date',
                'I': 'Integer',
                'F': 'Float'
            };

            const varRows = variables.map((v: any) => ({
                Col1: v.Name || '-',
                Col2: typeMap[v.VariableType || ''] || v.VariableType || '-',
                Col3: v.DefaultValue || '-',
                Col4: v.SelectionTypeListType || v.ListType || '-',
                Col5: v.Description || '-'
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
        const dmIds = new Set(visualizations.map((v: any) => v.AttributeString1).filter(Boolean));
        let dependenciesHtml = '';
        if (dmIds.size > 0) {
            const dmRows = Array.from(dmIds).map((id: any) => {
                const dmName = visualizations.find((v: any) => v.AttributeString1 === id)?.DatamodelDescription || 'Unknown';
                const widgetCount = visualizations.filter((v: any) => v.AttributeString1 === id).length;
                return {
                    Col1: dmName,
                    Col2: id.substring(0, 12) + '...',
                    Col3: `${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`
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
                        ${renderTable(['Data Model Name', 'ID', 'Widget Count'], dmRows)}
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
                    <h3 class="text-lg font-bold text-slate-800 mb-4">📐 Layout Diagram (12-column grid)</h3>
                    ${buildLayoutDiagram()}
                </div>

                ${widgetDetailsHtml}
                ${variablesHtml}
                ${dependenciesHtml}
            </div>
        `;
    }

    private static countFilters(criteriaText: any): number {
        if (!criteriaText) return 0;
        const criteria = criteriaText.CriteriaSetItem;
        if (!criteria) return 0;
        const values = criteria.CriteriaValues?.CriteriaValue;
        if (!values) return 0;
        return Array.isArray(values) ? values.length : 1;
    }

    private static countParams(paramsText: any): number {
        if (!paramsText) return 0;
        const params = paramsText.Parameters?.ParameterField;
        if (!params) return 0;
        return Array.isArray(params) ? params.length : 1;
    }
}
