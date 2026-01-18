
import { describe, it, expect } from 'vitest';
import { EtlParser } from '../src/lib/parsers/EtlParser';

describe('EtlParser (Kitchen Sink)', () => {
    it('parses all step types to ensure branch coverage', () => {
        const mockSteps = {
            ArrayOfStep: {
                Step: [
                    {
                        StepId: 1, ParentStepId: 0, Name: "Join", StepType: "JoinTable",
                        Definition: { StorageObject: { JoinTable1: "A", JoinTable2: "B", Joins: { JoinItemDef: { JoinTable1: "A", JoinColumn1: "ID", JoinTable2: "B", JoinColumn2: "ID", JoinType: "Inner" } } } }
                    },
                    {
                        StepId: 2, ParentStepId: 0, Name: "Create", StepType: "CreateTable",
                        OutputTableDefinition: { Columns: { ColumnItem: [{ ColumnName: "NewCol", ColumnType: "String" }] } }
                    },
                    {
                        StepId: 3, ParentStepId: 0, Name: "Export", StepType: "ExportToExcel",
                        Definition: { StorageObject: { FileName: "file.xlsx", SheetName: "Data", UpdateExistingSheet: "true" } }
                    },
                    {
                        StepId: 4, ParentStepId: 0, Name: "Email", StepType: "SendEmail",
                        Definition: { StorageObject: { SubjectLine: "Hello", SendEmailAttachmentConfigItems: { SendEmailAttachmentConfigItem: { FileMask: "*.txt" } } } }
                    },
                    {
                        StepId: 5, ParentStepId: 0, Name: "Load File", StepType: "LoadTextFile",
                        Definition: { StorageObject: { FileName: "input.csv", FileEncoding: "UTF-8", StartCondition: "Head", StopCondition: "EOF" } }
                    },
                    {
                        StepId: 6, ParentStepId: 0, Name: "Datasource", StepType: "RunDatasourceQuery",
                        Definition: { StorageObject: { DataSource: { Description: "DS1" }, DataSourceParameters: { DataSourceParameterItem: { DataSourceParameterName: "P1", DataSourceParameterValue: "V1" } } } }
                    },
                    {
                        StepId: 7, ParentStepId: 0, Name: "Import", StepType: "ImportWarehouseData",
                        Definition: { StorageObject: { ImportOption: "IU", ColumnMapping: { TableColumnMapping: [{ ColumnName: "Tgt", MappedValue: "Src" }] } } }
                    }
                ]
            }
        };

        const result = EtlParser.parseSteps(mockSteps, 'technical');

        expect(result.executionTree).toHaveLength(7);
        // We just want to ensure it runs without error and covers the branches.
        // We can assert specific details if we want.
        const joinStep = result.executionTree.find(s => s.Step === 'Join');
        expect(joinStep?.TableData?.[0].Col1).toBe('A.ID');

        const emailStep = result.executionTree.find(s => s.Step === 'Email');
        expect(emailStep?.Details.join('')).toContain('Subject: Hello');
        expect(emailStep?.Details.join('')).toContain('*.txt');
    });
});
