/**
 * Shared types for the ETL parsing/generation flow path.
 *
 * `EtlStep` is the shape produced by `EtlParser.parseSteps` (the `info` object)
 * and consumed by the ETL summary/generator code. Fields are derived from
 * actual usage across the ETL path; anything not always present is optional.
 */

/** A single flattened logic branch (outcome under a given condition). */
export type LogicRule = { outcome: string; condition: string };

/** A parsed ETL execution step. */
export interface EtlStep {
    /** Step type discriminator (e.g. 'RunDirectQuery', 'ImportWarehouseData', 'Decision', ...). */
    RawType: string;
    /** Display name of the step. */
    Step?: string;
    /** Human-readable detail lines (filters, params, options, ...). */
    Details: string[];
    /** Input table / variable names feeding this step. */
    Inputs?: string[];
    /** Output table / variable names produced by this step. */
    Outputs?: string[];
    /** Explicit output descriptor (warehouse/table/variable). */
    Output?: { type?: string; name?: string } | null;
    /** Source classification (e.g. 'Analyser'). */
    SourceType?: string;
    /** Pipeline phase label (mirrors RawType, may carry " [DISABLED]"). */
    Phase?: string;
    /** Raw context string for the step. */
    Context?: string;
    /** Nested child steps. */
    children?: EtlStep[];
    /** Stable id derived from type + name. */
    id?: string;
    /** Flattened logic rules (for logic-table rendering). */
    Rules?: LogicRule[];
    /** Generic name field (used by some downstream consumers). */
    Name?: string;
    /** Generic value field. */
    Value?: string;

    // Allow the remaining dynamically-attached parser fields (SmartDesc,
    // TableData, Headers, FlowLabel, IsActive, Depth, StepId, etc.) without
    // forcing churn across the large parser builder object.
    [key: string]: any;
}

/**
 * A single leaf or node value in the raw `fast-xml-parser` tree. Leaves are
 * strings/numbers/booleans (text and attribute values); interior values are
 * further {@link XmlNode}s or arrays of values.
 */
export type XmlValue = string | number | boolean | XmlNode | XmlValue[] | undefined;

/**
 * Raw output of `fast-xml-parser`. Nodes are arbitrarily nested objects whose
 * leaves are strings (text/attribute values) or further nodes/arrays.
 *
 * The index signature is `XmlValue` (issue #28 tightened it from `any`).
 * Deep consumers narrow each access via {@link asNode} before reading nested
 * keys, and funnel leaf reads through `EtlParser.getTextSafe`/`getListSafe`.
 */
export interface XmlNode {
    [key: string]: XmlValue;
}

/**
 * Narrow an {@link XmlValue} to an object node — returns the node when `v` is a
 * non-array object, otherwise `undefined`. Use to walk dynamic XML paths
 * (`asNode(content.DataModel)?.DataModelDef`) without scattering `any`.
 */
export function asNode(v: XmlValue): XmlNode | undefined {
    return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as XmlNode) : undefined;
}

/** Parsed Data Model package (each key is the parsed contents of one XML file). */
export interface DataModelParsed {
    DataModel?: XmlNode;
    Queries?: XmlNode;
    QueryColumns?: XmlNode;
    QueryJoins?: XmlNode;
    QueryDatasources?: XmlNode;
    Variables?: XmlNode;
    Resources?: XmlNode;
    [key: string]: XmlNode | undefined;
}

/** Parsed Dashboard package (each key is the parsed contents of one XML file). */
export interface DashboardParsed {
    Dashboard?: XmlNode;
    Visualisations?: XmlNode;
    Links?: XmlNode;
    Variables?: XmlNode;
    Resources?: XmlNode;
    Theme?: XmlNode;
    [key: string]: XmlNode | undefined;
}
