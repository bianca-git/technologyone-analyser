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
});
