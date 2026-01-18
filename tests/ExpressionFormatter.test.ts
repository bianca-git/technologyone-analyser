
import { describe, it, expect } from 'vitest';
import { ExpressionFormatter } from '../src/lib/formatters/ExpressionFormatter';

describe('ExpressionFormatter', () => {

    describe('colouriseTextHTML', () => {
        it('should wrap known variables in var-badges', () => {
            const varSet = new Set(['MyVar', 'OtherVar']);
            const input = 'Value = MyVar + 10';
            const output = ExpressionFormatter.colouriseTextHTML(input, varSet);
            
            expect(output).toContain('<span class="var-badge">MyVar</span>');
            expect(output).not.toContain('<span class="var-badge">Value</span>');
        });

        it('should wrap T1 variable syntax {&Var}', () => {
            const input = 'Select {&GlobalVar}';
            const output = ExpressionFormatter.colouriseTextHTML(input, new Set());
            
            expect(output).toContain('<span class="var-badge">GlobalVar</span>');
        });

        it('should wrap known table names in table-badges', () => {
            const tableSet = new Set(['MyTable', 'Ref_Data']);
            const input = 'SELECT * FROM MyTable JOIN Ref_Data';
            const output = ExpressionFormatter.colouriseTextHTML(input, new Set(), tableSet);

            expect(output).toContain('<span class="t1-table-badge" data-type="table">𝄜 MyTable</span>');
            expect(output).toContain('<span class="t1-table-badge" data-type="table">𝄜 Ref_Data</span>');
        });

        it('should handle special regex characters in names', () => {
            const varSet = new Set(['Var(1)']);
            const input = 'Value = Var(1) + 2';
            const output = ExpressionFormatter.colouriseTextHTML(input, varSet);
            expect(output).toContain('<span class="var-badge">Var(1)</span>');
        });
    });

    describe('parseCaseStatement', () => {
        it('should parse simple CASE WHEN THEN matches', () => {
            const expr = "CASE WHEN Status = 'A' THEN 'Active' WHEN Status = 'D' THEN 'Inactive' ELSE 'Unknown' END";
            const result = ExpressionFormatter.parseCaseStatement(expr);
            
            expect(result).toHaveLength(3);
            expect(result?.[0]).toEqual({ condition: "Status = 'A'", outcome: "'Active'" });
            expect(result?.[1]).toEqual({ condition: "Status = 'D'", outcome: "'Inactive'" });
            expect(result?.[2]).toEqual({ condition: "ELSE", outcome: "'Unknown'" });
        });

        it('should return null for non-CASE strings', () => {
            expect(ExpressionFormatter.parseCaseStatement("SELECT * FROM Table")).toBeNull();
        });
    });

    describe('parseIifStatement', () => {
        it('should parse simple IIF(Cond, True, False)', () => {
            const result = ExpressionFormatter.parseIifStatement('IIF(A=B, "Yes", "No")');
            expect(result).toHaveLength(2);
            expect(result?.[0]).toEqual({ condition: 'A=B', outcome: '"Yes"' });
            expect(result?.[1]).toEqual({ condition: 'ELSE', outcome: '"No"' });
        });

        it('should handle nested parentheses in arguments', () => {
            const result = ExpressionFormatter.parseIifStatement('IIF(Func(A,B)=1, "Y", "N")');
            expect(result?.[0].condition).toBe('Func(A,B)=1');
        });

        it('should return null if not valid IIF', () => {
            expect(ExpressionFormatter.parseIifStatement('SUM(A,B)')).toBeNull();
        });
    });

    describe('renderLogicTable', () => {
        it('should produce HTML table for rules', () => {
            const rules = [
                { condition: 'A=1', outcome: 'Success' }
            ];
            const html = ExpressionFormatter.renderLogicTable(rules);
            
            expect(html).toContain('t1-logic-table');
            expect(html).toContain('A=1');
            expect(html).toContain('Success');
        });

        it('should return empty string for empty rules', () => {
             expect(ExpressionFormatter.renderLogicTable([])).toBe('');
        });
    });

    describe('formatExpression', () => {
        it('should use CASE logic for CASE strings', () => {
            const input = "CASE WHEN X THEN Y END";
            const output = ExpressionFormatter.formatExpression(input);
            expect(output).toContain('t1-logic-table');
        });

        it('should use IIF logic for IIF strings', () => {
            const input = "IIF(X,Y,Z)";
            const output = ExpressionFormatter.formatExpression(input);
            expect(output).toContain('t1-logic-table');
        });

        it('should fallback to colourise for others', () => {
            const input = "Plain Value";
            const output = ExpressionFormatter.formatExpression(input);
            expect(output).toBe("Plain Value");
        });
    });
});
