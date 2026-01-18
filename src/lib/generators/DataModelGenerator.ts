import { db } from '../db';
import { ExpressionFormatter } from '../formatters/ExpressionFormatter';

export class DataModelGenerator {
    static async generateHtmlView(id: number, _viewMode: 'business' | 'technical' = 'business'): Promise<string> {
        const dm = await db.dataModels.get(id);
        if (!dm) throw new Error("Data Model not found");

        const content = dm.content;
        const metadata = dm.metadata;

        // Extract ProcessMode
        const rootDef = content.DataModel?.DataModelDef || content.DataModel?.Definition;
        const processMode = rootDef?.ProcessMode || 'N/A';


        // --- Section: Header ---
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

        const displayDate = formatDate(metadata.dateModified || dm.dateAdded.toISOString());

        // Consistent Meta Grid
        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Owner</span>
                    <span class="font-medium text-gray-800">${metadata.owner || '-'}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Version</span>
                    <span class="font-medium text-gray-800">${metadata.version}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Process Mode</span>
                    <span class="font-medium text-gray-800 px-2 py-0.5 rounded ${processMode === 'Stored' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'} text-xs font-bold">${processMode}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Modified</span>
                    <span class="font-medium text-gray-800">${displayDate}</span>
                </div>
                <div class="md:col-span-2 text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">System ID</span>
                    <span class="font-mono text-gray-500 text-[11px] truncate block" title="${metadata.id || id}">${metadata.id || id}</span>
                </div>
            </div>
        `;

        // Variables
        // Variables
        const rawVars = this.getList(content.Variables?.ArrayOfVariableDef?.VariableDef);
        const resolveType = (t: string) => {
            const types: Record<string, string> = {
                'A': 'String',
                'L': 'Boolean',
                'N': 'Numeric',
                'D': 'Date',
                'I': 'Integer',
                'F': 'Float'
            };
            return types[t] || t || 'String';
        };

        const variables = rawVars.map((v: any) => ({
            Name: v.Name,
            Value: v.DefaultValue,
            Type: resolveType(v.DataType || v.VariableType),
            Source: v.DataSourceName || '',
            Description: v.Description
        }));
        const variableSet = new Set(variables.map((v: any) => v.Name));

        // Indexes
        const rawIndexes = this.getList(content.DataModel?.Definition?.DataModelDefinition?.Indexes?.Index);
        const indexes = rawIndexes.map((idx: any) => ({
            Name: idx.Name,
            Columns: this.getList(idx.Columns?.Column).map((c: any) => c.Name).join(', ')
        }));
        const indexMap = new Map(indexes.map((i: any) => [i.Name, i]));

        // Drilldown Views (Detail Views)
        const rawViews = this.getList(content.DataModel?.Definition?.DataModelDefinition?.DetailViews?.View);
        const views = rawViews.map((v: any) => ({
            Name: v.Name,
            Columns: this.getList(v.Columns?.Column).map((c: any) => c.Name).join(', ')
        }));

        // Queries - Sort by Sequence
        const rawQueries = this.getList(content.Queries?.ArrayOfQuery?.Query);
        const queries = rawQueries.sort((a: any, b: any) => (Number(a.Sequence) || 0) - (Number(b.Sequence) || 0));

        const finalQuery = queries.length > 0 ? queries[queries.length - 1] : null;
        const intermediateQueries = queries.length > 1 ? queries.slice(0, queries.length - 1) : [];

        // Build Table Set from all datasources
        const allDS = this.getList(content.QueryDatasources?.ArrayOfQueryDatasource?.QueryDatasource);
        const tableSet = new Set(allDS.map((d: any) => d.DatasourceId || d.DataSourceName).filter(Boolean));

        const stepNotes = dm.stepNotes || {};

        // --- Helper: Table Renderer (Updated with Sets) ---
        const renderTable = (headers: string[], rows: any[]) => {
            if (!rows || rows.length === 0) return '';

            const ths = headers.map(h => {
                let w = '';
                // Specific sizing for Column Table
                if (h === 'Column') w = 'w-[30%]';
                else if (h === 'Type' && headers.length === 3) w = 'w-[20%]';
                else if (h === 'Name' && headers.length === 3) w = 'w-[30%]';

                return `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0 ${w}">${h}</th>`;
            }).join('');

            const trs = rows.map(r => {
                const cells = headers.map((h, i) => {
                    let rawVal = r[`Col${i + 1}`] || (i === 0 ? r.Name : r.Value) || '';

                    const isVarName = h === 'Variable Name';
                    // Don't format merged HTML columns
                    const isMergedHtml = h === 'Column' || (h === 'Type' && headers.length === 3) || (h === 'Name' && headers.length === 3);

                    let val = rawVal;
                    if (!isVarName && !isMergedHtml && !(typeof rawVal === 'string' && rawVal.trim().startsWith('<div'))) {
                        val = ExpressionFormatter.formatExpression(rawVal, variableSet, tableSet);
                    }

                    const isCode = h === 'Source' || h === 'Formula' || h === 'Expression' || h === 'Value';

                    let cellContent = val;
                    if (isVarName && rawVal) {
                        cellContent = `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold border border-purple-200 font-mono">${rawVal}</span>`;
                    } else if (isCode && val && val !== '-' && !val.toString().includes('<div')) {
                        cellContent = `<code class="font-mono text-xs bg-slate-50 text-slate-600 border border-slate-200 rounded px-1.5 py-0.5 break-all block">${val}</code>`;
                    }

                    const cellClass = (i === 0) ? 'font-medium text-slate-900' : 'text-gray-700';
                    const alignClass = 'align-top';
                    const monoClass = (headers.length === 3 && i === 2) ? 'font-mono' : '';

                    return `<td class="px-4 py-2 text-sm ${cellClass} ${alignClass} ${monoClass}">${cellContent}</td>`;
                }).join('');
                return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
            }).join('');

            return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3 min-w-full"><table class="w-full divide-y divide-slate-300 text-left bg-slate-50"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
        };

        // --- Helper: Summary Generator ---
        const generateSummary = () => {
            if (!finalQuery) return "No queries defined in this data model.";

            const uniqueSources = new Set(allDS.filter((d: any) => d.DataSourceType !== 'Query').map((d: any) => d.DataSourceName || d.TableName)).size;
            const queryCount = queries.length;

            // Get columns for final query
            const finalCols = this.getList(content.QueryColumns?.ArrayOfQueryColumn?.QueryColumn)
                .filter((c: any) => c.QueryName === finalQuery.QueryName);

            return `This Data Model generates the <strong>${finalQuery.QueryName}</strong> dataset. It aggregates data from <strong>${uniqueSources} external sources</strong> across <strong>${queryCount} transformation steps</strong> to produce <strong>${finalCols.length} output columns</strong>.`;
        };

        const summaryHtml = `
            <div class="p-6 bg-slate-50 border-l-4 border-slate-400 rounded-r-xl shadow-sm mb-8">
                <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span class="text-lg">📋</span> Executive Summary
                </h3>
                <p class="text-slate-700 text-lg leading-relaxed italic">
                    "${generateSummary()}"
                </p>
            </div>
        `;

        // Render
        return `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${metadata.name}</h2>
                        ${metadata.description ? `<p class="text-lg text-slate-600 mt-2 leading-relaxed">${metadata.description}</p>` : ''}
                    </div>
                     <span class="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-purple-200">DATA MODEL</span>
                </div>
                ${metaGrid}
            </div>

            <div class="doc-body space-y-8">
                
                ${summaryHtml}

                <!-- Variables Section -->
                ${variables.length > 0 ? `
                <details open class="group mb-8">
                     <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors select-none border-t border-b border-gray-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-slate-500 text-lg">#</span> Global Variables
                        </span>
                        <span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span>
                    </summary>
                    <div class="pt-6 pb-2 px-2">
                        ${renderTable(
                            ['Variable Name', 'Value', 'Type', 'Description'],
                            variables.map((v: any) => ({
                                Col1: v.Name,
                                Col2: v.Value,
                                Col3: v.Type,
                                Col4: v.Description
                            }))
                        )}
                    </div>
                </details>
                ` : ''}

                <!-- Indexes Section -->
                ${indexes.length > 0 ? `
                <details open class="group mb-8">
                     <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors select-none border-t border-b border-gray-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-slate-500 text-lg">⚡</span> Indexes
                        </span>
                        <span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span>
                    </summary>
                    <div class="pt-6 pb-2 px-2">
                         ${renderTable(['Index Name', 'Columns'], indexes.map((i: any) => ({ Col1: i.Name, Col2: i.Columns })))}
                    </div>
                </details>
                ` : ''}

                <!-- Drilldown Views Section -->
                ${views.length > 0 ? `
                <details open class="group mb-8">
                     <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors select-none border-t border-b border-gray-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-slate-500 text-lg">🔍</span> Drilldown Views
                        </span>
                        <span class="transform group-open:rotate-180 transition-transform text-slate-400">▼</span>
                    </summary>
                    <div class="pt-6 pb-2 px-2">
                         ${renderTable(['View Name', 'Columns'], views.map((v: any) => ({ Col1: v.Name, Col2: v.Columns })))}
                    </div>
                </details>
                ` : ''}

                 <!-- Final Output Section -->
                 ${finalQuery ? `
                    <div class="mt-8">
                         <div class="flex items-center space-x-2 mb-4">
                            <span class="bg-emerald-100 text-emerald-600 p-1.5 rounded-lg">
                                 <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </span>
                            <h2 class="text-2xl font-bold text-gray-800">Final Output</h2>
                         </div>
                         <div class="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden">
                            ${this.renderQueryCard(finalQuery, content, renderTable, variableSet, tableSet, indexMap, true, id, stepNotes)}
                         </div>
                    </div>
                 ` : ''}

                 <!-- Transformation Layers -->
                 ${intermediateQueries.length > 0 ? `
                     <div class="mt-12">
                         <div class="flex items-center space-x-2 mb-4 cursor-pointer" onclick="this.nextElementSibling.classList.toggle('hidden')">
                             <div class="bg-blue-50 text-blue-500 p-1 rounded-md">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                             </div>
                             <h2 class="text-xl font-bold text-gray-600 hover:text-gray-800 transition-colors">Transformation Layers (${intermediateQueries.length})</h2>
                             <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                         </div>
                         <div class="hidden">
                            <div class="grid grid-cols-1 gap-6">
                                ${intermediateQueries.map(q => this.renderQueryCard(q, content, renderTable, variableSet, tableSet, indexMap, false, id, stepNotes)).join('')}
                            </div>
                         </div>
                     </div>
                 ` : ''}
            </div>
        `;
    }

    private static renderQueryCard(query: any, content: any, renderTable: (h: string[], r: any[]) => string, variableSet: Set<string>, tableSet: Set<string>, indexMap: Map<string, any>, isFinal: boolean = false, reportId: number = 0, stepNotes: any = {}): string {
        const qName = query.QueryName;
        const id = query.Id;

        // Note UI Generation
        const stepNote = stepNotes[id] || '';
        const notesHtml = `
            <div class="step-notes-container mt-2 mb-4" data-step-id="${id}">
                ${stepNote ? `
                    <div class="relative bg-amber-50 border border-amber-200 p-2 rounded text-xs text-amber-900 group/note mb-2">
                        <div class="flex justify-between items-start">
                            <span class="grow italic whitespace-pre-wrap">${ExpressionFormatter.colouriseTextHTML(stepNote, variableSet, tableSet)}</span>
                            <button onclick="window.editStepNote('${reportId}', '${id}')" class="opacity-0 group-hover/note:opacity-100 transition text-amber-600 hover:text-amber-800 ml-2" title="Edit Note">✎</button>
                        </div>
                    </div>
                ` : `
                    <button onclick="window.editStepNote('${reportId}', '${id}')" class="text-[10px] text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors mt-1">
                        <span>📝</span> Add Note
                    </button>
                `}
                <div id="note-editor-${id}" class="hidden mt-2">
                    <textarea class="w-full text-xs p-2 border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[60px]" placeholder="Add your technical or business notes here...">${stepNote}</textarea>
                    <div class="flex justify-end gap-2 mt-1">
                        <button onclick="window.cancelNote('${id}')" class="text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
                        <button onclick="window.saveStepNote('${reportId}', '${id}')" class="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">Save Note</button>
                    </div>
                </div>
            </div>
        `;

        // Find columns
        const allCols = this.getList(content.QueryColumns?.ArrayOfQueryColumn?.QueryColumn);
        const myCols = allCols.filter((c: any) => c.QueryName === qName);

        // Find joins
        const allJoins = this.getList(content.QueryJoins?.ArrayOfQueryJoin?.QueryJoin);
        const myJoins = allJoins.filter((j: any) => j.QueryName === qName);

        // Find datasources
        const allDS = this.getList(content.QueryDatasources?.ArrayOfQueryDatasource?.QueryDatasource);
        const myDS = allDS.filter((d: any) => d.QueryName === qName);

        // Prepare Table Data (Columns)
        const colRows = myCols.map((c: any) => {
            let source = '';
            if (c.Expression) {
                source = c.Expression;
            } else if (c.DataSourceName && c.FieldId) {
                source = `<div>${ExpressionFormatter.formatTable(`${c.DataSourceName}.${c.FieldId}`)}</div>`;
            } else {
                source = c.DataSourceName || '';
            }

            const nameHtml = `<div class="font-medium text-slate-900">${c.ColumnName || 'Unknown Column'}</div>` +
                (c.Description ? `<div class="text-xs text-gray-500 italic mt-0.5">${ExpressionFormatter.colouriseTextHTML(c.Description, variableSet, tableSet)}</div>` : '');

            const typeHtml = `<div class="text-slate-700">${c.JavaType || c.DataType || 'String'}</div>` +
                (c.Format && c.Format !== '-' ? `<div class="text-xs text-gray-500 italic mt-0.5">${c.Format}</div>` : '');

            return {
                Col1: nameHtml,
                Col2: typeHtml,
                Col3: source
            };
        });

        // Find Filters (Criteria)
        const filters: { col: string, op: string, val: string, rawOp: string, isIndex: boolean, indexCols?: string }[] = [];
        const processCriteria = (crit: any) => {
            if (!crit) return;
            const values = this.getList(crit.CriteriaValues?.CriteriaValue);
            values.forEach((v: any) => {
                if (v.ColumnId && v.Operator?.Value) {
                    let op = v.Operator.Value;
                    const rawOp = op; // Store original for tooltip
                    let val = v.Value1 || '';

                    // Refine Operator and Value using Normalization
                    // "Add spaces before any capital letters, then convert all to lower case"
                    let niceOp = op.replace(/([A-Z])/g, ' $1').trim().toLowerCase();

                    // Special Handling for values or specific overrides
                    if (op === 'Between') {
                        val = `${v.Value1 || '?'} and ${v.Value2 || '?'}`;
                    }

                    op = niceOp;

                    // Handle generic empty string visuals
                    if (val === '') val = '<span class="italic text-gray-400">nothing</span>';

                    // Check if col is an Index
                    const index = indexMap.get(v.ColumnId);

                    filters.push({
                        col: v.ColumnId,
                        op: op,
                        val: val,
                        rawOp: rawOp,
                        isIndex: !!index,
                        indexCols: index ? index.Columns : undefined
                    });
                }
            });
            if (crit.NestedSets?.CriteriaSetItem) {
                const nested = this.getList(crit.NestedSets.CriteriaSetItem);
                nested.forEach((n: any) => processCriteria(n));
            }
        };

        if (query.Criteria?.CriteriaSetItem) {
            processCriteria(query.Criteria.CriteriaSetItem);
        }

        const qDisplayName = qName || '(Unnamed Query)';

        // Colors
        let bgHeader = isFinal ? 'bg-emerald-50 hover:bg-emerald-100' : 'bg-slate-50 hover:bg-slate-100';

        const showSources = myDS.length > 0;
        const showJoins = myJoins.length > 0;

        return `
            <details class="group bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm transition hover:shadow-md" ${isFinal ? 'open' : ''}>
                <summary class="flex items-center justify-between p-4 cursor-pointer ${bgHeader} transition list-none [&::-webkit-details-marker]:hidden [&::after]:hidden">
                    <div class="flex items-center space-x-3">
                        <span class="font-bold text-slate-800 text-lg">${qDisplayName}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                         <span class="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full font-mono">${myCols.length} Cols</span>
                         ${filters.length > 0 ? `<span class="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-mono">${filters.length} Filters</span>` : ''}
                         ${showJoins ? `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded border border-purple-200 font-bold">${myJoins.length} Joins</span>` : ''}
                    </div>
                </summary>
                
                <div class="p-6 border-t border-gray-200 space-y-6 bg-white">
                    
                    ${notesHtml}

                    ${filters.length > 0 ? `
                        <div class="mb-4">
                            <h4 class="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Filters</h4>
                             <div class="grid gap-2">
                                ${filters.map(f => `
                                    <div class="bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-3 shadow-sm">
                                         <span class="text-amber-500">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                                         </span>
                                         <div class="flex items-baseline gap-2 text-sm font-mono break-all flex-1">
                                             ${f.isIndex
                                        ? `<div class="flex flex-col"><span class="font-bold text-slate-700 flex items-center gap-1">${f.col}<span class="text-[10px] bg-slate-200 text-slate-600 px-1 rounded uppercase tracking-wider font-sans border border-slate-300">Index</span></span><span class="text-xs text-slate-500 italic block mt-0.5" title="${f.indexCols}">On: ${f.indexCols}</span></div>`
                                        : `<span class="font-bold text-slate-700">${f.col}</span>`
                                             }
                                             <span class="text-amber-700 font-medium text-sm px-1 cursor-help border-b border-dotted border-amber-200" title="${f.rawOp}">${f.op}</span>
                                             <span class="text-slate-800 bg-white px-1.5 py-0.5 rounded border border-amber-100 shadow-sm">${f.val}</span>
                                         </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${showSources ? `
                        <div class="mb-6">
                            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Sources</h4>
                            <div class="flex flex-wrap gap-2">
                                ${myDS.map((ds: any) => {
            // Helper to extract real table/query name from parameters
            const getParamValue = (name: string) => {
                const fields = this.getList(ds.ParameterValues?.Parameters?.ParameterField);
                const field = fields.find((f: any) => f.FieldName === name);
                return field ? field.Value : null;
            };

            const realName = getParamValue('TableName') || getParamValue('QueryName') || getParamValue('WarehouseName');
            const shortName = ds.DataSourceName;
            const type = ds.DataSourceType || 'Table';

            let displayName = shortName || '';
            if (realName && shortName && realName !== shortName) {
                displayName = `<span class="font-bold">${shortName}</span> <span class="opacity-70 font-normal ml-1">(${realName})</span>`;
            } else {
                displayName = displayName || realName || ds.DatasourceId || 'Unknown Source';
            }

            // Style based on type
            let colorClass = 'bg-gray-100 text-gray-700 border-gray-200';
            let typeLabel = type.toUpperCase();

            if (type === 'DirectTable') {
                colorClass = 'bg-blue-50 text-blue-700 border-blue-200';
                typeLabel = 'TABLE';
            } else if (type === 'Warehouse') {
                colorClass = 'bg-cyan-50 text-cyan-700 border-cyan-200';
                typeLabel = 'WAREHOUSE';
            } else if (type === 'Query') {
                colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
                typeLabel = 'QUERY';
            } else if (type === 'Analyser') {
                colorClass = 'bg-amber-50 text-amber-700 border-amber-200';
                typeLabel = 'ANALYSER';
            }

            return `
                                        <div class="${colorClass} px-3 py-1 rounded border inline-flex items-center font-mono text-xs font-semibold tracking-tight" title="${ds.DatasourceId}">
                                            <span class="opacity-60 text-[9px] mr-2 border-r border-current pr-2 leading-none">${typeLabel}</span>
                                            <span>${displayName}</span>
                                        </div>`;
        }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${showJoins ? `
                        <div class="mb-6">
                            <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Joins</h4>
                            <div class="overflow-hidden border border-slate-300 rounded-md mb-3">
                                <table class="min-w-full divide-y divide-slate-300">
                                    <thead class="bg-slate-200">
                                        <tr>
                                            <th class="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Type</th>
                                            <th class="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Left</th>
                                            <th class="px-3 py-2 text-center text-xs font-bold text-slate-700 uppercase tracking-wider">Op</th>
                                            <th class="px-3 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">Right</th>
                                        </tr>
                                    </thead>
                                    <tbody class="bg-white divide-y divide-slate-200">
                                        ${myJoins.map((j: any) => `
                                            <tr class="hover:bg-slate-50">
                                                <td class="px-3 py-2 whitespace-nowrap text-xs text-gray-500 font-mono border-r border-slate-100">${j.JoinType || 'Inner'}</td>
                                                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-700 font-mono">${ExpressionFormatter.colouriseTextHTML((j.DataSource1 ? j.DataSource1 + '.' : '') + (j.Field1 || '?'), variableSet, tableSet)}</td>
                                                <td class="px-3 py-2 whitespace-nowrap text-xs text-gray-400 text-center">=</td>
                                                <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-700 font-mono">${ExpressionFormatter.colouriseTextHTML((j.DataSource2 ? j.DataSource2 + '.' : '') + (j.Field2 || '?'), variableSet, tableSet)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                     ` : ''}

                    <div>
                        <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Columns</h4>
                        ${renderTable(
                            ['Name', 'Type', 'Source'],
            colRows
        )}
                    </div>
                </div>
            </details>
        `;
    }

    private static getList(obj: any): any[] {
        if (!obj) return [];
        return Array.isArray(obj) ? obj : [obj];
    }
}
