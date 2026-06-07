import type { XmlNode, XmlValue } from './types';
import { asNode } from './types';
import type { RawStep } from './EtlParser';

/** Display + lineage fields a descriptor produces for one step. */
export interface StepDescriptor {
    contextText: string;
    flowLabel: string;
    details: string[];
    inputs: string[];
    outputs: string[];
    explicitOutput: { type: string; name: string } | null;
    icon?: string;
    smartDesc?: string;
}

/** Leaf/list readers injected by EtlParser so this module stays decoupled. */
export interface DescriptorHelpers {
    getTextSafe: (v: XmlValue) => string;
    getListSafe: (v: XmlValue, key: string) => XmlNode[];
    /** Returns the first non-empty text value among the candidate keys. */
    firstOf: (storage: XmlNode, keys: string[]) => string;
}

export type DescriptorFn = (storage: XmlNode, step: RawStep, h: DescriptorHelpers) => StepDescriptor;

/**
 * Standalone helper factory (used by tests and as a fallback). EtlParser passes
 * its own statics in production so behavior matches the rest of the parser.
 */
export function makeHelpers(): DescriptorHelpers {
    const getTextSafe = (val: XmlValue): string => {
        if (val == null || val === '') return '';
        if (typeof val === 'string') return val;
        if (typeof val === 'number' || typeof val === 'boolean') return String(val);
        const node = asNode(val);
        if (node && typeof node['#text'] === 'string') return node['#text'];
        return '';
    };
    const getListSafe = (obj: XmlValue, key: string): XmlNode[] => {
        const node = asNode(obj);
        if (!node || node[key] == null) return [];
        const v = node[key];
        return (Array.isArray(v) ? v : [v]) as XmlNode[];
    };
    const firstOf = (storage: XmlNode, keys: string[]): string => {
        for (const k of keys) {
            const t = getTextSafe(storage[k]);
            if (t && t.trim().length > 0) return t.trim();
        }
        return '';
    };
    return { getTextSafe, getListSafe, firstOf };
}

const groupDescriptor: DescriptorFn = (_storage, step, h) => {
    const name = h.getTextSafe(step.Name) || 'Group';
    const count = (step.children || []).length;
    return {
        contextText: name,
        flowLabel: name,
        details: [],
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '🗂️',
        smartDesc: `Groups ${count} steps`,
    };
};

export const STEP_DESCRIPTORS: Record<string, DescriptorFn> = {
    Group: groupDescriptor,
};
