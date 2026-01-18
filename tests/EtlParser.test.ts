
import { describe, it, expect } from 'vitest';
import { EtlParser } from '../src/lib/parsers/EtlParser';

describe('EtlParser', () => {

    describe('getTextSafe', () => {
        it('returns string as is', () => {
            expect(EtlParser.getTextSafe('hello')).toBe('hello');
        });

        it('returns #text from object', () => {
            expect(EtlParser.getTextSafe({ '#text': 'world' })).toBe('world');
        });

        it('returns empty string for null/undefined', () => {
            expect(EtlParser.getTextSafe(null)).toBe('');
            expect(EtlParser.getTextSafe(undefined)).toBe('');
        });
    });

    describe('flattenLogic (IIF Parser)', () => {
        it('returns null for non-IIF strings', () => {
            expect(EtlParser.flattenLogic('Just a string')).toBeNull();
        });

        it('parses simple IIF', () => {
            const expr = 'IIF(A=B, "Yes", "No")';
            const result = EtlParser.flattenLogic(expr);
            expect(result).toHaveLength(2);
            expect(result?.[0]).toEqual({ outcome: '"Yes"', condition: 'A=B' });
            expect(result?.[1]).toEqual({ outcome: '"No"', condition: 'Default - When nothing fits the above cases' });
        });

        it('parses nested IIF', () => {
            // IIF(Cond1, Out1, IIF(Cond2, Out2, Out3))
            const expr = 'IIF(Type="A", "Alpha", IIF(Type="B", "Beta", "Gamma"))';
            const result = EtlParser.flattenLogic(expr);

            expect(result).toHaveLength(3);
            expect(result?.[0]).toEqual({ outcome: '"Alpha"', condition: 'Type="A"' });
            expect(result?.[1]).toEqual({ outcome: '"Beta"', condition: 'Type="B"' });
            expect(result?.[2]).toEqual({ outcome: '"Gamma"', condition: 'Default - When nothing fits the above cases' });
        });
    });

    describe('parseSteps', () => {
        it('should parse a simple linear flow', () => {
            const mockSteps = {
                ArrayOfStep: {
                    Step: [
                        {
                            StepId: "1",
                            ParentStepId: "0",
                            Name: "Start",
                            StepType: "RunDirectQuery",
                            Sequence: "1",
                            Definition: {
                                StorageObject: {
                                    TableName: "SourceTable"
                                }
                            }
                        }
                    ]
                }
            };

            const result = EtlParser.parseSteps(mockSteps, 'technical');

            expect(result.executionTree).toHaveLength(1);
            const step = result.executionTree[0];
            expect(step.Step).toBe('Start');
            expect(step.RawType).toBe('RunDirectQuery');
            expect(result.tableSet.has('SourceTable')).toBe(true);
        });

        it('should handle hierarchy (Groups/Loops)', () => {
            const mockSteps = {
                ArrayOfStep: {
                    Step: [
                        {
                            StepId: 10,  // Changed to number
                            ParentStepId: 0,
                            Name: "Main Group",
                            StepType: "Group",
                            Sequence: "1"
                        },
                        {
                            StepId: 11, // Changed to number
                            ParentStepId: 10, // Changed to number
                            Name: "Child Action",
                            StepType: "RunSimpleQuery",
                            Sequence: "1"
                        }
                    ]
                }
            };

            const result = EtlParser.parseSteps(mockSteps, 'technical');

            expect(result.executionTree).toHaveLength(1); // Only root
            const root = result.executionTree[0];
            expect(root.RawType).toBe('Group');
            expect(root.children).toHaveLength(1);
            expect(root.children[0].Step).toBe('Child Action');
        });

        it('should extract variables from SetVariable', () => {
            const mockSteps = {
                ArrayOfStep: {
                    Step: [
                        {
                            StepId: "1",
                            ParentStepId: "0",
                            Name: "Set Var",
                            StepType: "SetVariable",
                            Definition: {
                                StorageObject: {
                                    VariableName: "myVar",
                                    VariableValue: "123"
                                }
                            }
                        }
                    ]
                }
            };

            const result = EtlParser.parseSteps(mockSteps, 'technical');
            expect(result.variableSet.has('myVar')).toBe(true);
            const variable = result.variables.find(v => v.Name === 'myVar');
            expect(variable?.Value).toBe('123');
        });
    });
});
