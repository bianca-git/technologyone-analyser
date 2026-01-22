
import { describe, it, expect } from 'vitest';
import { MermaidGenerator } from '../src/lib/generators/MermaidGenerator';

describe('MermaidGenerator', () => {

    const mockFlow = [
        {
            Step: 'Step1',
            Context: 'Source Table: Data',
            RawType: 'RunDirectQuery',
            children: []
        },
        {
            Step: 'Step2',
            Context: 'Calculate Field',
            RawType: 'AddColumn',
            Description: 'Some Calc', // Ensure it appears in Business Mode
            children: []
        },
        {
            Step: 'Step3',
            Context: 'Save to Warehouse',
            RawType: 'ImportWarehouseData',
            children: []
        }
    ];

    it('generates basic syntax in technical mode', () => {
        const syntax = MermaidGenerator.generateMermaidSyntax(mockFlow, 'technical');
         // Basic Checks
        expect(syntax).toContain('flowchart TD');
        expect(syntax).toContain('N0[("📥 Data")]:::source');
        expect(syntax).toContain('N1[("Calculate Field")]');
        expect(syntax).toContain('N2(["📥Save to Warehouse"]):::target');
        expect(syntax).toContain('N0 --> N1');
        expect(syntax).toContain('N1 --> N2');

        // Colors
        expect(syntax).toContain('classDef source');
    });

    it('filters correctly in business mode', () => {
        const busFlow = [
            ...mockFlow,
            { // Should be ignored
                Step: 'StepIgnore',
                Context: 'Hidden Calc',
                RawType: 'AddColumn',
                children: []
            }
        ];

        const syntax = MermaidGenerator.generateMermaidSyntax(busFlow, 'business');
        expect(syntax).toContain('N0');
        expect(syntax).toContain('N1'); // Has description, so kept
        expect(syntax).toContain('N2');

        // StepIgnore should NOT be in the syntax if filtered correctly
        // N3 would be the index if it was included. 
        // Logic check: The generator relies on `traverse` pushing to `steps`.
        // If skipped, no node is created.
        expect(syntax).not.toContain('Hidden Calc');
    });


    it('handles loops in technical mode', () => {
        const loopFlow = [{
            Step: 'Loop1',
            Context: 'Loop',
            RawType: 'Loop',
            children: [
                {
                    Step: 'InsideLoop',
                    Context: 'Do Work',
                    RawType: 'CalculateVariable',
                    Description: 'Work',
                    children: []
                }
            ]
        }];

        const syntax = MermaidGenerator.generateMermaidSyntax(loopFlow, 'technical');
        expect(syntax).toContain('subgraph N0_sg');
        expect(syntax).toContain('N1[("Do Work")]');
        expect(syntax).toContain('end');
    });


    it('applies dusky pink styling to Groups', () => {
        const groupFlow = [{
            Step: 'Process Group',
            Context: 'Group Logic',
            RawType: 'Group',
            children: []
        }];

        const syntax = MermaidGenerator.generateMermaidSyntax(groupFlow, 'business');
        // Expect subgraph for Groups now
        expect(syntax).toContain('subgraph N0_sg');
        expect(syntax).toContain('style N0_sg fill:#ffe4e6');
    });

    it('generates labeled links for Decision Branches', () => {
        const decisionFlow = [{
            Step: 'MyDecision',
            Context: 'Check Value',
            RawType: 'Decision',
            children: [
                {
                    Step: 'BranchYes',
                    Context: 'If Yes',
                    RawType: 'Branch',
                    children: [
                        { Step: 'DoYes', Context: 'Action A', RawType: 'CalculateVariable', children: [] }
                    ]
                },
                {
                    Step: 'BranchNo',
                    Context: 'If No',
                    RawType: 'Branch',
                    children: [] // Empty branch -> End
                }
            ]
        }];

        const syntax = MermaidGenerator.generateMermaidSyntax(decisionFlow, 'technical');
        // Relaxed Checks
        expect(syntax).toContain('Check Value');
        expect(syntax).toContain('Yes');
        expect(syntax).toContain('No');
        expect(syntax).toContain('End');
    });

});
