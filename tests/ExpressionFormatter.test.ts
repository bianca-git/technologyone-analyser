
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
});
