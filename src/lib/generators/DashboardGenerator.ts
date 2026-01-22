import { db } from '../db';

export class DashboardGenerator {
    static async generateHtmlView(id: number, _viewMode: 'business' | 'technical' = 'business'): Promise<string> {
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
                return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

        // --- Extract Data ---
        const dashDef = content.Dashboard?.EntityDef || {};
        const dashLayout = dashDef.Definition?.Dashboard || {};
        const layoutItems = getList(dashLayout.Layout?.LayoutItem || []);
        const visualizations = getList(content.Visualisations?.ArrayOfEntityDef?.EntityDef || []);
        const variables = getList(content.Variables?.ArrayOfVariableDef?.VariableDef || []);

        // --- Build Widget Map ---
        const widgetMap = new Map(visualizations.map((v: any) => [v.GenericEntityId, v]));

        // --- 1. OVERVIEW SECTION ---
        const buildOverview = () => {
            const widgetTypes = new Map<string, number>();
            visualizations.forEach((v: any) => {
                const type = v.EntitySubType || 'UNKNOWN';
                widgetTypes.set(type, (widgetTypes.get(type) || 0) + 1);
            });

            const typeList = Array.from(widgetTypes.entries())
                .map(([type, count]) => `<li class="text-sm text-gray-700">${type}: <strong>${count}</strong></li>`)
                .join('');

            return `
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <div class="text-2xl font-bold text-blue-800">${visualizations.length}</div>
                        <div class="text-xs text-blue-600 uppercase font-semibold">Total Widgets</div>
                    </div>
                    <div class="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <div class="text-2xl font-bold text-purple-800">${new Set(visualizations.map((v: any) => v.AttributeString1)).size}</div>
                        <div class="text-xs text-purple-600 uppercase font-semibold">Data Models</div>
                    </div>
                    <div class="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div class="text-2xl font-bold text-green-800">${variables.length}</div>
                        <div class="text-xs text-green-600 uppercase font-semibold">Variables</div>
                    </div>
                    <div class="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <div class="text-2xl font-bold text-orange-800">${layoutItems.length}</div>
                        <div class="text-xs text-orange-600 uppercase font-semibold">Layout Items</div>
                    </div>
                </div>
                ${typeList ? `<div class="bg-gray-50 p-4 rounded border border-gray-200 mb-8"><div class="font-semibold text-gray-700 mb-2">Widget Breakdown:</div><ul>${typeList}</ul></div>` : ''}
            `;
        };

        // --- 2. DASHBOARD METADATA SECTION ---
        const buildMetadata = () => {
            return `
                <div class="mb-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="bg-slate-100 p-2 rounded">ℹ️</span> Dashboard Metadata
                    </h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-gray-200 rounded-lg p-6">
                        <div>
                            <div class="text-xs font-semibold text-gray-500 uppercase">Name</div>
                            <div class="text-gray-800 font-medium">${escapeHtml(metadata.name || dashDef.Description || 'N/A')}</div>
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-gray-500 uppercase">Owner</div>
                            <div class="text-gray-800 font-medium">${escapeHtml(metadata.owner || dashDef.Owner || 'N/A')}</div>
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-gray-500 uppercase">System ID</div>
                            <div class="font-mono text-sm text-gray-600">${escapeHtml((dashDef.GenericEntityId || 'N/A').substring(0, 12))}...</div>
                        </div>
                        <div>
                            <div class="text-xs font-semibold text-gray-500 uppercase">Reporting System</div>
                            <div class="text-gray-800 font-medium">${escapeHtml(dashDef.ReportingSystem || 'N/A')}</div>
                        </div>
                        <div class="md:col-span-2">
                            <div class="text-xs font-semibold text-gray-500 uppercase">Folder Path</div>
                            <div class="font-mono text-sm text-gray-600 break-words">${escapeHtml(metadata.parentPath || dashDef.ParentFileItemPath || 'N/A')}</div>
                        </div>
                        <div class="md:col-span-2">
                            <div class="text-xs font-semibold text-gray-500 uppercase">Last Modified</div>
                            <div class="text-gray-800 font-medium">${formatDate(metadata.dateModified || dashboard.dateAdded.toISOString())}</div>
                        </div>
                    </div>
                </div>
            `;
        };

        // --- 3. LAYOUT DIAGRAM ---
        const buildLayoutDiagram = () => {
            if (layoutItems.length === 0) {
                return '<p class="text-gray-500 italic bg-gray-50 p-4 rounded">No layout items defined</p>';
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

            let diagram = '<pre class="bg-gray-50 border border-gray-300 rounded p-4 overflow-x-auto text-xs font-mono text-gray-700 mb-4">';
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

        // --- 4. DETAILED WIDGETS SECTION ---
        const buildWidgetDetails = () => {
            if (visualizations.length === 0) {
                return '<p class="text-gray-500 italic">No widgets in dashboard</p>';
            }

            let html = '<div class="space-y-6">';

            visualizations.forEach((widget: any, idx: number) => {
                const typeColor: Record<string, string> = {
                    'SLICER': 'blue',
                    'TABLE': 'purple',
                    'CHART': 'pink',
                };
                const color = typeColor[widget.EntitySubType] || 'gray';

                // Extract criteria
                const criteria = widget.AttributeText1?.CriteriaSetItem?.CriteriaValues?.CriteriaValue || [];
                const criteriaList = getList(criteria);

                // Extract parameters
                const params = widget.AttributeText2?.Parameters?.ParameterField || [];
                const paramsList = getList(params);

                html += `
                    <div class="border border-${color}-200 bg-${color}-50 rounded-lg p-4">
                        <div class="flex items-start justify-between mb-3">
                            <div>
                                <h3 class="text-lg font-bold text-gray-800">${escapeHtml(widget.Description || 'Unnamed Widget')}</h3>
                                <span class="inline-block mt-1 px-2 py-1 text-xs font-semibold rounded bg-${color}-100 text-${color}-800">${widget.EntitySubType || 'UNKNOWN'}</span>
                            </div>
                            <div class="text-right text-xs text-gray-500">Widget #${idx + 1}</div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm mb-4">
                            <div>
                                <div class="font-semibold text-gray-700">ID</div>
                                <div class="font-mono text-xs text-gray-600 break-all">${escapeHtml(widget.GenericEntityId?.substring(0, 12) || 'N/A')}...</div>
                            </div>
                            <div>
                                <div class="font-semibold text-gray-700">Data Model</div>
                                <div class="font-mono text-xs text-gray-600 break-all">${escapeHtml((widget.AttributeString1 || 'N/A').substring(0, 12))}...</div>
                            </div>
                            <div>
                                <div class="font-semibold text-gray-700">Data Model Name</div>
                                <div class="text-gray-600">${escapeHtml(widget.DatamodelDescription || 'N/A')}</div>
                            </div>
                        </div>

                        ${criteriaList.length > 0 ? `
                            <div class="mb-3 p-3 bg-white rounded border border-gray-200">
                                <div class="font-semibold text-gray-700 mb-2">Criteria/Filters (${criteriaList.length}):</div>
                                <ul class="text-sm space-y-1">
                                    ${criteriaList.map((c: any) => `
                                        <li class="text-gray-600">
                                            <strong>${escapeHtml(c.ColumnId || 'N/A')}</strong> 
                                            ${escapeHtml(c.Operator?.Value || '=')} 
                                            <span class="font-mono text-xs bg-gray-100 px-1 rounded">${escapeHtml(c.Value1 || 'N/A')}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}

                        ${paramsList.length > 0 ? `
                            <div class="mb-3 p-3 bg-white rounded border border-gray-200">
                                <div class="font-semibold text-gray-700 mb-2">Parameters (${paramsList.length}):</div>
                                <ul class="text-sm space-y-1">
                                    ${paramsList.map((p: any) => `
                                        <li class="text-gray-600">
                                            <strong>${escapeHtml(p.FieldName || 'N/A')}</strong> = 
                                            <span class="font-mono text-xs bg-gray-100 px-1 rounded">${escapeHtml(p.Value || 'N/A')}</span>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}

                        ${widget.Owner ? `
                            <div class="text-xs text-gray-500">
                                <strong>Owner:</strong> ${escapeHtml(widget.Owner)}
                                ${widget.OwnerType ? ` (${widget.OwnerType === 'E' ? 'Employee' : widget.OwnerType === 'R' ? 'Role' : widget.OwnerType})` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            html += '</div>';
            return html;
        };

        // --- 5. VARIABLES SECTION ---
        const buildVariablesSection = () => {
            if (variables.length === 0) {
                return '<p class="text-gray-500 italic">No variables defined</p>';
            }

            const typeMap: Record<string, string> = {
                'A': 'String',
                'L': 'Boolean',
                'N': 'Numeric',
                'D': 'Date',
                'I': 'Integer',
                'F': 'Float'
            };

            let html = '<div class="space-y-3">';
            variables.forEach((v: any) => {
                html += `
                    <div class="border border-green-200 bg-green-50 rounded-lg p-4">
                        <div class="font-bold text-gray-800">${escapeHtml(v.Name || 'Unnamed')}</div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm mt-2">
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Type</div>
                                <div class="text-gray-800">${typeMap[v.VariableType] || v.VariableType || 'N/A'}</div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Default Value</div>
                                <div class="font-mono text-xs text-gray-700">${escapeHtml(v.DefaultValue || 'N/A')}</div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-600">List Source</div>
                                <div class="text-gray-800">${escapeHtml(v.SelectionTypeListType || v.ListType || 'N/A')}</div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-gray-600">Description</div>
                                <div class="text-gray-800">${escapeHtml(v.Description || 'N/A')}</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        };

        // --- 6. DATA MODELS SECTION ---
        const buildDataModelsSection = () => {
            const dmIds = new Set(visualizations.map((v: any) => v.AttributeString1).filter(Boolean));
            if (dmIds.size === 0) {
                return '<p class="text-gray-500 italic">No data models referenced</p>';
            }

            let html = '<div class="space-y-3">';
            Array.from(dmIds).forEach((dmId: any) => {
                const dmName = visualizations.find((v: any) => v.AttributeString1 === dmId)?.DatamodelDescription || 'Unknown';
                const widgetCount = visualizations.filter((v: any) => v.AttributeString1 === dmId).length;

                html += `
                    <div class="border border-cyan-200 bg-cyan-50 rounded-lg p-4">
                        <div class="flex items-start justify-between">
                            <div>
                                <div class="font-bold text-gray-800">${escapeHtml(dmName)}</div>
                                <div class="font-mono text-xs text-gray-600 mt-1">${escapeHtml(dmId)}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-sm font-semibold text-cyan-700">${widgetCount} widgets</div>
                                <div class="text-xs text-cyan-600">reference this DM</div>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            return html;
        };

        // --- FINAL OUTPUT ---
        return `
            <div class="doc-header mb-8">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h1 class="text-4xl font-bold text-gray-900">${escapeHtml(metadata.name || dashDef.Description || 'Dashboard')}</h1>
                        <p class="text-gray-600 mt-2">Comprehensive dashboard documentation and analysis</p>
                    </div>
                    <span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full uppercase">Dashboard</span>
                </div>
            </div>

            <div class="doc-body space-y-8">
                <!-- Overview Stats -->
                <section>
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="bg-blue-100 p-2 rounded">📊</span> Overview
                    </h2>
                    ${buildOverview()}
                </section>

                <!-- Metadata -->
                <section>
                    ${buildMetadata()}
                </section>

                <!-- Layout Diagram -->
                <section>
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="bg-orange-100 p-2 rounded">📐</span> Layout Diagram
                    </h2>
                    ${buildLayoutDiagram()}
                </section>

                <!-- Widget Details -->
                <section>
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="bg-purple-100 p-2 rounded">🎛️</span> Widget Details (${visualizations.length})
                    </h2>
                    ${buildWidgetDetails()}
                </section>

                <!-- Variables -->
                ${variables.length > 0 ? `
                    <section>
                        <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span class="bg-green-100 p-2 rounded">📋</span> Variables (${variables.length})
                        </h2>
                        ${buildVariablesSection()}
                    </section>
                ` : ''}

                <!-- Data Models -->
                <section>
                    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span class="bg-cyan-100 p-2 rounded">🔗</span> Data Models Referenced
                    </h2>
                    ${buildDataModelsSection()}
                </section>
            </div>
        `;
    }
}
