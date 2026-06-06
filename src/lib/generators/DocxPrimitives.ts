/**
 * Low-level docx building blocks shared across the Word-export sections
 * (ETL, Data Model, Dashboard). Extracted from DocxGenerator so the large
 * generator file is about document *structure*, not cell/run plumbing.
 *
 * DocxGenerator re-exposes these as thin static delegates, so existing
 * `this.createText(...)` call sites keep working unchanged.
 */
import { Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, ShadingType } from 'docx';

const BODY_FONT = 'Segoe UI';

/** A standard body text run (Segoe UI 11pt by default). */
export function createText(text: string, opts: any = {}): TextRun {
    return new TextRun({ text: text || '', font: BODY_FONT, size: 22, ...opts });
}

/** A bold, grey-shaded header cell for table heading rows. */
export function createHeaderCell(text: string): TableCell {
    return new TableCell({
        children: [new Paragraph({ children: [createText(text, { bold: true, size: 20 })] })],
        shading: { fill: 'E0E0E0', type: ShadingType.CLEAR },
        verticalAlign: AlignmentType.CENTER,
    });
}

/** A standard body cell. Accepts either a string or pre-built paragraphs. */
export function createCell(text: string | Paragraph[], opts: any = {}): TableCell {
    const children =
        typeof text === 'string' ? [new Paragraph({ children: [createText(text, { size: 20, ...opts })] })] : text;
    return new TableCell({ children, verticalAlign: AlignmentType.CENTER });
}

// Re-export the docx row/table primitives the generator composes with, so
// section code can import everything docx-related from one place if desired.
export { Paragraph, Table, TableRow, TableCell };
