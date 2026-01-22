
// --- Helper Types ---
export type LogicRule = { outcome: string, condition: string };

export class ExpressionFormatter {

    static escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Colourises text by highlighting variables and tables found in the respective sets.
     */
    static colouriseTextHTML(text: any, varSet: Set<string>, tableSet: Set<string> = new Set(), stepSet: Set<string> = new Set()): string {
        if (text === null || text === undefined) return "";
        let str = String(text);

        // Placeholder strategy to prevent double wrapping
        const placeholders: Record<string, string> = {};
        const createPlaceholder = (content: string, type: 'var' | 'table' | 'step') => {
            const key = `__T1_${type.toUpperCase()}_${Object.keys(placeholders).length}__`;
            placeholders[key] = content;
            return key;
        };

        // 1. Handle explicit TechOne variable syntax: {&VAR_NAME}
        // We replace with placeholder immediately
        str = str.replace(/\{&([a-zA-Z0-9_]+)\}/g, (_match, name) => {
            return createPlaceholder(`<span class="var-badge">${name}</span>`, 'var');
        });

        // 2. Handle generic variable names found in the set
        if (varSet.size > 0) {
            const varPatterns = Array.from(varSet).map(v => {
                const esc = this.escapeRegExp(v);
                return `\\[?${esc}\\]?`;
            });
            const varRegex = new RegExp(`(?<!\\w)(${varPatterns.join('|')})(?!\\w)`, 'g');
 
            str = str.replace(varRegex, (match) => {
                const varName = match.replace(/^\[|\]$/g, '');
                return createPlaceholder(`<span class="var-badge">${varName}</span>`, 'var');
            });
        }

        // 3. Handle table names found in the table set
        if (tableSet.size > 0) {
            const tablePatterns = Array.from(tableSet).map(t => {
                const esc = this.escapeRegExp(t);
                return `\\[?${esc}\\]?`;
            });
            const tableRegex = new RegExp(`(?<!\\w)(${tablePatterns.join('|')})(?!\\w)`, 'g');
            str = str.replace(tableRegex, (match) => {
                const tableName = match.replace(/^\[|\]$/g, '');
                return createPlaceholder(this.formatTable(tableName), 'table');
            });
        }

        // 4. Handle step output names (Strings from LoadText etc)
        if (stepSet.size > 0) {
            const stepPatterns = Array.from(stepSet).map(s => {
                const esc = this.escapeRegExp(s);
                return `\\[?${esc}\\]?`;
            });
            const stepRegex = new RegExp(`(?<!\\w)(${stepPatterns.join('|')})(?!\\w)`, 'g');
            str = str.replace(stepRegex, (match) => {
                const stepName = match.replace(/^\[|\]$/g, '');
                return createPlaceholder(this.formatStepOutput(stepName), 'step');
            });
        }

        // 5. Restore Placeholders
        Object.keys(placeholders).forEach(key => {
            str = str.replace(key, placeholders[key]);
        });

        return str;
    }

    static formatTable(name: string): string {
        return `<span class="t1-table-badge" data-type="table">𝄜 ${name}</span>`;
    }

    static formatFile(name: string): string {
        return `<span class="t1-table-badge" data-type="file">📄 ${name}</span>`;
    }

    static formatStepOutput(name: string): string {
        return `<span class="t1-step-output-badge" data-type="step">📄 ${name}</span>`;
    }

    static formatColumn(name: string): string {
        return `<em class="t1-col-badge" data-type="col">${name}</em>`;
    }

    static formatCode(text: string): string {
        return `<span class="t1-code-token">${text}</span>`;
    }

    static renderLogicTable(rules: LogicRule[], formatter: (text: string) => string = (t) => ExpressionFormatter.formatCode(t)): string {
        if (!rules || rules.length === 0) return '';
        // Note: The caller of renderLogicTable typically binds the colouriseTextHTML with the sets.

        const rows = rules.map(r => `
            <div class="t1-logic-row">
                <div class="t1-logic-outcome">${formatter(r.outcome)}</div>
                <div class="t1-logic-condition">${formatter(r.condition)}</div>
            </div>
        `).join('');


        return `
            <div class="t1-logic-table">
                <div class="t1-logic-header">
                    <div class="t1-logic-outcome-header">Outcome</div>
                    <div class="t1-logic-condition-header">When</div>
                </div>
                ${rows}
            </div>
        `;
    }

    static parseCaseStatement(expr: string): LogicRule[] | null {
        // Basic SQL CASE parser: CASE WHEN ... THEN ... [ELSE ...] END
        const trimmed = expr.trim();
        if (!/^CASE\s+/i.test(trimmed)) return null;

        const rules: LogicRule[] = [];
        let remaining = trimmed.substring(4).trim(); // Skip CASE

        // Regex for WHEN ... THEN ...
        // We use a loop to consume the string to handle nesting/complexity slightly better than a single global regex
        // efficiently enough for this use case.
        // NOTE: This is a simple regex parser; it will fail on nested CASE statements inside string literals etc.
        // But for Data Model expressions it covers 95% of cases.

        const whenRegex = /^WHEN\s+(.+?)\s+THEN\s+(.+?)\s+(?=WHEN|ELSE|END|$)/i;

        // Remove 'END' from the very end if present to simplify lookaheads
        if (/END\s*$/i.test(remaining)) {
            remaining = remaining.replace(/END\s*$/i, '');
        }

        while (true) {
            const match = remaining.match(whenRegex);
            if (match) {
                rules.push({ condition: match[1].trim(), outcome: match[2].trim() });
                remaining = remaining.substring(match[0].length).trim();
            } else {
                break; // No more WHENs
            }
        }

        // Check for ELSE
        const elseRegex = /^ELSE\s+(.+)$/i;
        const elseMatch = remaining.match(elseRegex);
        if (elseMatch) {
            rules.push({ condition: 'ELSE', outcome: elseMatch[1].trim() });
        }

        return rules.length > 0 ? rules : null;
    }

    /**
     * Formatting Facade
     */
    static parseIifStatement(expr: string): LogicRule[] | null {
        const trimmed = expr.trim();
        // Match explicit IIF(...) start
        if (!/^IIF\s*\(/i.test(trimmed)) return null;

        // Remove outer IIF( and )
        let content = trimmed.substring(trimmed.indexOf('(') + 1);
        if (content.endsWith(')')) content = content.substring(0, content.length - 1);

        // Split by comma, respecting parentheses
        const parts: string[] = [];
        let parenthesisLevel = 0;
        let lastSplitIndex = 0;

        for (let i = 0; i < content.length; i++) {
            if (content[i] === '(') parenthesisLevel++;
            else if (content[i] === ')') parenthesisLevel--;
            else if (content[i] === ',' && parenthesisLevel === 0) {
                parts.push(content.substring(lastSplitIndex, i).trim());
                lastSplitIndex = i + 1;
            }
        }
        parts.push(content.substring(lastSplitIndex).trim());

        if (parts.length === 3) {
            const truePart = { condition: parts[0], outcome: parts[1] };

            // Recursive check for nested IIF in the 'else' part
            // "IIF(Cond, True, IIF(Cond2, True2, Else2))" -> "When Cond Then True, When Cond2 Then True2, Else Else2"
            const nestedIif = this.parseIifStatement(parts[2]);
            if (nestedIif) {
                return [truePart, ...nestedIif];
            } else {
                return [truePart, { condition: 'ELSE', outcome: parts[2] }];
            }
        }

        return null;
    }

    /**
     * Formatting Facade
     */
    static formatExpression(expr: string, varSet?: Set<string>, tableSet?: Set<string>, stepSet?: Set<string>): string {
        if (!expr) return '';

        // Try parsing as CASE statement
        const caseRules = this.parseCaseStatement(expr);
        if (caseRules) {
            return this.renderLogicTable(caseRules, (t) => this.colouriseTextHTML(t, varSet || new Set(), tableSet || new Set(), stepSet || new Set()));
        }

        // Try parsing as IIF statement
        const iifRules = this.parseIifStatement(expr);
        if (iifRules) {
            return this.renderLogicTable(iifRules, (t) => this.colouriseTextHTML(t, varSet || new Set(), tableSet || new Set(), stepSet || new Set()));
        }

        // Default: just colorize
        return this.colouriseTextHTML(expr, varSet || new Set(), tableSet || new Set(), stepSet || new Set());
    }
}
