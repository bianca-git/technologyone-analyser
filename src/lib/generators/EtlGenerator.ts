import { db } from '../db';
import { EtlParser } from '../parsers/EtlParser';
import { ExpressionFormatter } from '../formatters/ExpressionFormatter';
import { MermaidGenerator } from './MermaidGenerator';
import type { EtlSummaryFormatter } from './EtlSummary';
import { extractSourcesAndTargets, buildEtlNarrative } from './EtlSummary';
import type { EtlStep } from '../parsers/types';

/** HTML-flavoured summary formatting (badges, coloured spans) for the on-screen view. */
const htmlSummaryFormatter: EtlSummaryFormatter = {
    table: (name) => `<span class="t1-table-badge" data-type="table">𝄜 ${name}</span>`,
    file: (name) => `<span class="text-green-700">${name}</span>`,
    target: (name) => `<strong>the ${name}</strong>`,
    analyser: (name) => `<span class="text-pink-600">${name}</span>`,
    emailRecipients: () => `<span class="text-amber-700">Email</span> recipients`,
};

export class EtlGenerator {
    static generateSummary(flow: EtlStep[]) {
        const { sources, targets } = extractSourcesAndTargets(flow, htmlSummaryFormatter);
        return buildEtlNarrative(sources, targets, flow);
    }

    static async generateHtmlView(reportId: number): Promise<string> {
        const report = await db.reports.get(reportId);
        if (!report) return '<p class="text-red-500">Report not found</p>';

        const flowData = EtlParser.parseSteps(report.rawSteps);
        const metadata = report.metadata;
        const { executionTree, variables, variableSet, tableSet, stepSet } = flowData;

        // --- Helper: Table Renderer ---
        const renderTable = (headers: string[], rows: any[], rowIds?: string[]) => {
            if (!rows || rows.length === 0) return '';
            const ths = headers
                .map(
                    (h) =>
                        `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`
                )
                .join('');

            const trs = rows
                .map((r, idx) => {
                    const cells = headers
                        .map((_, i) => {
                            let val = r[`Col${i + 1}`] || (i === 0 ? r.Name : r.Value) || '';

                            // Logic Table Rendering Integration
                            if (r.Rules && i === 1) {
                                return `<td class="px-4 py-2 text-sm text-gray-700 font-mono">${ExpressionFormatter.renderLogicTable(r.Rules)}</td>`;
                            }

                            // Apply standard formatting if it's not a logic table
                            if (
                                i === 1 &&
                                (headers.includes('Formula') ||
                                    headers.includes('Value / Expression') ||
                                    headers.includes('Expression'))
                            ) {
                                val = ExpressionFormatter.formatExpression(val, variableSet, tableSet, stepSet);
                            } else {
                                val = ExpressionFormatter.colouriseTextHTML(val, variableSet, tableSet, stepSet);
                            }

                            return `<td class="px-4 py-2 text-sm text-gray-700 ${i === 0 ? 'font-mono' : ''}">${val}</td>`;
                        })
                        .join('');
                    const rowId = rowIds && rowIds[idx] ? ` id="${rowIds[idx]}"` : '';
                    return `<tr class="border-t border-gray-100 hover:bg-gray-50"${rowId}>${cells}</tr>`;
                })
                .join('');

            return `<div class="w-full overflow-hidden border border-slate-300 rounded-md mb-3"><table class="w-full divide-y divide-slate-300"><thead><tr class="bg-slate-200">${ths}</tr></thead><tbody class="bg-white divide-y divide-slate-200">${trs}</tbody></table></div>`;
        };

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

        const statusLabel = metadata.status === 'P' ? 'Published' : 'Draft'; // Handle diverse casing if needed
        const displayDate = formatDate(metadata.dateModified || report.dateAdded.toISOString()); // Fallback to upload date

        // Build metadata grid - 3 columns across, space between, right-aligned col 3
        const hasNotes = !!metadata.narration;
        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Publisher</span>
                    <span class="font-medium text-gray-800">${metadata.owner || '-'}</span>
                </div>
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Version</span>
                    <span class="font-medium text-gray-800">${metadata.version} <span class="text-gray-400 font-normal">(${statusLabel})</span></span>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">T1 Location</span>
                    <span class="font-mono text-gray-600 text-xs">${metadata.parentPath || '-'}</span>
                </div>
                ${
                    hasNotes
                        ? `
                <div>
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Version Notes</span>
                    <span class="text-gray-600 text-xs italic">${metadata.narration}</span>
                </div>
                `
                        : ''
                }
                <div class="${hasNotes ? '' : 'md:col-span-2'}">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Published Date</span>
                    <span class="font-medium text-gray-800">${displayDate}</span>
                </div>
                <div class="text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Process ID</span>
                    <span class="font-mono text-gray-500 text-[11px] truncate inline-block" title="${metadata.id}">${metadata.id}</span>
                </div>
            </div>
        `;

        // --- Mermaid Chart ---

        // --- Mermaid Chart ---
        let flowChartHtml = '';
        try {
            // Get simplified or detailed syntax
            const mermaidSyntax = MermaidGenerator.getRawSyntax(flowData.executionTree);
            if (mermaidSyntax) {
                // Initialize Mermaid (Client-Side)
                // We inject a small script to render this specific block if needed, or rely on global init.
                // Since this is HTML returned to a container, we need to trigger render or use the <pre class="mermaid"> tag which mermaid auto-scans.
                // We'll use the .mermaid class div which is standard.
                flowChartHtml = `
                    <div class="mt-6 border-t border-slate-200 pt-6">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Process Flow</h4>
                        <div class="mermaid flex justify-center bg-white p-4 rounded-lg border border-slate-100 shadow-inner overflow-x-auto min-h-[150px]">
                            ${mermaidSyntax}
                        </div>
                    </div>
                `;
            }
        } catch (e) {
            console.error(e);
        }

        const summaryHtml = `
            <div class="p-6 bg-slate-50 border-l-4 border-slate-400 rounded-r-xl shadow-sm">
                <h3 class="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                    <span class="text-lg">📋</span> Executive Summary
                </h3>
                <p class="text-slate-700 text-lg leading-relaxed">
                    ${EtlGenerator.generateSummary(flowData.executionFlow)}
                </p>
                ${flowChartHtml}
            </div>
        `;

        let html = `
            <div class="doc-header">
                <div class="flex justify-between items-start">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800 tracking-tight">${metadata.name}</h2>
                        ${metadata.description ? `<p class="text-lg text-slate-600 mt-2 leading-relaxed">${metadata.description}</p>` : ''}
                    </div>
                    <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-blue-200">TECHNICAL VIEW</span>
                </div>
                
                ${metaGrid}
            </div>
            <div class="doc-body space-y-8">
                ${summaryHtml}
        `;

        // --- Section: Variables ---
        if (variables.length > 0) {
            const varRows = variables.map((v: any) => {
                const usedSteps = v.UsedIn && v.UsedIn.length > 0 ? v.UsedIn.join(', ') : '-';
                return {
                    Col1: v.Name,
                    Col2: v.Type || 'Var',
                    Col3: v.OriginStep || '-',
                    Col4: v.InitialValue || '-',
                    Col5: v.Value || 'N/A',
                    Col6: usedSteps,
                    id: v.Name ? `var-${v.Name.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '',
                };
            });
            const varIds = varRows.map((r) => r.id || '');
            html += `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors select-none border-t border-b border-gray-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-slate-500 text-lg">#</span> Variables & Parameters
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                          ${renderTable(
                              [
                                  'Variable Name',
                                  'Type',
                                  'Origin Step',
                                  'Initial Value',
                                  'Value / Expression',
                                  'Used In',
                              ],
                              varRows,
                              varIds
                          )}
                    </div>
                </details>
            `;
        }

        // --- Section: Process Parameters (from Variables.xml) ---
        const processParams = this.extractProcessParameters(report.rawVariables);
        if (processParams.length > 0) {
            const resolveVarType = (t: string) => {
                const types: Record<string, string> = { A: 'String', N: 'Numeric', D: 'Date', L: 'List', I: 'Integer' };
                return types[t] || t || 'String';
            };

            // Sort by sequence if available
            const sortedParams = [...processParams].sort((a, b) => {
                const seqA = parseInt(a.Sequence || '999', 10);
                const seqB = parseInt(b.Sequence || '999', 10);
                return seqA - seqB;
            });

            // Build badges for visibility/editability
            const buildBadges = (p: any) => {
                const badges: string[] = [];
                if (p.IsDisplayable === 'false')
                    badges.push(
                        '<span class="text-[9px] bg-slate-200 text-slate-600 px-1 rounded" title="Hidden from UI">Hidden</span>'
                    );
                if (p.IsEditable === 'false')
                    badges.push(
                        '<span class="text-[9px] bg-amber-100 text-amber-700 px-1 rounded" title="Read-only parameter">ReadOnly</span>'
                    );
                if (p.ListType || p.QueryListCriteria)
                    badges.push(
                        '<span class="text-[9px] bg-blue-100 text-blue-700 px-1 rounded" title="Picklist parameter">Picklist</span>'
                    );
                return badges.length > 0 ? ` ${badges.join(' ')}` : '';
            };

            const paramRows = sortedParams.map((p: any) => ({
                Col1: `${p.Name}${buildBadges(p)}`,
                Col2: resolveVarType(p.VariableType),
                Col3: p.DefaultValue || '-',
                Col4: p.Description || '',
                Col5:
                    p.IsMandatory === 'true'
                        ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Required</span>'
                        : '<span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">Optional</span>',
                Col6: p.Sequence || '-',
            }));

            const headers = ['Parameter Name', 'Type', 'Default', 'Description', 'Required', 'Order'];

            const paramRowsWithIds = paramRows.map((p: any) => ({
                ...p,
                id: p.Col1 ? `param-${p.Col1.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/<[^>]*>/g, '')}` : '',
            }));
            const paramIds = paramRowsWithIds.map((p: any) => p.id);
            html += `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-purple-50 hover:bg-purple-100 transition-colors select-none border-t border-b border-purple-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-purple-500 text-lg">⚙</span> Process Parameters
                            <span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">${processParams.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">These parameters can be set when the process is executed:</p>
                        ${renderTable(headers, paramRowsWithIds, paramIds)}
                    </div>
                </details>
            `;
        }

        // --- Section: File Locations (from FileLocations.xml) ---
        const fileLocations = this.extractFileLocations(report.rawFileLocations);
        if (fileLocations.length > 0) {
            const locationRows = fileLocations.map((loc: any) => ({
                Col1: loc.Name,
                Col2: loc.LocationType || 'ServerFolder',
                Col3: loc.ServerFolder || loc.Path || '-',
                Col4: loc.Description || '',
                id: loc.Name ? `loc-${loc.Name.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '',
            }));
            const locationIds = locationRows.map((r: any) => r.id);

            html += `
                <details class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-cyan-50 hover:bg-cyan-100 transition-colors select-none border-t border-b border-cyan-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-cyan-600 text-lg">📁</span> File Locations
                            <span class="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full border border-cyan-200">${fileLocations.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">File paths referenced by this process for reading/writing files:</p>
                        ${renderTable(['Location Name', 'Type', 'Path', 'Description'], locationRows, locationIds)}
                    </div>
                </details>
            `;
        }

        // --- Section: Attachments (from Attachments.xml) ---
        const attachments = this.extractAttachments(report.rawAttachments);
        if (attachments.length > 0) {
            // Infer content type from file extension
            const getContentType = (filename: string, contentType?: string): string => {
                if (contentType) return contentType;
                const ext = (filename || '').split('.').pop()?.toLowerCase() || '';
                const typeMap: Record<string, string> = {
                    sql: 'text/sql',
                    txt: 'text/plain',
                    csv: 'text/csv',
                    xml: 'application/xml',
                    json: 'application/json',
                    xlsx: 'application/vnd.openxmlformats',
                    xls: 'application/vnd.ms-excel',
                    ps1: 'text/powershell',
                    vbs: 'text/vbscript',
                    bat: 'text/batch',
                    html: 'text/html',
                    htm: 'text/html',
                    js: 'text/javascript',
                };
                return typeMap[ext] || 'application/octet-stream';
            };

            const attachmentRows = attachments.map((att: any) => {
                const filename = att.FileName || att.Name || 'Unknown';
                return {
                    Col1: filename,
                    Col2: getContentType(filename, att.ContentType || att.MimeType),
                    Col3: att.Description || '-',
                    Col4: att.FileData ? `${Math.round((att.FileData.length * 0.75) / 1024)} KB` : '-',
                };
            });

            html += `
                <details class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-amber-50 hover:bg-amber-100 transition-colors select-none border-t border-b border-amber-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-amber-600 text-lg">📎</span> Attachments
                            <span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">${attachments.length}</span>
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                        <p class="text-sm text-slate-600 mb-3">Embedded files included with this process (scripts, templates, etc.):</p>
                        ${renderTable(['File Name', 'Content Type', 'Description', 'Size'], attachmentRows)}
                    </div>
                </details>
            `;
        }

        // --- Section: Process Logic (Linked Flow Diagram) ---

        // Classify a token name so chips of the same kind look identical wherever
        // they appear. Tables/warehouse = blue/green, recordset+variable = purple,
        // file = green-file, analyser = purple-diamond. Normalised name is the link key.
        const tokenKind = (name: string, asOutput: boolean): { cls: string; glyph: string } => {
            const n = name.toLowerCase();
            if (n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.xlsx') || n.endsWith('.xls'))
                return { cls: 'flow-tok-file', glyph: '📄' };
            // Recordsets / memory tables / variables flowing between steps.
            // The camelCase variable prefix (vName) is case-SENSITIVE — a lowercase
            // `/i` match here wrongly tagged tables like `vendors` as recordsets.
            if (/^rs|^mem|recordset|memory/i.test(name) || /^[vV][A-Z]/.test(name))
                return { cls: 'flow-tok-rs', glyph: '⬡' };
            return { cls: asOutput ? 'flow-tok-out' : 'flow-tok-table', glyph: '▦' };
        };

        const tokenChip = (rawName: string, role: 'producer' | 'consumer', asOutput: boolean): string => {
            const name = (rawName || '').trim();
            const placeholder = name.toUpperCase();
            if (!name || placeholder === 'DATA' || placeholder === 'DATASET' || placeholder === 'TARGET') return '';
            const key = name.toUpperCase().replace(/\s+/g, ' ');
            const { cls, glyph } = tokenKind(name, asOutput);
            return `<span class="flow-tok ${cls}" data-token="${ExpressionFormatter.escapeHtml(key)}" data-role="${role}"><span class="opacity-60">${glyph}</span> ${ExpressionFormatter.escapeHtml(name)}</span>`;
        };

        // A connector that carries the named data down the spine (only emitted when
        // there is data to carry — otherwise a plain arrow).
        const wire = (carriedHtml?: string): string =>
            `<div class="flow-wire">${carriedHtml ? carriedHtml : ''}<span class="flow-head">▼</span></div>`;

        // The in → out token row for a single step.
        const ioRow = (item: any): string => {
            const ins = (item.Inputs || []).map((i: string) => tokenChip(i, 'consumer', false)).filter(Boolean);
            const outs = (item.Outputs || []).map((o: string) => tokenChip(o, 'producer', true)).filter(Boolean);
            if (ins.length === 0 && outs.length === 0) return '';
            const inPart = ins.length ? `<span class="text-slate-400">in</span> ${ins.join(' ')}` : '';
            const outPart = outs.length ? `<span class="text-slate-400">out</span> ${outs.join(' ')}` : '';
            const arrow = ins.length && outs.length ? `<span class="text-slate-300">→</span>` : '';
            return `<div class="flex items-center gap-1.5 text-xs flex-wrap mb-2">${inPart} ${arrow} ${outPart}</div>`;
        };

        html += `
            <div class="flow-spine flex flex-col items-center pt-4 pb-2 px-2">
        `;

        // Source pills at the top of the spine (always shown; placeholder if none).
        const { sources, targets } = extractSourcesAndTargets(flowData.executionFlow, {
            table: (n) => n,
            file: (n) => n,
            target: (n) => n,
            analyser: (n) => n,
            emailRecipients: () => 'Email recipients',
        });
        const sourcePills = sources.length
            ? sources
                  .map((s) => tokenChip(s, 'producer', false))
                  .filter(Boolean)
                  .join(' ')
            : `<span class="flow-tok flow-tok-empty">none · generated internally</span>`;
        html += `
            <div class="flow-node text-center">
                <div class="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Sources</div>
                <div class="flex gap-2 flex-wrap justify-center max-w-2xl">${sourcePills}</div>
            </div>
            ${wire()}
        `;

        // --- Recursive Step Renderer ---
        const renderStep = (item: any) => {
            const isGroup = ['Group', 'Loop', 'Decision', 'Branch'].includes(item.RawType);

            // --- Details/Table ---
            let detailsHtml = '';

            // Separate filters from other details for prominent display
            const filters = item.Details.filter(
                (d: string) => d.startsWith('Filter:') || d.startsWith('Extended Criteria:')
            );
            const otherDetails = item.Details.filter(
                (d: string) => !d.startsWith('Filter:') && !d.startsWith('Extended Criteria:')
            );

            if (otherDetails.length > 0) {
                detailsHtml +=
                    `<ul class="mt-2 space-y-1 pl-4 border-l-2 border-gray-100">` +
                    otherDetails
                        .map(
                            (d: string) =>
                                `<li class="text-xs text-gray-600">• ${ExpressionFormatter.colouriseTextHTML(d, variableSet, tableSet, stepSet)}</li>`
                        )
                        .join('') +
                    `</ul>`;
            }

            // Display filters prominently in a dedicated section
            if (filters.length > 0) {
                const filterRows = filters
                    .map((f: string) => {
                        const filterText = f.replace(/^(Filter:|Extended Criteria:)\s*/, '');
                        return `<li class="text-sm text-amber-900 font-mono bg-amber-50 px-3 py-2 rounded-md  text-align-middle my-auto mt-2 border-l-4 border-amber-500 shadow-sm mb-2 flex items-start gap-2"><span class="text-lg">🔍</span><div class="flex-1">${ExpressionFormatter.colouriseTextHTML(filterText, variableSet, tableSet, stepSet)}</div></li>`;
                    })
                    .join('');
                detailsHtml += `<ul class="list-none pl-0 text-align-middle my-auto">${filterRows}</ul>`;
            }

            let tableHtml = '';
            // Allow all tables to render
            if (item.TableData && item.TableData.length) {
                tableHtml += `<div class="mt-3 w-full">${renderTable(item.Headers, item.TableData)}</div>`;
            }

            // --- New: Data Dictionary (Critical for Business & Tech) ---
            if (item.DataDictionary && item.DataDictionary.length > 0) {
                const dictRows = item.DataDictionary.map((d: any) => ({
                    Col1: d.Name,
                    Col2: d.Type,
                    Col3: d.Length || '-',
                    Col4: d.Description || '',
                }));
                const dictHeaders = ['Output Column', 'Type', 'Length', 'Description'];
                tableHtml += `<div class="mt-4 mb-2"><div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Generated Output Schema</div>${renderTable(dictHeaders, dictRows)}</div>`;
            }

            // --- New: Exists Logic (Critical Filter) ---
            // --- New: Exists Logic (Critical Filter) ---
            if (item.ExistsLogic && item.ExistsLogic.length > 0) {
                const existsRows = item.ExistsLogic.map(
                    (logic: string) =>
                        `<li class="text-sm text-rose-900 font-mono bg-rose-50 px-3 py-2 rounded-md border-l-4 border-rose-500 shadow-sm mb-2 flex items-start gap-2"><span class="text-lg">🌪️</span><div class="flex-1">${ExpressionFormatter.colouriseTextHTML(logic, variableSet, tableSet, stepSet)}</div></li>`
                ).join('');
                tableHtml += `<div class="mt-4 mb-3"><div class="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-2"><span>🛡️</span> Active Criteria Applied</div><ul class="list-none pl-0 space-y-2">${existsRows}</ul></div>`;
            }

            // --- Render ---
            // If Group/Loop -> Container with Boundary
            if (isGroup) {
                let childrenHtml = renderFlow(item.children || []);

                // Container Logic (Group, Loop, Decision, Branch)
                const isLoop = item.RawType === 'Loop';
                const isDecision = item.RawType === 'Decision';
                const isBranch = item.RawType === 'Branch';

                let borderColor = 'border-slate-300';
                let headerColor = 'bg-slate-200';
                let bodyColor = 'bg-slate-50';
                let icon = '🗳️';
                let iconColor = 'text-slate-500';

                if (isLoop) {
                    borderColor = 'border-amber-400';
                    headerColor = 'bg-amber-100';
                    bodyColor = 'bg-amber-50/50';
                    icon = '↻';
                    iconColor = 'text-amber-600';
                } else if (isDecision) {
                    borderColor = 'border-violet-400';
                    headerColor = 'bg-violet-100';
                    bodyColor = 'bg-violet-50/50';
                    icon = '❓';
                    iconColor = 'text-violet-600';
                } else if (isBranch) {
                    borderColor = 'border-blue-300';
                    headerColor = 'bg-blue-100';
                    bodyColor = 'bg-blue-50/50';
                    icon = '↳';
                    iconColor = 'text-blue-600';
                }

                const stepId = item.id || item.StepId || '';
                const stepAnchorId = stepId ? `step-${stepId.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
                return `
                    <div class="flow-node w-full max-w-lg mt-1 mb-1 border-2 rounded-xl ${borderColor} ${bodyColor} overflow-hidden shadow-sm"${stepAnchorId ? ` id="${stepAnchorId}"` : ''}>
                        <details class="group" open>
                            <summary class="cursor-pointer list-none px-3 py-2 ${headerColor} border-b-2 ${borderColor} flex items-center justify-between hover:opacity-90">
                                 <div class="flex items-center gap-2">

                                     <span class="${iconColor} font-bold font-mono text-lg">${icon}</span>
                                     <span class="font-bold text-slate-800 text-sm">${item.Phase}: ${item.Step}</span>
                                 </div>

                            </summary>
                            <div class="p-4">
                                <div class="mb-3 text-sm text-gray-700">
                                    ${ExpressionFormatter.colouriseTextHTML(item.Context, variableSet, tableSet)}
                                    ${item.SmartDesc ? `<span class="text-xs text-blue-700 font-medium block mt-1 bg-blue-50 p-1 rounded border border-blue-100">💡 ${ExpressionFormatter.escapeHtml(item.SmartDesc)}</span>` : ''}
                                </div>
                                <div class="flow-spine flex flex-col items-center">
                                    ${childrenHtml}
                                </div>
                            </div>
                        </details>
                    </div>
                `;
            }

            // --- Step Notes UI ---
            const stepNote = report.stepNotes?.[item.id] || '';
            const notesHtml = `
                <div class="step-notes-container mt-2" data-step-id="${item.id}">
                    ${
                        stepNote
                            ? `
                        <div class="relative bg-amber-50 border border-amber-200 p-2 rounded text-xs text-amber-900 group/note mb-2">
                            <div class="flex justify-between items-start">
                                <span class="grow italic whitespace-pre-wrap">${ExpressionFormatter.colouriseTextHTML(stepNote, variableSet, tableSet)}</span>
                                <button onclick="window.editStepNote('${reportId}', '${item.id}')" class="opacity-0 group-hover/note:opacity-100 transition text-amber-600 hover:text-amber-800 ml-2" title="Edit Note">✎</button>
                            </div>
                        </div>
                    `
                            : `
                        <button onclick="window.editStepNote('${reportId}', '${item.id}')" class="text-[10px] text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors mt-1">
                            <span>📝</span> Add Step Note
                        </button>
                    `
                    }
                    <div id="note-editor-${item.id}" class="hidden mt-2">
                        <textarea class="w-full text-xs p-2 border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-h-[60px]" placeholder="Add your technical or business notes here...">${stepNote}</textarea>
                        <div class="flex justify-end gap-2 mt-1">
                            <button onclick="window.cancelNote('${item.id}')" class="text-[10px] text-gray-500 hover:text-gray-700">Cancel</button>
                            <button onclick="window.saveStepNote('${reportId}', '${item.id}')" class="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">Save Note</button>
                        </div>
                    </div>
                </div>
            `;

            // Standard Step
            const showContext = item.Context && item.Context !== item.RawType;
            const filenameClass =
                item.RawType === 'ExportToExcel' ||
                item.RawType === 'SaveText' ||
                item.RawType === 'SaveTextfile' ||
                item.RawType === 'LoadTextFile' ||
                item.RawType === 'SendEmail'
                    ? 'filename-orange'
                    : '';
            const filenameIcon =
                item.RawType === 'ExportToExcel'
                    ? '📊'
                    : item.RawType === 'SaveText' || item.RawType === 'SaveTextfile'
                      ? '📦'
                      : item.RawType === 'LoadTextFile'
                        ? '📄'
                        : item.RawType === 'SendEmail'
                          ? '📧'
                          : item.RawType === 'Script' || item.RawType === 'ExecuteScript'
                            ? '📜'
                            : item.RawType === 'StartProcess' || item.RawType === 'RunProcess'
                              ? '▶'
                              : item.RawType === 'DTS' || item.RawType === 'ExecuteDTS' || item.RawType === 'RunDTS'
                                ? '🔀'
                                : item.Icon || '';
            const stepId = item.id || item.StepId || '';
            const stepAnchorId = stepId ? `step-${stepId.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';

            return `
                <details class="flow-node step-collapse w-full max-w-lg rounded-xl border-2 border-slate-200 bg-white shadow-sm"${stepAnchorId ? ` id="${stepAnchorId}"` : ''}>
                    <summary class="cursor-pointer list-none flex items-center justify-between flex-wrap gap-2 p-3 hover:bg-slate-50 rounded-xl transition-colors">
                        <span class="font-bold text-slate-800 text-sm">${item.Step}</span>
                        <span class="text-xs text-slate-400 font-mono">${filenameIcon ? `<span class="${filenameClass}">${filenameIcon} </span>` : ''}(${item.RawType})</span>
                    </summary>

                    <div class="step-content px-3 pb-3 -mt-1">
                        ${ioRow(item)}
                        ${
                            showContext
                                ? `
                        <div class="text-sm text-gray-600 mb-1">
                            ${ExpressionFormatter.colouriseTextHTML(item.Context, variableSet, tableSet)}
                            ${item.SmartDesc ? `<span class="text-xs text-blue-600 font-medium block mt-1">💡 ${ExpressionFormatter.escapeHtml(item.SmartDesc)}</span>` : ''}
                        </div>`
                                : ''
                        }

                        ${item.Description ? `<div class="text-xs text-slate-500 italic mb-2">Note: ${ExpressionFormatter.colouriseTextHTML(item.Description, variableSet, tableSet)}</div>` : ''}

                        ${this.renderStepTechnicalDetails(item)}
                        ${notesHtml}
                        ${detailsHtml}
                        ${tableHtml}
                    </div>
                </details>
            `;
        };

        // Interleave nodes with carried-data wires. Each wire carries the data that
        // hands off from one step's Output to the next — emitted only when present,
        // so the spine literally shows producer → consumer between steps.
        const renderFlow = (items: any[]): string => {
            return items
                .map((item: any, idx: number) => {
                    const nodeHtml = renderStep(item);
                    if (idx === items.length - 1) return nodeHtml;
                    // Carried data = this step's outputs (what flows down to the next node).
                    const carried = (item.Outputs || [])
                        .map((o: string) => tokenChip(o, 'consumer', true))
                        .filter(Boolean)
                        .join(' ');
                    return nodeHtml + wire(carried || undefined);
                })
                .join('');
        };

        html += renderFlow(executionTree);

        // Target pills at the bottom of the spine (always shown; placeholder if none).
        // extractSourcesAndTargets decorates file targets with " (Excel)" / " (Text
        // file)" suffixes; strip them so the pill's token key matches the bare
        // filename used in step Outputs, keeping hover-to-trace lineage intact.
        const targetPills = targets.length
            ? targets
                  .map((t) => tokenChip(t.replace(/\s*\((?:Excel|Text file)\)$/i, ''), 'consumer', true))
                  .filter(Boolean)
                  .join(' ')
            : `<span class="flow-tok flow-tok-empty">none · no table output</span>`;
        html += `
            ${wire()}
            <div class="flow-node text-center">
                <div class="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Targets</div>
                <div class="flex gap-2 flex-wrap justify-center max-w-2xl">${targetPills}</div>
            </div>
        `;

        html += `</div></div>`; // Close flow-spine, Close doc-body
        return html;
    }

    // Legacy support if needed, but ideally usage should move to EtlParser
    static parseSteps(json: any) {
        return EtlParser.parseSteps(json); // mode dropped; only technical view remains
    }

    // --- Helper: Extract Process Parameters from Variables.xml ---
    private static extractProcessParameters(rawVariables: any): any[] {
        if (!rawVariables) return [];

        // Handle various XML structures
        const vars =
            rawVariables?.ArrayOfC2GenericVariable?.C2GenericVariable ||
            rawVariables?.ArrayOfVariableDef?.VariableDef ||
            rawVariables?.C2GenericVariable ||
            rawVariables?.VariableDef;

        if (!vars) return [];
        return Array.isArray(vars) ? vars : [vars];
    }

    // --- Helper: Extract File Locations from FileLocations.xml ---
    private static extractFileLocations(rawFileLocations: any): any[] {
        if (!rawFileLocations) return [];

        const locations = rawFileLocations?.ArrayOfFileLocation?.FileLocation || rawFileLocations?.FileLocation;

        if (!locations) return [];

        const list = Array.isArray(locations) ? locations : [locations];

        // Flatten nested Definition fields if present
        return list.map((loc: any) => {
            const def = loc.Definition || {};
            return {
                Name: loc.Name || loc.Description || 'Unknown',
                LocationType: loc.LocationType || 'ServerFolder',
                ServerFolder: def.ServerFolder || def.Path || loc.ServerFolder || '',
                SubPath: def.SubPath || '',
                Description: loc.Description || '',
                Path: def.ServerFolder ? `${def.ServerFolder}${def.SubPath || ''}` : loc.Path || '',
            };
        });
    }

    // --- Helper: Extract Attachments from Attachments.xml ---
    private static extractAttachments(rawAttachments: any): any[] {
        if (!rawAttachments) return [];

        const attachments =
            rawAttachments?.ArrayOfAttachment?.Attachment ||
            rawAttachments?.ArrayOfProcessAttachment?.ProcessAttachment ||
            rawAttachments?.Attachment ||
            rawAttachments?.ProcessAttachment;

        if (!attachments) return [];
        return Array.isArray(attachments) ? attachments : [attachments];
    }

    // --- Helper: Render Technical Details for a Step (IDs, Operational Settings) ---
    private static renderStepTechnicalDetails(item: any): string {
        const details: string[] = [];

        // Step identifiers (useful for debugging/correlation)
        if (item.StepId) {
            details.push(`<span class="text-slate-400">ID:</span> <span class="font-mono">${item.StepId}</span>`);
        }
        if (item.Sequence) {
            details.push(`<span class="text-slate-400">Seq:</span> ${item.Sequence}`);
        }

        // Operational settings - only show if set and non-default
        const ops: string[] = [];
        if (item.ErrorHandling && item.ErrorHandling !== 'Continue') {
            ops.push(`<span title="Error Handling">⚠ ${item.ErrorHandling}</span>`);
        }
        if (item.RetryCount && item.RetryCount !== '0') {
            ops.push(`<span class="text-blue-600" title="Retry Count">↻ ${item.RetryCount}x</span>`);
        }
        if (item.Timeout && item.Timeout !== '0') {
            ops.push(`<span class="text-amber-600" title="Timeout (seconds)">⏱ ${item.Timeout}s</span>`);
        }
        if (item.TransactionMode && item.TransactionMode !== 'false' && item.TransactionMode !== 'None') {
            ops.push(`<span class="text-green-600" title="Transaction Mode">⛁ Txn</span>`);
        }
        if (item.MaxRows && item.MaxRows !== '0') {
            ops.push(`<span class="text-purple-600" title="Max Rows Limit">⤓ Max ${item.MaxRows}</span>`);
        }
        if (item.DistinctRows === 'true' || item.DistinctRows === 'True') {
            ops.push(`<span class="text-teal-600" title="Distinct Rows">◈ Distinct</span>`);
        }
        if (item.UseCache === 'true' || item.UseCache === 'True') {
            ops.push(`<span class="text-cyan-600" title="Using Cache">⚡ Cached</span>`);
        }

        // Only render if we have something to show
        if (details.length === 0 && ops.length === 0) {
            return '';
        }

        let html = '<div class="flex flex-wrap items-center gap-3 text-[10px] mt-1 mb-2">';

        if (details.length > 0) {
            html += `<span class="text-slate-400">${details.join(' | ')}</span>`;
        }

        if (ops.length > 0) {
            html += `<span class="flex gap-2 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">${ops.join(' ')}</span>`;
        }

        html += '</div>';
        return html;
    }
}
