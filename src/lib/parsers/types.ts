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
