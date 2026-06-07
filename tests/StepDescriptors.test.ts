import { describe, it, expect } from 'vitest';
import { STEP_DESCRIPTORS, makeHelpers } from '../src/lib/parsers/StepDescriptors';
import type { RawStep } from '../src/lib/parsers/EtlParser';

const h = makeHelpers();

describe('StepDescriptors', () => {
    describe('Group', () => {
        it('uses the step Name as label and counts children', () => {
            const step: RawStep = {
                StepType: 'Group',
                Name: 'Prep Chart of Accounts',
                Definition: { StorageObject: { DefKey: 'abc' } },
                children: [{ StepType: 'RunDirectQuery' }, { StepType: 'AddColumn' }],
            };
            const storage = { DefKey: 'abc' };
            const d = STEP_DESCRIPTORS['Group'](storage, step, h);
            expect(d.contextText).toBe('Prep Chart of Accounts');
            expect(d.flowLabel).toBe('Prep Chart of Accounts');
            expect(d.smartDesc).toBe('Groups 2 steps');
            expect(d.icon).toBe('🗂️');
            expect(d.inputs).toEqual([]);
            expect(d.outputs).toEqual([]);
            expect(d.explicitOutput).toBeNull();
        });

        it('falls back to "Group" when Name is empty', () => {
            const step: RawStep = { StepType: 'Group', Name: '', children: [] };
            const d = STEP_DESCRIPTORS['Group']({}, step, h);
            expect(d.contextText).toBe('Group');
            expect(d.smartDesc).toBe('Groups 0 steps');
        });
    });

    describe('Script', () => {
        it('extracts language and truncates body preview', () => {
            const body = 'x'.repeat(200);
            const storage = { ScriptLanguage: 'VBScript', ScriptText: body };
            const d = STEP_DESCRIPTORS['Script'](storage, { StepType: 'Script' }, h);
            expect(d.flowLabel).toBe('Script: VBScript');
            expect(d.icon).toBe('📜');
            expect(d.details.some((l) => l.startsWith('Language: VBScript'))).toBe(true);
            expect(d.details.some((l) => l.includes('...'))).toBe(true);
        });

        it('reads alternate keys and degrades without language', () => {
            const storage = { Language: 'PowerShell', Script: 'Get-Date' };
            const d = STEP_DESCRIPTORS['ExecuteScript'](storage, { StepType: 'ExecuteScript' }, h);
            expect(d.flowLabel).toBe('Script: PowerShell');
            const bare = STEP_DESCRIPTORS['Script']({}, { StepType: 'Script' }, h);
            expect(bare.flowLabel).toBe('Script');
        });
    });

    describe('StartProcess', () => {
        it('extracts process name, params, and output token', () => {
            const storage = {
                ProcessName: 'NightlyRollup',
                Parameters: { ParameterItem: [{ Name: 'Year', Value: '2026' }] },
            };
            const d = STEP_DESCRIPTORS['StartProcess'](storage, { StepType: 'StartProcess' }, h);
            expect(d.flowLabel).toBe('Run: NightlyRollup');
            expect(d.icon).toBe('▶');
            expect(d.explicitOutput).toEqual({ type: 'PROCESS', name: 'NightlyRollup' });
            expect(d.details.some((l) => l === 'Param: Year = 2026')).toBe(true);
        });

        it('reads alternate process key', () => {
            const d = STEP_DESCRIPTORS['RunProcess']({ ProcessToRun: 'P2' }, { StepType: 'RunProcess' }, h);
            expect(d.flowLabel).toBe('Run: P2');
        });
    });

    describe('DTS', () => {
        it('extracts package name and connection', () => {
            const storage = { DTSPackageName: 'LoadGL', ConnectionString: 'Server=x' };
            const d = STEP_DESCRIPTORS['DTS'](storage, { StepType: 'DTS' }, h);
            expect(d.flowLabel).toBe('DTS: LoadGL');
            expect(d.icon).toBe('🔀');
            expect(d.details.some((l) => l.startsWith('Connection: Server=x'))).toBe(true);
        });

        it('degrades to bare label when package missing', () => {
            const d = STEP_DESCRIPTORS['RunDTS']({}, { StepType: 'RunDTS' }, h);
            expect(d.flowLabel).toBe('DTS');
        });
    });
});
