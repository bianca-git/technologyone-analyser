
import { db } from '../db';
import { EtlParser } from '../parsers/EtlParser';
import { ExpressionFormatter } from '../formatters/ExpressionFormatter';
import { MermaidGenerator } from './MermaidGenerator';

export class EtlGenerator {

    static generateSummary(flow: any[]) {
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
            if (s.RawType === 'ImportWarehouseData') return `the <strong>${s.Output?.name || 'Warehouse'}</strong>`;
            if (s.RawType === 'ExportToExcel') return `an <strong>Excel file</strong>`;
            if (s.RawType === 'SendEmail') return `<strong>Email</strong> recipients`;
            if (s.RawType === 'SaveText' || s.RawType === 'SaveTextfile') return `a <strong>Text file</strong>`;
            return null;
        };

        const sources = [...new Set(flow.map(getSourceNames).filter(Boolean))];
        const targets = [...new Set(flow.map(getTargetNames).filter(Boolean))];

        const hasCalcs = flow.some(s => s.RawType === 'AddColumn' || s.RawType === 'UpdateColumn' || s.RawType === 'CalculateVariable');
        const hasJoins = flow.some(s => s.RawType === 'JoinTable');
        const hasConditions = flow.some(s => s.RawType === 'Decision' || s.RawType === 'Branch');

        let parts = [];
        if (sources.length > 0) parts.push(`extracts data from <strong>${sources.join(', ')}</strong>`);
        if (hasJoins) parts.push(`combines multiple datasets`);
        if (hasCalcs) parts.push(`performs business calculations`);

        let targetAction = hasConditions ? "and, based on certain conditions, distributes results to " : "and publishes results to ";
        if (targets.length > 0) parts.push(`${targetAction}${targets.join(', ')}`);

        if (parts.length === 0) return "This process performs a sequence of data operations.";
        const narrative = parts.slice(0, -1).join(', ') + (parts.length > 1 ? ' and ' : '') + parts.slice(-1);
        return `This process ${narrative}.`;
    }

    static async generateHtmlView(reportId: number, mode: 'business' | 'technical'): Promise<string> {
        const report = await db.reports.get(reportId);
        if (!report) return '<p class="text-red-500">Report not found</p>';

        const flowData = EtlParser.parseSteps(report.rawSteps, mode);
        const metadata = report.metadata;
        const { executionTree, variables, variableSet, tableSet, stepSet } = flowData;


        // --- Helper: Table Renderer ---
        const renderTable = (headers: string[], rows: any[]) => {
            if (!rows || rows.length === 0) return '';
            const ths = headers.map(h => `<th class="px-4 py-2 text-left text-xs font-bold text-slate-700 uppercase tracking-wider bg-slate-200 border-r border-slate-300 last:border-r-0">${h}</th>`).join('');

            const trs = rows.map(r => {
                const cells = headers.map((_, i) => {
                    let val = r[`Col${i + 1}`] || (i === 0 ? r.Name : r.Value) || '';

                    // Logic Table Rendering Integration
                    if (r.Rules && i === 1) {
                        return `<td class="px-4 py-2 text-sm text-gray-700 font-mono">${ExpressionFormatter.renderLogicTable(r.Rules)}</td>`;
                    }

                    // Apply standard formatting if it's not a logic table
                    if (i === 1 && (headers.includes('Formula') || headers.includes('Value / Expression') || headers.includes('Expression'))) {
                        val = ExpressionFormatter.formatExpression(val, variableSet, tableSet, stepSet);
                    } else {
                        val = ExpressionFormatter.colouriseTextHTML(val, variableSet, tableSet, stepSet);
                    }

                    return `<td class="px-4 py-2 text-sm text-gray-700 ${i === 0 ? 'font-mono' : ''}">${val}</td>`;
                }).join('');
                return `<tr class="border-t border-gray-100 hover:bg-gray-50">${cells}</tr>`;
            }).join('');

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

        const metaGrid = `
            <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6 p-4 bg-white border border-gray-200 rounded-lg text-sm shadow-sm">
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Publisher</span>
                    <span class="font-medium text-gray-800">${metadata.owner || '-'}</span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Version</span>
                    <span class="font-medium text-gray-800">${metadata.version} <span class="text-gray-400 font-normal">(${statusLabel})</span></span>
                </div>
                <div class="md:col-span-1">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Published Date</span>
                    <span class="font-medium text-gray-800">${displayDate}</span>
                </div>
                <div class="md:col-span-2 text-right">
                    <span class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Process ID</span>
                    <span class="font-mono text-gray-500 text-[11px] truncate block">${metadata.id}</span>
                </div>
            </div>
        `;


        // --- Mermaid Chart ---


        // --- Mermaid Chart ---
        let flowChartHtml = '';
        try {
            // Get simplified or detailed syntax
            const mermaidSyntax = MermaidGenerator.getRawSyntax(flowData.executionTree, mode);
            if (mermaidSyntax) {
                // Initialize Mermaid (Client-Side)
                // We inject a small script to render this specific block if needed, or rely on global init.
                // Since this is HTML returned to a container, we need to trigger render or use the <pre class="mermaid"> tag which mermaid auto-scans.
                // We'll use the .mermaid class div which is standard.
                flowChartHtml = `
                    <div class="mt-6 border-t border-slate-200 pt-6">
                        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Process Flow (${mode})</h4>
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
                <p class="text-slate-700 text-lg leading-relaxed italic">
                    "${EtlGenerator.generateSummary(flowData.executionFlow)}"
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
                    <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-blue-200">${mode} VIEW</span>
                </div>
                
                ${metaGrid}
            </div>
            <div class="doc-body space-y-8">
                ${summaryHtml}
        `;

        // --- Section: Variables (Show in both modes, as Parameters are relevant) ---
        if (variables.length > 0) {
            html += `
                <details open class="group">
                    <summary class="flex items-center justify-between cursor-pointer list-none py-3 px-6 -mx-6 bg-slate-100 hover:bg-slate-200 transition-colors select-none border-t border-b border-gray-200">
                        <span class="text-xl font-bold text-slate-800 flex items-center gap-3">
                            <span class="text-slate-500 text-lg">#</span> Variables & Parameters
                        </span>
                    </summary>
                    <div class="pt-4 pb-2 px-2">
                         ${renderTable(
                mode === 'technical' ? ['Variable Name', 'Value / Expression'] : ['Parameter', 'Setting'],
                variables.map((v: any) => ({ Col1: v.Name, Col2: v.Value }))
            )}
                    </div>
                </details>
            `;
        }

        // --- Section: Process Logic ---
        // Heading removed per request ("Process Logic" hidden, content visible)
        html += `
            <div class="pt-4 pb-2 space-y-1 px-2">
        `;

        // --- Recursive Step Renderer ---
        const renderStep = (item: any) => {
            const isGroup = ['Group', 'Loop', 'Decision', 'Branch'].includes(item.RawType);

            // --- Details/Table ---
            let detailsHtml = '';

            // --- I/O Flow Section ---
            if (item.Inputs && item.Inputs.length > 0 || item.Outputs && item.Outputs.length > 0) {
                const inputs = item.Inputs && item.Inputs.length > 0
                    ? `<div class="flex flex-col gap-1"><span class="text-[10px] uppercase font-bold text-slate-400">Inputs</span><div class="flex flex-wrap gap-1">${item.Inputs.map((i: string) => ExpressionFormatter.colouriseTextHTML(i, variableSet, tableSet, stepSet)).join('')}</div></div>`
                    : '';
                const arrow = (item.Inputs && item.Inputs.length > 0 && item.Outputs && item.Outputs.length > 0)
                    ? `<div class="text-slate-300 px-2 flex items-center">➔</div>`
                    : '';
                const outputs = item.Outputs && item.Outputs.length > 0
                    ? `<div class="flex flex-col gap-1"><span class="text-[10px] uppercase font-bold text-slate-400">Outputs</span><div class="flex flex-wrap gap-1">${item.Outputs.map((o: string) => ExpressionFormatter.colouriseTextHTML(o, variableSet, tableSet, stepSet)).join('')}</div></div>`
                    : '';

                detailsHtml += `<div class="mt-2 mb-2 p-2 bg-slate-50 border border-slate-100 rounded flex items-start gap-2">${inputs}${arrow}${outputs}</div>`;
            }

            if (item.Details.length > 0) {
                detailsHtml += `<ul class="mt-2 space-y-1 pl-4 border-l-2 border-gray-100">` +
                    item.Details.map((d: string) => `<li class="text-xs text-gray-600">• ${ExpressionFormatter.colouriseTextHTML(d, variableSet, tableSet, stepSet)}</li>`).join('') +
                    `</ul>`;
            }

            let tableHtml = '';
            // Allow Query and Transformation tables to render in both modes as requested
            if (item.TableData && (mode === 'technical' ||
                ['ImportWarehouseData', 'CreateTable', 'RunDirectQuery', 'RunTableQuery', 'AddColumn', 'UpdateColumn', 'CalculateVariable', 'SetVariable'].includes(item.RawType))) {
                tableHtml += `<div class="mt-3 w-full">${renderTable(item.Headers, item.TableData)}</div>`;
            }

            // --- New: Data Dictionary (Critical for Business & Tech) ---
            if (item.DataDictionary && item.DataDictionary.length > 0) {
                const dictRows = item.DataDictionary.map((d: any) => ({
                    Col1: d.Name,
                    Col2: d.Type,
                    Col3: d.Length || '-',
                    Col4: d.Description || ''
                }));
                const dictHeaders = ["Output Column", "Type", "Length", "Description"];
                tableHtml += `<div class="mt-4 mb-2"><div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Generated Output Schema</div>${renderTable(dictHeaders, dictRows)}</div>`;
            }

            // --- New: Exists Logic (Critical Filter) ---
            // --- New: Exists Logic (Critical Filter) ---
            if (item.ExistsLogic && item.ExistsLogic.length > 0) {
                const existsRows = item.ExistsLogic.map((logic: string) => `<li class="text-sm text-rose-900 font-mono bg-rose-50 px-3 py-2 rounded-md border-l-4 border-rose-500 shadow-sm mb-2 flex items-start gap-2"><span class="text-lg">🌪️</span><div class="flex-1">${ExpressionFormatter.colouriseTextHTML(logic, variableSet, tableSet, stepSet)}</div></li>`).join('');
                tableHtml += `<div class="mt-4 mb-3"><div class="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-2"><span>🛡️</span> Active Filters Applied</div><ul class="list-none pl-0 space-y-2">${existsRows}</ul></div>`;
            }

            // --- Render ---
            // If Group/Loop -> Container with Boundary
            if (isGroup) {
                let childrenHtml = item.children.map((child: any) => renderStep(child)).join('');

                // Container Logic (Group, Loop, Decision, Branch)
                const isLoop = item.RawType === 'Loop';
                const isDecision = item.RawType === 'Decision';
                const isBranch = item.RawType === 'Branch';

                let borderColor = 'border-slate-300';
                let headerColor = 'bg-slate-200';
                let bodyColor = 'bg-slate-50';
                let icon = '◳';
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

                return `
                    <div class="mt-4 mb-4 border-2 rounded-lg ${borderColor} ${bodyColor} overflow-hidden shadow-sm">
                        <div class="px-3 py-2 ${headerColor} border-b-2 ${borderColor} flex items-center justify-between">
                             <div class="flex items-center gap-2">
                                <span class="${iconColor} font-bold font-mono text-lg">${icon}</span>
                                <span class="font-bold text-slate-800 text-sm">${item.Phase}: ${item.Step}</span>
                             </div>
                             ${isLoop && mode === 'business' ? '<span class="text-xs text-amber-700 font-bold px-2 py-0.5 bg-amber-200 rounded-full border border-amber-300">Loop Sequence</span>' : ''}
                        </div>
                        <div class="p-4">
                            <div class="mb-3 text-sm text-gray-700">
                                ${mode === 'technical' ? '<span class="font-bold text-slate-600 text-xs uppercase tracking-wide">Purpose:</span> ' : ''}
                                <span class="font-medium">${ExpressionFormatter.colouriseTextHTML(item.Context, variableSet, tableSet)}</span>
                                ${mode === 'business' && item.SmartDesc ? `<span class="text-xs text-blue-700 font-medium block mt-1 bg-blue-50 p-1 rounded border border-blue-100">💡 ${item.SmartDesc}</span>` : ''}
                            </div>
                            <div class="pl-2 space-y-4">
                                ${childrenHtml}
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- Step Notes UI ---
            const stepNote = report.stepNotes?.[item.id] || '';
            const notesHtml = `
                <div class="step-notes-container mt-2" data-step-id="${item.id}">
                    ${stepNote ? `
                        <div class="relative bg-amber-50 border border-amber-200 p-2 rounded text-xs text-amber-900 group/note mb-2">
                            <div class="flex justify-between items-start">
                                <span class="grow italic whitespace-pre-wrap">${ExpressionFormatter.colouriseTextHTML(stepNote, variableSet, tableSet)}</span>
                                <button onclick="window.editStepNote('${reportId}', '${item.id}')" class="opacity-0 group-hover/note:opacity-100 transition text-amber-600 hover:text-amber-800 ml-2" title="Edit Note">✎</button>
                            </div>
                        </div>
                    ` : `
                        <button onclick="window.editStepNote('${reportId}', '${item.id}')" class="text-[10px] text-slate-400 hover:text-blue-500 flex items-center gap-1 transition-colors mt-1">
                            <span>📝</span> Add Step Note
                        </button>
                    `}
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

            return `
                <div class="relative pl-6 pb-6 border-l-2 border-slate-200 last:border-0 ml-2">
                    <div class="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-slate-300"></div>
                    
                    <div class="flex items-center justify-between flex-wrap gap-2 mb-1">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-800 text-sm">${item.Step}</span>
                            ${mode === 'technical' ? `<span class="text-xs text-slate-400 font-mono">(${item.RawType})</span>` : ''}
                        </div>
                    </div>
                    
                    ${showContext ? `
                    <div class="text-sm text-gray-600 mb-1">
                        ${mode === 'technical' ? '<span class="font-semibold text-emerald-600 text-xs uppercase tracking-wide">Purpose:</span> ' : ''}
                        ${ExpressionFormatter.colouriseTextHTML(item.Context, variableSet, tableSet)}
                        ${mode === 'business' && item.SmartDesc ? `<span class="text-xs text-blue-600 font-medium block mt-1">💡 ${item.SmartDesc}</span>` : ''}
                    </div>` : ''}
                    
                    ${item.Description ? `<div class="text-xs text-slate-500 italic mb-2">Note: ${ExpressionFormatter.colouriseTextHTML(item.Description, variableSet, tableSet)}</div>` : ''}
                    
                    ${notesHtml}
                    ${detailsHtml}
                    ${tableHtml}
                </div>
            `;
        };

        html += executionTree.map((item: any) => renderStep(item)).join('');
        html += `</div></div>`; // Close container div, Close doc-body (removed details)
        return html;
    }

    // Legacy support if needed, but ideally usage should move to EtlParser
    static parseSteps(json: any, mode: 'business' | 'technical') {
        return EtlParser.parseSteps(json, mode);
    }
}
