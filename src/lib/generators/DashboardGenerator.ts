import { db } from '../db';

export class DashboardGenerator {
    static async generateHtmlView(id: number, _viewMode: 'business' | 'technical' = 'business'): Promise<string> {
        const dashboard = await db.dashboards.get(id);
        if (!dashboard) throw new Error("Dashboard not found");

        const content = dashboard.content;
        const metadata = dashboard.metadata;

        // --- Helper: Format Date ---
        const formatDate = (dateStr: string) => {
            if (!dateStr || dateStr === 'N/A') return 'N/A';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const day = d.getDate();
            const month = d.toLocaleString('en-US', { month: 'short' });
            const year = d.getFullYear();
            const currentYear = new Date().getFullYear();
            return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
        };

        const displayDate = formatDate(metadata.dateModified || dashboard.dateAdded.toISOString());

        // --- Helper: Safe List Getter ---
        const getList = (obj: any): any[] => {
            if (!obj) return [];
            return Array.isArray(obj) ? obj : [obj];
        };

        // --- Section 1: Extract Core Data ---
        const dashDef = content.Dashboard?.EntityDef || {};
        const dashLayout = dashDef.Definition?.Dashboard || {};
        const layoutItems = getList(dashLayout.Layout?.LayoutItem || []);

        const visualizations = getList(content.Visualisations?.ArrayOfEntityDef?.EntityDef || []);
        const variables = getList(content.Variables?.ArrayOfVariableDef?.VariableDef || []);

        // --- Section 2: Build Widget Maps ---
        const widgetMap = new Map(visualizations.map((v: any) => [v.GenericEntityId, v]));

        // --- Section 3: Build Layout Diagram ---
        const buildLayoutDiagram = () => {
            if (layoutItems.length === 0) return '<p class="text-gray-500 italic">No widgets defined</p>';

            // Find grid bounds
            let maxX = 0, maxY = 0;
            layoutItems.forEach((item: any) => {
                maxX = Math.max(maxX, (item.X || 0) + (item.Width || 1));
                maxY = Math.max(maxY, (item.Y || 0) + (item.Height || 1));
            });

            // Normalize Y values to discrete rows (every 100 units = 1 visual row)
            const normalizeRow = (y: number) => Math.floor((y || 0) / 100);
            const maxRow = normalizeRow(maxY);

            // Create grid structure (12 columns)
            const grid: (string | null)[][] = Array(maxRow + 1)
                .fill(null)
                .map(() => Array(12).fill(null));

            // Fill grid with widget references
            layoutItems.forEach((item: any) => {
                const widget = widgetMap.get(item.Id);
                const x = item.X || 0;
                const row = normalizeRow(item.Y || 0);
                const width = Math.min(item.Width || 1, 12 - x);

                if (row <= maxRow && width > 0) {
                    const label = `${widget?.Description || 'Widget'} [${widget?.EntitySubType || 'N/A'}]`.substring(0, 20);
                    for (let col = x; col < Math.min(x + width, 12); col++) {
                        grid[row][col] = label;
                    }
                }
            });

            // Render as ASCII table
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

        // --- Section 4: Widget Inventory (Grouped by Type) ---
        const buildWidgetInventory = () => {
            const slicers = visualizations.filter((v: any) => v.EntitySubType === 'SLICER');
            const tables = visualizations.filter((v: any) => v.EntitySubType === 'TABLE');
            const charts = visualizations.filter((v: any) => v.EntitySubType === 'CHART');

            const renderTable = (headers: string[], rows: any[]) => {
                if (!rows || rows.length === 0) return '';
                const ths = headers.map(h => 
                    `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`
                ).join('');
                const trs = rows.map((r) => {
                    const cells = headers.map((_h, i) => {
                        const val = r[`Col${i + 1}`] || '';
                        return `<td class="px-4 py-2 text-sm text-gray-700">${val}</td>`;
                    }).join('');
                    return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
                }).join('');
                return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300 text-left bg-slate-50"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
            };

            let html = '';

            if (slicers.length > 0) {
                html += '<details open class="group mb-6"><summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors"><span class="text-lg font-bold text-slate-800">🎛️ Slicers (' + slicers.length + ')</span><span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span></summary>';
                const slicerRows = slicers.map((v: any) => {
                    const dataModelId = v.AttributeString1 || '-';
                    const filterCount = this.countFilters(v.AttributeText1);
                    return {
                        Col1: v.Description || 'Unnamed',
                        Col2: this.getSlicerField(v.Definition?.Slicer),
                        Col3: dataModelId === '-' ? '-' : dataModelId.substring(0, 8) + '...',
                        Col4: filterCount > 0 ? filterCount.toString() : '-'
                    };
                });
                html += '<div class="pt-4 pb-2 px-2">' + renderTable(['Name', 'Field', 'Data Model', 'Filters'], slicerRows) + '</div></details>';
            }

            if (tables.length > 0) {
                html += '<details open class="group mb-6"><summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors"><span class="text-lg font-bold text-slate-800">📊 Tables (' + tables.length + ')</span><span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span></summary>';
                const tableRows = tables.map((v: any) => {
                    const dataModelId = v.AttributeString1 || '-';
                    const filterCount = this.countFilters(v.AttributeText1);
                    const paramCount = this.countParams(v.AttributeText2);
                    return {
                        Col1: v.Description || 'Unnamed',
                        Col2: dataModelId === '-' ? '-' : dataModelId.substring(0, 8) + '...',
                        Col3: filterCount > 0 ? filterCount.toString() : '-',
                        Col4: paramCount > 0 ? paramCount.toString() : '-'
                    };
                });
                html += '<div class="pt-4 pb-2 px-2">' + renderTable(['Name', 'Data Model', 'Filters', 'Parameters'], tableRows) + '</div></details>';
            }

            if (charts.length > 0) {
                html += '<details open class="group mb-6"><summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors"><span class="text-lg font-bold text-slate-800">📈 Charts (' + charts.length + ')</span><span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span></summary>';
                const chartRows = charts.map((v: any) => {
                    const dataModelId = v.AttributeString1 || '-';
                    const filterCount = this.countFilters(v.AttributeText1);
                    const paramCount = this.countParams(v.AttributeText2);
                    return {
                        Col1: v.Description || 'Unnamed',
                        Col2: dataModelId === '-' ? '-' : dataModelId.substring(0, 8) + '...',
                        Col3: filterCount > 0 ? filterCount.toString() : '-',
                        Col4: paramCount > 0 ? paramCount.toString() : '-'
                    };
                });
                html += '<div class="pt-4 pb-2 px-2">' + renderTable(['Name', 'Data Model', 'Filters', 'Parameters'], chartRows) + '</div></details>';
            }

            return html;
        };

        // --- Section 5: Variables Inventory ---
        const buildVariablesInventory = () => {
            if (variables.length === 0) return '';

            const rows = variables.map((v: any) => {
                const typeMap: Record<string, string> = {
                    'A': 'String', 'L': 'Boolean', 'N': 'Numeric', 'D': 'Date', 'I': 'Integer', 'F': 'Float'
                };
                return {
                    Col1: v.Name || '-',
                    Col2: typeMap[v.VariableType || ''] || v.VariableType || '-',
                    Col3: v.DefaultValue || '-',
                    Col4: v.SelectionTypeListType || v.ListType || '-',
                    Col5: v.Description || '-'
                };
            });

            const ths = ['Name', 'Type', 'Default', 'List Source', 'Description']
                .map(h => `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`)
                .join('');
            const trs = rows.map((r: any) => {
                const cells = [1, 2, 3, 4, 5].map(i => {
                    const val = r[`Col${i}`] || '';
                    return `<td class="px-4 py-2 text-sm text-gray-700">${val}</td>`;
                }).join('');
                return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
            }).join('');
            const table = `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300 text-left bg-slate-50"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;

            return `
                <details open class="group mb-6">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors">
                        <span class="text-lg font-bold text-slate-800">#️⃣ Variables (${variables.length})</span>
                        <span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">${table}</div>
                </details>
            `;
        };

        // --- Section 6: Data Model Dependencies ---
        const buildDependencies = () => {
            const dmIds = new Set(visualizations
                .map((v: any) => v.AttributeString1)
                .filter(Boolean)
            );

            if (dmIds.size === 0) return '<p class="text-gray-500 italic">No data model dependencies</p>';

            const rows = Array.from(dmIds).map((id: any) => {
                let dmName = '-';
                let status = 'Not in library';
                let statusClass = 'bg-amber-50 text-amber-700 border-amber-200';

                // Try to find the data model in DB
                const foundDM = visualizations.find((v: any) => v.AttributeString1 === id)?.DatamodelDescription;
                if (foundDM) {
                    dmName = foundDM;
                }

                return {
                    Col1: dmName,
                    Col2: id.substring(0, 12) + '...',
                    Col3: `<span class="text-xs px-2 py-1 rounded border ${statusClass}">${status}</span>`
                };
            });

            const ths = ['Data Model', 'ID', 'Status']
                .map(h => `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`)
                .join('');
            const trs = rows.map((r: any) => {
                return `<tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm text-gray-700">${r.Col1}</td>
                    <td class="px-4 py-2 text-sm text-gray-500 font-mono">${r.Col2}</td>
                    <td class="px-4 py-2 text-sm">${r.Col3}</td>
                </tr>`;
            }).join('');
            const table = `<div class="w-full overflow-hidden border border-slate-300 rounded-md"><table class="w-full divide-y divide-slate-300 text-left bg-slate-50"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;

            return `
                <details open class="group mb-6">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors">
                        <span class="text-lg font-bold text-slate-800">🔗 Data Model Dependencies</span>
                        <span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">${table}</div>
                </details>
            `;
        };

        // --- Metadata Grid ---
        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Owner</span>
                    <span class="font-medium text-gray-800">${metadata.owner || '-'}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Folder</span>
                    <span class="font-medium text-gray-800 text-xs truncate" title="${metadata.parentPath}">${metadata.parentPath?.split('/').pop() || '-'}</span>
                </div>
                <div class="md:col-span-2">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Widgets</span>
                    <span class="font-medium text-gray-800">${visualizations.length}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Modified</span>
                    <span class="font-medium text-gray-800">${displayDate}</span>
                </div>
                <div class="md:col-span-1 text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">System ID</span>
                    <span class="font-mono text-gray-500 text-[11px] truncate block" title="${metadata.id}">${(metadata.id || id).toString().substring(0, 8)}...</span>
                </div>
            </div>
        `;

        // --- Executive Summary ---
        const summaryHtml = `
            <div class="p-6 bg-slate-50 border-l-4 border-emerald-400 rounded-r-xl shadow-sm mb-8">
                <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span class="text-lg">📋</span> Executive Summary
                </h3>
                <p class="text-slate-700 text-lg leading-relaxed italic">
                    "This dashboard contains <strong>${visualizations.length} widgets</strong> across <strong>${new Set(visualizations.map((v: any) => v.AttributeString1)).size} data models</strong> to provide business intelligence and reporting capabilities."
                </p>
            </div>
        `;

        // --- Final HTML ---
        return `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${metadata.name}</h2>
                        ${metadata.description ? `<p class="text-lg text-slate-600 mt-2 leading-relaxed">${metadata.description}</p>` : ''}
                    </div>
                    <span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-emerald-200">Dashboard</span>
                </div>
                ${metaGrid}
            </div>

            <div class="doc-body space-y-8">
                ${summaryHtml}

                <!-- Layout Diagram -->
                <div class="mb-8">
                    <div class="flex items-center space-x-2 mb-4">
                        <span class="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 4H5a2 2 0 00-2 2v14a2 2 0 002 2h4m0-21v21m0-21h4a2 2 0 012 2v14a2 2 0 01-2 2h-4m6-21v21"></path></svg>
                        </span>
                        <h2 class="text-2xl font-bold text-gray-800">Layout Diagram</h2>
                    </div>
                    ${buildLayoutDiagram()}
                </div>

                <!-- Widget Inventory -->
                <div class="mb-8">
                    <div class="flex items-center space-x-2 mb-4">
                        <span class="bg-purple-100 text-purple-600 p-1.5 rounded-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                        </span>
                        <h2 class="text-2xl font-bold text-gray-800">Widget Inventory</h2>
                    </div>
                    ${buildWidgetInventory()}
                </div>

                <!-- Variables -->
                ${buildVariablesInventory()}

                <!-- Dependencies -->
                <div class="mb-8">
                    <div class="flex items-center space-x-2 mb-4">
                        <span class="bg-cyan-100 text-cyan-600 p-1.5 rounded-lg">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.658 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        </span>
                        <h2 class="text-2xl font-bold text-gray-800">Data Model Dependencies</h2>
                    </div>
                    ${buildDependencies()}
                </div>
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

    private static getSlicerField(slicerDef: any): string {
        if (!slicerDef) return '-';
        return slicerDef.ValueField?.['#text'] || slicerDef.ValueField || '-';
    }
}
