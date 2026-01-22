
export type LogicRule = { outcome: string, condition: string };

export class EtlParser {

    static getListSafe(obj: any, key: string): any[] {
        if (!obj || !obj[key]) return [];
        const val = obj[key];
        return Array.isArray(val) ? val : [val];
    }

    static getTextSafe(val: any): string {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (val['#text']) return val['#text'];
        return JSON.stringify(val); // Fallback
    }

    // --- Core Logic Flattening ---
    /**
     * Flattens nested IIF statements into a linear list of LogicRules.
     * Returns null if the expression is not a valid IIF chain.
     */
    static flattenLogic(expr: string): LogicRule[] | null {
        if (!expr || !expr.includes('IIF(')) return null;

        const rules: LogicRule[] = [];
        const parseChain = (text: string): boolean => {
            const iifRegex = /^\s*IIF\s*\(/i;
            const match = iifRegex.exec(text);
            if (!match) return false;

            let open = 1;
            let start = match.index + match[0].length;
            let args = [];
            let lastArgStart = start;

            for (let i = start; i < text.length; i++) {
                const char = text[i];
                if (char === '(') open++;
                else if (char === ')') {
                    open--;
                    if (open === 0) {
                        args.push(text.substring(lastArgStart, i));
                        break;
                    }
                }
                else if (char === ',' && open === 1) {
                    args.push(text.substring(lastArgStart, i));
                    lastArgStart = i + 1;
                }
            }

            if (args.length !== 3) return false;

            const [cond, truePart, falsePart] = args.map(a => a.trim());
            rules.push({ outcome: truePart, condition: cond });

            if (iifRegex.test(falsePart)) {
                const isChain = parseChain(falsePart);
                if (!isChain) {
                    rules.push({ outcome: falsePart, condition: 'Default - When nothing fits the above cases' });
                }
            } else {
                rules.push({ outcome: falsePart, condition: 'Default - When nothing fits the above cases' });
            }
            return true;
        };

        // Attempt parse
        let success = false;
        try {
            success = parseChain(expr.trim());
        } catch (e) { success = false; }

        return (success && rules.length > 0) ? rules : null;
    }

    static inferLoopPurpose(step: any): string {
        const children = step.children || [];
        const types = children.map((c: any) => c.StepType);
        if (types.includes('RunDirectQuery') || types.includes('RunTableQuery')) return "Fetching detailed data for each item";
        if (types.includes('ImportWarehouseData')) return "Saving results for each item";
        if (types.includes('CalculateVariable')) return "Participating in complex calculations";
        return "Processing items in batch";
    }

    static extractCriteria(storage: any): string[] {
        const locations = [
            storage.Criteria, 
            storage.WarehouseCriteria, 
            storage.SourceCriteria,
            storage.FilterCriteria,
            storage.WhereCriteria
        ];
        const results: string[] = [];
        
        locations.forEach(loc => {
            if (!loc) return;
            
            // Handle CriteriaSetItem structure (nested criteria)
            if (loc.CriteriaSetItem) {
                this.processCriteriaSet(loc.CriteriaSetItem, results);
            }
            // Handle direct CriteriaValues
            else if (loc.CriteriaValues?.CriteriaValue) {
                const cv = loc.CriteriaValues.CriteriaValue;
                const list = Array.isArray(cv) ? cv : [cv];
                list.forEach((c: any) => {
                    const col = this.getTextSafe(c.ColumnId);
                    const op = this.getTextSafe(c.Operator?.Value || c.Operator) || '=';
                    const val1 = this.getTextSafe(c.Value1);
                    const val2 = this.getTextSafe(c.Value2);
                    if (col) {
                        let filterStr = `${col} ${op} ${val1}`;
                        if (val2 && (op.toLowerCase().includes('between'))) {
                            filterStr += ` AND ${val2}`;
                        }
                        results.push(filterStr);
                    }
                });
            } 
            // Handle string criteria
            else if (typeof loc.CriteriaValues === 'string' && loc.CriteriaValues.trim() !== "") {
                results.push(loc.CriteriaValues);
            }
            // Handle direct string value
            else if (typeof loc === 'string' && loc.trim() !== "") {
                results.push(loc);
            }
        });
        
        return results;
    }

    // Helper to recursively process nested criteria sets
    private static processCriteriaSet(criteriaSet: any, results: string[]): void {
        if (!criteriaSet) return;
        
        const sets = Array.isArray(criteriaSet) ? criteriaSet : [criteriaSet];
        sets.forEach((set: any) => {
            // Process CriteriaValues in this set
            if (set.CriteriaValues?.CriteriaValue) {
                const cv = set.CriteriaValues.CriteriaValue;
                const list = Array.isArray(cv) ? cv : [cv];
                list.forEach((c: any) => {
                    const col = this.getTextSafe(c.ColumnId);
                    const op = this.getTextSafe(c.Operator?.Value || c.Operator) || '=';
                    const val1 = this.getTextSafe(c.Value1);
                    const val2 = this.getTextSafe(c.Value2);
                    if (col) {
                        let filterStr = `${col} ${op} ${val1}`;
                        if (val2 && (op.toLowerCase().includes('between'))) {
                            filterStr += ` AND ${val2}`;
                        }
                        results.push(filterStr);
                    }
                });
            }
            
            // Recurse into nested sets
            if (set.NestedSets?.CriteriaSetItem) {
                this.processCriteriaSet(set.NestedSets.CriteriaSetItem, results);
            }
        });
    }

    static getExplicitOutput(stepType: string, storage: any, _step: any) {
        const target = this.getTextSafe(storage.OutputTableName || storage.TableName || storage.VariableName);
        switch (stepType) {
            case 'ImportWarehouseData': return { type: 'WAREHOUSE', name: target };
            case 'JoinTable': return { type: 'TABLE', name: target };
            case 'CreateTable': return { type: 'TABLE', name: target };
            case 'AppendTable': return { type: 'TABLE', name: this.getTextSafe(storage.AppendToTableName) };
            case 'SetVariable': return { type: 'VAR', name: target };
            case 'CalculateVariable': return { type: 'VAR', name: target };
            case 'Loop': return { type: 'ITERATOR', name: this.getTextSafe(storage.InputVariable) };
            default: return null;
        }
    }

    /**
     * Main Parsing Method
     * Returns a structured execution tree with metadata, variable usage, and logic rules pre-calculated.
     */
    static parseSteps(json: any, mode: 'business' | 'technical' = 'technical') {
        let stepsRaw = this.getListSafe(json?.ArrayOfStep, 'Step');
        const stepMap = new Map();
        const rootSteps: any[] = [];
        stepsRaw.forEach((step: any) => { step.children = []; stepMap.set(step.StepId, step); });
        stepsRaw.forEach((step: any) => {
            const parentId = parseInt(step.ParentStepId) || 0;
            if (parentId !== 0 && stepMap.has(parentId)) stepMap.get(parentId).children.push(step);
            else rootSteps.push(step);
        });

        const sortSteps = (list: any[]) => {
            list.sort((a, b) => (parseInt(a.Sequence) || 999) - (parseInt(b.Sequence) || 999));
            list.forEach(item => sortSteps(item.children));
        };
        sortSteps(rootSteps);

        const variables = new Map<string, { Name: string, Value: string, Type: string, OriginStep: string, OriginType: string, InitialValue: string, SetValueStep?: string, UsedIn: string[] }>();
        const variableNames = new Set<string>();
        const tableNames = new Set<string>();
        const stepOutputs = new Set<string>();

        const setVariableValue = (name: string, value: string, step?: string) => {
            if (!variables.has(name)) {
                variables.set(name, { Name: name, Value: value, Type: '', OriginStep: step || '', OriginType: '', InitialValue: value, UsedIn: [] });
            } else if (step) {
                const existing = variables.get(name);
                if (existing) {
                    existing.SetValueStep = step;
                    existing.Value = value;
                }
            }
        };

        // 1. Collect Variables & Initial Table Names
        stepsRaw.forEach((step: any) => {
            const type = step.StepType;
            const storage = step.Definition?.StorageObject || {};

            // Collect Table Names
            [
                storage.TableName, storage.InputTableName, storage.OutputTableName,
                storage.JoinTable1, storage.JoinTable2, storage.AppendToTableName,
                storage.ExportMemoryTableName, storage.MemoryTableName,
                storage.FilterTableName, step.OutputTableName
            ].forEach(name => {
                if (name && typeof name === 'string' && name.trim().length > 0 && name !== 'dataset' && name !== 'target') {
                    tableNames.add(name.trim());
                }
            });

            if (type === 'SetVariable' || type === 'CalculateVariable') {
                const vName = this.getTextSafe(storage.VariableName);
                const vValue = this.getTextSafe(storage.VariableValue || storage.Expression) || '';
                setVariableValue(vName, vValue, step.Name);
                variableNames.add(vName);
            }

            // Generic Output Capture
            [storage.OutputVariable, storage.ResultVariable].forEach(name => {
                if (name && typeof name === 'string' && name.trim().length > 0) {
                    stepOutputs.add(name.trim());
                }
            });

            if (type === 'LoadTextFile') {
                // LoadTextFile outputs a string [DATA] 
                // Only add if not captured by generic OutputVariable
                if (!storage.OutputVariable && !storage.ResultVariable) {
                    stepOutputs.add('DATA');
                }
            }

            if (type === 'Loop' && storage.InputVariable) {
                const vName = this.getTextSafe(storage.InputVariable);
                setVariableValue(vName, 'Loop Condition', step.Name);
                variableNames.add(vName);
            }
        });

        // 2. Variable Usage
        const variableUsage = new Map<string, string[]>();
        const registerUsage = (text: string, stepName: string) => {
            variableNames.forEach(v => {
                if (text.includes(v)) {
                    const existing = variableUsage.get(v) || [];
                    if (!existing.includes(stepName)) existing.push(stepName);
                    variableUsage.set(v, existing);
                }
            });
        };

        stepsRaw.forEach((step: any) => {
            const storage = step.Definition?.StorageObject || {};
            registerUsage(JSON.stringify(storage), this.getTextSafe(step.Name));
        });

        const columnMetadata = new Map<string, { Type: string, Source: string, Origin: string }>();
        const registerMetadata = (columns: any[], originStep: string, type: 'Query' | 'Calc' | 'Table') => {
            if (!columns) return;
            const cols = Array.isArray(columns) ? columns : [columns];
            cols.forEach(c => {
                const name = this.getTextSafe(c.ColumnName);
                if (!name) return;
                const dataType = this.getTextSafe(c.ColumnType?.['#text'] || c.ColumnType || c.ColumnDataType || c.DataType || 'String');
                let source = '';
                if (type === 'Query') source = this.getTextSafe(c.ColumnSource);
                else if (type === 'Calc') source = this.getTextSafe(c.Expression);
                else source = 'Table Definition';
                columnMetadata.set(name, { Type: dataType, Source: source, Origin: originStep });
            });
        };

        const executionFlow: any[] = [];
        const traverse = (step: any, depth: number): any => {
            const stepType = step.StepType;
            let isActive = step.IsActive !== false;
            // Decisions and Branches are structural logic, so we treat them as active even if marked inactive in XML
            if (stepType === 'Decision' || stepType === 'Branch') isActive = true;
            const storage = step.Definition?.StorageObject || {};
            const stepName = this.getTextSafe(step.Name);

            // Metadata Registration
            if (isActive) {
                if (stepType === 'RunDirectQuery' || stepType === 'RunTableQuery') registerMetadata(this.getListSafe(storage.Columns, 'ColumnItem'), stepName, 'Query');
                else if (stepType === 'AddColumn' || stepType === 'UpdateColumn') registerMetadata(this.getListSafe(storage.Columns, 'ColumnItemDef'), stepName, 'Calc');
                else if (stepType === 'CreateTable') registerMetadata(this.getListSafe(step.OutputTableDefinition?.Columns, 'ColumnItem'), stepName, 'Table');
            }

            // Smart Desc
            let smartDesc = '';
            if (stepType === 'Loop') smartDesc = this.inferLoopPurpose(step);
            if (stepType === 'SetVariable' || stepType === 'CalculateVariable') {
                const vName = this.getTextSafe(step.Definition?.StorageObject?.VariableName);
                const usedIn = variableUsage.get(vName);
                if (usedIn && usedIn.length > 0) {
                    smartDesc = `Used in: ${usedIn.join(', ')}`;
                }
            }

            // Business Filtering
            if (mode === 'business') {
                const ignore = ['PurgeTable', 'CreateTable', 'DeleteTable'];
                if (!isActive || ignore.includes(stepType)) {
                    if (stepType !== 'Loop' && stepType !== 'Group' && stepType !== 'Decision' && stepType !== 'Branch') return null;
                }
            }

            const description = this.getTextSafe(step.Description || step.Narration || step.Comments);

            // Build Context String (Simplified for Parser, Formatter can enhance)
            // We'll define a simpler context here, delegating formatting to View
            const stepNameDisplay = stepName;
            let contextText = stepType;
            const table = this.getTextSafe(storage.TableName || storage.InputTableName || 'dataset');
            const target = this.getTextSafe(storage.OutputTableName || storage.TableName || 'target');

            // Replicating basic context string logic (without HTML formatting)
            if (mode === 'business') {
                switch (stepType) {
                    case 'RunDirectQuery': contextText = `${stepNameDisplay} (from ${table})`; break;
                    case 'RunTableQuery': contextText = stepNameDisplay; break;
                    case 'AddColumn': contextText = `${stepNameDisplay} (in ${table})`; break;
                    case 'UpdateColumn': contextText = `${stepNameDisplay} (in ${table})`; break;
                    case 'ImportWarehouseData': contextText = stepNameDisplay; break;
                    case 'DeleteWarehouseData': contextText = `${stepNameDisplay} (from ${target})`; break;
                    case 'JoinTable': contextText = `${stepNameDisplay} (with ${this.getTextSafe(storage.JoinTable2)})`; break;
                    case 'Loop': contextText = `${stepNameDisplay} (iterate ${this.getTextSafe(storage.InputVariable)})`; break;
                    default: contextText = stepNameDisplay;
                }

            } else {
                switch (stepType) {
                    case 'RunDirectQuery': contextText = `${stepNameDisplay}: pull ${table}`; break;
                    case 'RunTableQuery': contextText = `${stepNameDisplay}: read ${table}`; break;
                    case 'RunDatasourceQuery':
                    case 'RunSimpleQuery': contextText = `${stepNameDisplay}: ${this.getTextSafe(storage.DatasourceName || 'Datasource')} ➔ ${target}`; break;
                    case 'AddColumn': contextText = `${stepNameDisplay}: calculate in ${table}`; break;
                    case 'UpdateColumn': contextText = `${stepNameDisplay}: update values in ${table}`; break;
                    case 'ImportWarehouseData': contextText = `${stepNameDisplay}: publish to ${target}`; break;
                    case 'DeleteWarehouseData': contextText = `${stepNameDisplay}: remove from ${target}`; break;
                    case 'JoinTable': contextText = `${stepNameDisplay}: combine with ${this.getTextSafe(storage.JoinTable2)}`; break;
                    case 'Loop': contextText = `${stepNameDisplay}: iterate ${this.getTextSafe(storage.InputVariable)}`; break;
                    // New Support
                    case 'ExportToExcel': {
                        const filename = this.getTextSafe(storage.ExportMemoryTableName || table);
                        const path = this.getTextSafe(storage.FileName || '');
                        const pathPart = path ? ` (${path})` : '';
                        contextText = `${stepNameDisplay}: export ${filename} to Excel${pathPart}`;
                        break;
                    }
                    case 'SendEmail': contextText = `${stepNameDisplay}: send to ${this.getTextSafe(storage.SendTo)}`; break;
                    case 'LoadTextFile': {
                        const filename = this.getTextSafe(storage.FileName || '');
                        const path = this.getTextSafe(storage.FileLocation || storage.Path || '');
                        const pathPart = path ? ` (${path})` : '';
                        contextText = `${stepNameDisplay}: load ${pathPart ? `${filename}${pathPart}` : filename} into ${this.getTextSafe(storage.MemoryTableName || table)}`;
                        break;
                    }
                    case 'SaveText':
                    case 'SaveTextfile': {
                        const filename = this.getTextSafe(storage.FileName || 'Text File');
                        const path = this.getTextSafe(storage.FileLocation || storage.Path || '');
                        const pathPart = path ? ` (${path})` : '';
                        contextText = `Save ${filename} to ${this.getTextSafe(storage.MemoryTableName || table)}${pathPart}`;
                        break;
                    }
                    case 'Decision': contextText = `Decision on ${this.getTextSafe(storage.InputTableName || 'Table')}`; break;
                    case 'Branch': contextText = `If ${this.getTextSafe(storage.Expression)}`; break;
                    default: contextText = stepType;
                }
            }

            // Collect Inputs and Outputs
            const inputs: string[] = [];
            const outputs: string[] = [];

            // Helper to add if valid string
            const add = (arr: string[], val: any) => {
                const s = this.getTextSafe(val);
                if (s && s.trim().length > 0 && !arr.includes(s) && s !== 'dataset' && s !== 'target') arr.push(s);
            };

            // Inputs
            add(inputs, storage.InputTableName);
            add(inputs, storage.JoinTable1);
            add(inputs, storage.JoinTable2);
            add(inputs, storage.FilterTableName);
            add(inputs, storage.ExportMemoryTableName);
            add(inputs, storage.InputVariable); // Loop iterator

            // Contextual Inputs (TableName is typically input unless it's a creation step)
            if (stepType !== 'CreateTable' && stepType !== 'SetVariable' && stepType !== 'CalculateVariable') {
                add(inputs, storage.TableName);
            }

            // Outputs
            add(outputs, storage.OutputTableName);
            add(outputs, storage.AppendToTableName);
            add(outputs, storage.VariableName);
            add(outputs, storage.OutputVariable);
            add(outputs, storage.ResultVariable);
            add(outputs, storage.MemoryTableName);

            // Special Cases
            if (stepType === 'LoadTextFile' && outputs.length === 0) add(outputs, 'DATA');
            if (stepType === 'CreateTable') add(outputs, storage.TableName); // CreateTable defines TableName as output

            let info: any = {
                RawType: stepType,
                Step: stepName,
                Inputs: inputs,
                Outputs: outputs,
                Phase: stepType, // Mapping can happen in View
                Context: contextText, // Raw context
                SmartDesc: smartDesc,
                Output: this.getExplicitOutput(stepType, storage, step),
                IsActive: isActive,
                Description: description,
                Depth: depth,
                Details: [],
                TableData: null,
                Headers: null,
                LogicRules: null, // New field for Logic Table
                id: `${stepType}_${stepName}`.replace(/[^a-zA-Z0-9]/g, '_'),
                FlowLabel: '', // To be populated below
                children: [],
                // LOW VALUE - Technical view only (GUIDs, internal IDs)
                StepId: step.StepId || '',
                ParentStepId: step.ParentStepId || '0',
                Sequence: step.Sequence || '',
                ProcessId: step.ProcessId || '',
                // MEDIUM VALUE - Technical view (operational settings)
                ErrorHandling: storage.ErrorHandling || storage.OnError || '',
                RetryCount: storage.RetryCount || storage.Retries || '',
                Timeout: storage.Timeout || storage.TimeoutSeconds || '',
                TransactionMode: storage.TransactionMode || storage.UseTransaction || '',
                MaxRows: storage.MaxRows || storage.RowLimit || '',
                DistinctRows: storage.DistinctRows || storage.Distinct || '',
                LogLevel: storage.LogLevel || storage.Logging || '',
                UseCache: storage.UseCache || storage.CacheResults || ''
            };

            // --- Enhance Flow Label (User Request) ---
            let fl = contextText;
            if (stepType === 'SetVariable' || stepType === 'CalculateVariable') {
                const vName = this.getTextSafe(storage.VariableName);
                const val = this.getTextSafe(storage.VariableValue || storage.Expression);
                fl = `${vName} = <code>${val}</code>`;
            } else if (stepType === 'Decision' || stepType === 'Branch') {
                // If Count>0
                const expr = this.getTextSafe(storage.Expression);
                fl = expr ? `If ${expr}` : `Decision on ${table}`;
            } else if (stepType === 'ExportToExcel') {
                const f = this.getTextSafe(storage.FileName).split('\\').pop(); // Show basename
                fl = `Export to Excel: ${f || 'File'}`;
            } else if (stepType === 'SendEmail') {
                const subj = this.getTextSafe(storage.SubjectLine);
                const att = this.getListSafe(storage.SendEmailAttachmentConfigItems, 'SendEmailAttachmentConfigItem');
                fl = `Email: "${subj || 'No Subject'}"`;
                if (att.length > 0) fl += ` (+${att.length} att)`;
            } else if (stepType === 'LoadTextFile' || stepType === 'SaveText' || stepType === 'SaveTextfile') {
                const f = this.getTextSafe(storage.FileName).split('\\').pop();
                fl = `${stepType === 'LoadTextFile' ? 'Load' : 'Save'} Text: ${f || 'File'}`;
            } else if (stepType === 'RunDatasourceQuery' || stepType === 'RunSimpleQuery' || stepType === 'RunDirectQuery') {
                // Source -> Target
                let src = table;
                if (stepType === 'RunDatasourceQuery') src = this.getTextSafe(storage.DataSource?.Description || 'Datasource');
                if (stepType === 'RunDirectQuery') src = `Query: ${table}`;
                fl = `${src} ➔ ${target}`;
                fl = `${src} ➔ ${target}`;
            } else if (stepType === 'ImportWarehouseData') {
                fl = `Save to Warehouse: ${target}`;
            } else if (stepType === 'PurgeTable') {
                fl = `Purge: ${this.getTextSafe(storage.TableToPurge || storage.TableName || 'Table')}`;
            } else if (stepType === 'DeleteWarehouseData') {
                fl = `Delete Warehouse Data: ${target}`;
            } else if (stepType === 'CreateTable') {
                const outName = this.getTextSafe(step.OutputTableDefinition?.TableName || 'New Table');
                fl = `Create Table: ${outName}`;
            } else if (stepType === 'AppendTable') {
                fl = `Append to: ${this.getTextSafe(storage.AppendToTableName || 'Table')}`;
            }

            info.FlowLabel = fl;

            if (!isActive) info.Phase += " [DISABLED]";

            // --- General Details Population ---
            if (storage.JoinType) info.Details.push(`Join Type: ${this.getTextSafe(storage.JoinType)}`);

            if (storage.SortColumns) {
                const cols = this.getListSafe(storage.SortColumns, 'SortColumnItem');
                if (cols.length > 0) info.Details.push(`Sort Order: ${cols.map((c: any) => this.getTextSafe(c.ColumnName)).join(', ')}`);
            }

            if (stepType === 'SendEmail') {
                info.Details.push(`Subject: ${this.getTextSafe(storage.SubjectLine)}`);
                info.Details.push(`To: ${this.getTextSafe(storage.SendTo)}`);
                // Enhanced email details
                const cc = this.getTextSafe(storage.SendCC);
                const bcc = this.getTextSafe(storage.SendBCC);
                const from = this.getTextSafe(storage.SendFrom);
                const priority = this.getTextSafe(storage.Priority);
                if (cc) info.Details.push(`CC: ${cc}`);
                if (bcc) info.Details.push(`BCC: ${bcc}`);
                if (from) info.Details.push(`From: ${from}`);
                if (priority && priority !== 'Normal') info.Details.push(`Priority: ${priority}`);
                // Email body (truncated for display)
                const bodyText = this.getTextSafe(storage.BodyText || storage.Body);
                const isHtml = storage.IsHtmlBody === 'true' || storage.IsHtmlBody === true;
                if (bodyText) {
                    const truncated = bodyText.length > 200 ? bodyText.substring(0, 200) + '...' : bodyText;
                    info.Details.push(`Body${isHtml ? ' (HTML)' : ''}: ${truncated}`);
                }
            }

            if (stepType === 'RunDirectQuery' || stepType === 'RunTableQuery') {
                const columns = this.getListSafe(storage.Columns, stepType === 'RunTableQuery' ? 'ColumnItem' : 'ColumnItem');
                info.TableData = columns.map((c: any) => ({
                    Col1: this.getTextSafe(c.ColumnName),
                    Col2: this.getTextSafe(c.ColumnSource) || this.getTextSafe(c.ColumnName) || '-',
                    Col3: this.getTextSafe(c.ColumnDataType || c.DataType) || 'String',
                    Col4: this.getTextSafe(c.ColumnActionType?.['#text'] || c.ColumnActionType) || 'Display'
                }));
                if (info.TableData.length > 0) info.Headers = ["Column Name", "Source Field", "Type", "Action"];
                // Query limits and aggregations
                const topN = this.getTextSafe(storage.TopN || storage.Top || storage.MaxRows);
                const skipN = this.getTextSafe(storage.SkipN || storage.Skip || storage.Offset);
                const distinct = storage.Distinct === 'true' || storage.DistinctRows === 'true';
                if (topN && topN !== '0') info.Details.push(`Limit: Top ${topN} rows`);
                if (skipN && skipN !== '0') info.Details.push(`Skip: First ${skipN} rows`);
                if (distinct) info.Details.push(`Distinct: Yes`);
                // Group By
                const groupByCols = this.getListSafe(storage.GroupByColumns || storage.GroupBy, 'GroupByColumnItem');
                if (groupByCols.length > 0) {
                    const groupNames = groupByCols.map((g: any) => this.getTextSafe(g.ColumnName || g)).join(', ');
                    info.Details.push(`Group By: ${groupNames}`);
                }
                // Having
                const having = this.getTextSafe(storage.HavingCriteria || storage.Having);
                if (having) info.Details.push(`Having: ${having}`);
                // Extract criteria/filters for query steps
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'AddColumn' || stepType === 'UpdateColumn') {
                const columns = this.getListSafe(storage.Columns, 'ColumnItemDef');
                info.TableData = columns.map((col: any) => {
                    const rawExpr = this.getTextSafe(col.Expression);
                    // Critical: Parse Logic Rules Here
                    const rules = this.flattenLogic(rawExpr);
                    return {
                        Col1: this.getTextSafe(col.ColumnName),
                        Col2: rawExpr, // Raw expression
                        Col3: this.getTextSafe(col.ColumnType) || 'String',
                        Rules: rules // Attached meta-data for formatter
                    };
                });
                if (info.TableData.length > 0) info.Headers = ["Field", "Formula", "Type"];
                // Extract criteria/filters for transformation steps
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'CalculateVariable' || stepType === 'SetVariable') {
                const vName = this.getTextSafe(storage.VariableName);
                const rawExpr = this.getTextSafe(storage.Expression || storage.VariableValue);
                const rules = this.flattenLogic(rawExpr);
                info.TableData = [{
                    Col1: vName,
                    Col2: rawExpr,
                    Col3: 'Variable',
                    Rules: rules
                }];
                info.Headers = ["Variable", "Expression", "Type"];
            }
            else if (stepType === 'ImportWarehouseData') {
                const mappings = this.getListSafe(storage.ColumnMapping, 'TableColumnMapping');
                info.TableData = mappings.map((m: any) => {
                    const cName = this.getTextSafe(m.ColumnName);
                    const sourceVal = this.getTextSafe(m.MappedValue);
                    const sourceCol = sourceVal.replace(/^\[|\]$/g, '');
                    const meta = columnMetadata.get(sourceCol) || { Type: 'String', Origin: '' };
                    const type = this.getTextSafe(m.ColumnDataType || m.DataType || m.ColumnType) || meta.Type;
                    return { Col1: cName, Col2: sourceVal, Col3: type, Col4: meta.Origin || '-' };
                });
                if (info.TableData.length > 0) info.Headers = ["Target Column", "Source / Value", "Type", "Origin Step"];
                // Import operation details
                const batchSize = this.getTextSafe(storage.BatchSize || storage.CommitSize);
                const ignoreDups = storage.IgnoreDuplicates === 'true' || storage.SkipDuplicates === 'true';
                const truncateFirst = storage.TruncateFirst === 'true' || storage.ClearFirst === 'true';
                if (batchSize && batchSize !== '0') info.Details.push(`Batch Size: ${batchSize}`);
                if (ignoreDups) info.Details.push(`Duplicates: Ignored`);
                if (truncateFirst) info.Details.push(`Pre-clear: Yes (truncate before import)`);
                // Key columns for upsert
                const keyCols = this.getListSafe(storage.KeyColumns || storage.MatchColumns, 'KeyColumn');
                if (keyCols.length > 0) {
                    const keyNames = keyCols.map((k: any) => this.getTextSafe(k.ColumnName || k)).join(', ');
                    info.Details.push(`Key Columns: ${keyNames}`);
                }
                // Extract warehouse criteria/filters
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'JoinTable') {
                const joins = this.getListSafe(storage.Joins, 'JoinItemDef');
                info.TableData = joins.map((j: any) => ({ Col1: `${this.getTextSafe(j.JoinTable1)}.${this.getTextSafe(j.JoinColumn1)}`, Col2: `${this.getTextSafe(j.JoinType)} ${this.getTextSafe(j.JoinTable2)}.${this.getTextSafe(j.JoinColumn2)}` }));
                if (info.TableData.length > 0) info.Headers = ["Left", "Condition"];
                // Extract criteria/filters for join steps
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'CreateTable') {
                let outCols = this.getListSafe(step.OutputTableDefinition?.Columns, 'ColumnItem');
                if (outCols.length === 0) outCols = this.getListSafe(step.OutputTableDefinition?.TableDefinition?.Columns, 'TableColumnDefinition');
                info.TableData = outCols.map((c: any) => ({ Col1: this.getTextSafe(c.ColumnName), Col2: this.getTextSafe(c.ColumnType['#text'] || c.ColumnType) || 'String' }));
                if (info.TableData.length > 0) info.Headers = ["Column Name", "Type"];
            }
            // New Detailed Extraction
            else if (stepType === 'ExportToExcel') {
                const file = this.getTextSafe(storage.FileName);
                const loc = this.getTextSafe(storage.FileLocation);
                if (file) info.Details.push(`File: ${file} ${loc ? `(${loc})` : ''}`);
                if (storage.SheetName) info.Details.push(`Sheet: ${this.getTextSafe(storage.SheetName)}`);
            }
            else if (stepType === 'SendEmail') {
                if (storage.SubjectLine) info.Details.push(`Subject: ${this.getTextSafe(storage.SubjectLine)}`);
                const attachments = this.getListSafe(storage.SendEmailAttachmentConfigItems, 'SendEmailAttachmentConfigItem');
                attachments.forEach((a: any) => {
                    info.Details.push(`Attachment: ${this.getTextSafe(a.FileMask)}`);
                });
            }
            else if (stepType === 'LoadTextFile' || stepType === 'SaveText' || stepType === 'SaveTextfile') {
                const file = this.getTextSafe(storage.FileName);
                if (file) info.Details.push(`File: ${file}`);
            }

            else if (stepType === 'RunDatasourceQuery' || stepType === 'RunSimpleQuery') {
                const dsName = this.getTextSafe(storage.DataSource?.['@_Description'] || storage.DataSource?.Description) || 'Datasource';
                info.Details.push(`Source: ${dsName}`);

                const params = this.getListSafe(storage.DataSourceParameters, 'DataSourceParameterItem');
                params.forEach((p: any) => {
                    info.Details.push(`Param: ${this.getTextSafe(p.DataSourceParameterName)} = ${this.getTextSafe(p.DataSourceParameterValue)}`);
                });

                if (stepType === 'RunSimpleQuery') {
                    // Reuse table parsing logic for columns
                    const columns = this.getListSafe(storage.Columns, 'ColumnItem');
                    info.TableData = columns.map((c: any) => ({
                        Col1: this.getTextSafe(c.ColumnName),
                        Col2: this.getTextSafe(c.ColumnSource) || this.getTextSafe(c.ColumnName) || '-',
                        Col3: this.getTextSafe(c.ColumnDataType || c.DataType) || 'String',
                        Col4: this.getTextSafe(c.ColumnActionType?.['#text'] || c.ColumnActionType) || 'Display'
                    }));
                    if (info.TableData.length > 0) info.Headers = ["Column Name", "Source Field", "Type", "Action"];
                }
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'Branch') {
                // Expression is now the main context ("If ..."), so we don't need to duplicate it in details
                const expr = this.getTextSafe(storage.Expression);
                if (expr && expr.length > 50) info.Details.push(`Full Condition: ${expr}`); // Only show if very long
            }
            else if (stepType === 'Decision') {
                if (storage.InputTableName) info.Details.push(`Input: ${this.getTextSafe(storage.InputTableName)}`);
            }
            // --- Loop step details ---
            else if (stepType === 'Loop') {
                const iterator = this.getTextSafe(storage.InputVariable);
                if (iterator) info.Details.push(`Iterator: ${iterator}`);
                // Loop constraints
                const maxIter = this.getTextSafe(storage.MaxIterations);
                const breakCond = this.getTextSafe(storage.BreakCondition || storage.ExitCondition);
                const indexVar = this.getTextSafe(storage.IndexVariable || storage.LoopIndex);
                if (maxIter && maxIter !== '0') info.Details.push(`Max Iterations: ${maxIter}`);
                if (breakCond) info.Details.push(`Break When: ${breakCond}`);
                if (indexVar) info.Details.push(`Index Variable: ${indexVar}`);
            }
            // --- Script/SQL execution steps ---
            else if (stepType === 'Script' || stepType === 'ExecuteScript') {
                const lang = this.getTextSafe(storage.ScriptLanguage || storage.Language);
                const scriptText = this.getTextSafe(storage.ScriptText || storage.Script);
                if (lang) info.Details.push(`Language: ${lang}`);
                if (scriptText) {
                    const preview = scriptText.length > 150 ? scriptText.substring(0, 150) + '...' : scriptText;
                    info.Details.push(`Script: ${preview}`);
                }
            }
            else if (stepType === 'ExecuteSQL' || stepType === 'RunSQL') {
                const sql = this.getTextSafe(storage.SqlStatement || storage.SQL || storage.Query);
                const conn = this.getTextSafe(storage.ConnectionString || storage.Connection);
                if (conn) info.Details.push(`Connection: ${conn}`);
                if (sql) {
                    const preview = sql.length > 200 ? sql.substring(0, 200) + '...' : sql;
                    info.Details.push(`SQL: ${preview}`);
                }
            }
            else if (stepType === 'StartProcess' || stepType === 'RunProcess') {
                const procName = this.getTextSafe(storage.ProcessName || storage.ProcessToRun);
                const procId = this.getTextSafe(storage.ProcessId);
                if (procName) info.Details.push(`Process: ${procName}`);
                if (procId && !procName) info.Details.push(`Process ID: ${procId}`);
                // Process parameters
                const params = this.getListSafe(storage.Parameters, 'ParameterItem');
                params.forEach((p: any) => {
                    info.Details.push(`Param: ${this.getTextSafe(p.Name)} = ${this.getTextSafe(p.Value)}`);
                });
            }
            // --- FilterTable and SortTable ---
            else if (stepType === 'FilterTable') {
                const inputTable = this.getTextSafe(storage.InputTableName || storage.TableName);
                if (inputTable) info.Details.push(`Input: ${inputTable}`);
                this.extractCriteria(storage).forEach(f => info.Details.push(`Filter: ${f}`));
            }
            else if (stepType === 'SortTable') {
                const inputTable = this.getTextSafe(storage.InputTableName || storage.TableName);
                if (inputTable) info.Details.push(`Input: ${inputTable}`);
                const sortCols = this.getListSafe(storage.SortColumns, 'SortColumnItem');
                if (sortCols.length > 0) {
                    const sortInfo = sortCols.map((c: any) => {
                        const colName = this.getTextSafe(c.ColumnName);
                        const direction = this.getTextSafe(c.SortDirection || c.Direction) || 'Asc';
                        return `${colName} ${direction === 'Descending' || direction === 'Desc' ? 'DESC' : 'ASC'}`;
                    }).join(', ');
                    info.Details.push(`Sort: ${sortInfo}`);
                }
            }
            else if (stepType === 'DeleteColumn' || stepType === 'RenameColumn') {
                const inputTable = this.getTextSafe(storage.InputTableName || storage.TableName);
                if (inputTable) info.Details.push(`Table: ${inputTable}`);
                if (stepType === 'RenameColumn') {
                    const oldName = this.getTextSafe(storage.OldColumnName);
                    const newName = this.getTextSafe(storage.NewColumnName);
                    if (oldName && newName) info.Details.push(`Rename: ${oldName} → ${newName}`);
                } else {
                    const cols = this.getListSafe(storage.ColumnsToDelete || storage.Columns, 'ColumnItem');
                    if (cols.length > 0) {
                        info.Details.push(`Delete: ${cols.map((c: any) => this.getTextSafe(c.ColumnName || c)).join(', ')}`);
                    }
                }
            }

            // ... (previous logic)

            // --- Detailed Field Extraction ---

            // 1. DynamicFields (Data Dictionary)
            // Available in queries and most transformations
            const dynFields = this.getListSafe(storage.DynamicFields?.Field || step.OutputTableDefinition?.Columns, step.OutputTableDefinition ? 'ColumnItem' : 'Field');
            if (dynFields.length > 0) {
                info.DataDictionary = dynFields.map((f: any) => {
                    // Handle various XML structures for Field definitions
                    const def = f.FieldDef?.ValueObjectFieldDefinitionOfString || f;
                    return {
                        Name: this.getTextSafe(f['@_Name'] || f.ColumnName),
                        Type: this.getTextSafe(def.FieldType || def.ColumnType?.['#text'] || def.ColumnType || 'String'),
                        Length: this.getTextSafe(def.MaxLength),
                        Description: this.getTextSafe(f.Description?.string?.['#text'])
                    };
                });
            }

            // 2. Exists Filters (Critical Logic)
            if (storage.ExistsFilters?.ExistsFilterItem) {
                const exists = this.getListSafe(storage.ExistsFilters, 'ExistsFilterItem');
                info.ExistsLogic = exists.map((e: any) => {
                    const table = this.getTextSafe(e.FilterTableName);
                    const notIdx = e.NotExistsFlag === 'true' ? 'NOT ' : '';
                    const links = this.getListSafe(e.Links, 'ExistsFilterItemLink')
                        .map((l: any) => `${this.getTextSafe(l.FieldName)} = ${this.getTextSafe(l.ColumnName)}`)
                        .join(' AND ');
                    return `${notIdx}EXISTS IN ${table} WHERE ${links}`;
                });
            }

            // 3. Extended Where
            const extWhere = this.getTextSafe(storage.ExtendedWhere);
            if (extWhere) info.Details.push(`Extended Criteria: ${extWhere}`);

            // 4. Import Options
            if (stepType === 'ImportWarehouseData') {
                const modeCode = this.getTextSafe(storage.ImportOption?.['#text'] || storage.ImportOption);
                const modeMap: Record<string, string> = {
                    'IU': 'Insert or Update',
                    'I': 'Insert Only',
                    'U': 'Update Only',
                    'D': 'Delete',
                    'R': 'Replace'
                };
                const modeDesc = modeMap[modeCode] || modeCode;
                if (modeDesc) info.Details.push(`Mode: ${modeDesc}`);
            }

            // 5. LoadTextFile Logic
            if (stepType === 'LoadTextFile') {
                if (storage.FileEncoding) info.Details.push(`Encoding: ${this.getTextSafe(storage.FileEncoding)}`);
                if (storage.StartCondition) info.Details.push(`Start When: ${this.getTextSafe(storage.StartCondition)}`);
                if (storage.StopCondition) info.Details.push(`Stop When: ${this.getTextSafe(storage.StopCondition)}`);
            }

            // 6. Excel/Email Extras
            if (stepType === 'ExportToExcel') {
                if (storage.UpdateExistingSheet === 'true') info.Details.push(`Mode: Append to Sheet`);
                if (storage.SheetName) info.Details.push(`Target Sheet: ${this.getTextSafe(storage.SheetName)}`);
            }

            // Business/Tech Filtering for new fields
            // We attach them to 'info', ReportGenerator decides display.

            executionFlow.push(info);
            step.children.forEach((child: any) => {
                const childInfo = traverse(child, depth + 1);
                if (childInfo) info.children.push(childInfo);
            });
            return info;
        };

        const executionTree = rootSteps.map(s => traverse(s, 0)).filter(Boolean);
        return { executionTree, executionFlow, variables: Array.from(variables.values()), variableSet: variableNames, tableSet: tableNames, stepSet: stepOutputs };
    }
}
