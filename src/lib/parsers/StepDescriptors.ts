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

const scriptDescriptor: DescriptorFn = (storage, _step, h) => {
    const lang = h.firstOf(storage, ['ScriptLanguage', 'Language']);
    const body = h.firstOf(storage, ['ScriptText', 'Script']);
    const details: string[] = [];
    if (lang) details.push(`Language: ${lang}`);
    if (body) {
        const preview = body.length > 150 ? body.substring(0, 150) + '...' : body;
        details.push(`Script: ${preview}`);
    }
    const label = lang ? `Script: ${lang}` : 'Script';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '📜',
    };
};

const startProcessDescriptor: DescriptorFn = (storage, _step, h) => {
    const proc = h.firstOf(storage, ['ProcessName', 'ProcessToRun', 'Process', 'SubProcessName']);
    const details: string[] = [];
    if (proc) details.push(`Process: ${proc}`);
    h.getListSafe(storage.Parameters, 'ParameterItem').forEach((p) => {
        details.push(`Param: ${h.getTextSafe(p.Name)} = ${h.getTextSafe(p.Value)}`);
    });
    const label = proc ? `Run: ${proc}` : 'Run Process';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: proc ? [proc] : [],
        explicitOutput: proc ? { type: 'PROCESS', name: proc } : null,
        icon: '▶',
    };
};

const dtsDescriptor: DescriptorFn = (storage, _step, h) => {
    const pkg = h.firstOf(storage, ['DTSPackageName', 'PackageName', 'DTSPackage', 'Package']);
    const conn = h.firstOf(storage, ['ConnectionString', 'Connection', 'DTSConnection']);
    const details: string[] = [];
    if (pkg) details.push(`Package: ${pkg}`);
    if (conn) details.push(`Connection: ${conn}`);
    const label = pkg ? `DTS: ${pkg}` : 'DTS';
    return {
        contextText: label,
        flowLabel: label,
        details,
        inputs: [],
        outputs: [],
        explicitOutput: null,
        icon: '🔀',
    };
};

export const STEP_DESCRIPTORS: Record<string, DescriptorFn> = {
    Group: groupDescriptor,
    Script: scriptDescriptor,
    ExecuteScript: scriptDescriptor,
    StartProcess: startProcessDescriptor,
    RunProcess: startProcessDescriptor,
    DTS: dtsDescriptor,
    ExecuteDTS: dtsDescriptor,
    RunDTS: dtsDescriptor,
};
