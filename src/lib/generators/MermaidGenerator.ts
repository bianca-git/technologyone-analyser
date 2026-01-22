
import mermaid from 'mermaid';

export class MermaidGenerator {

    /**
     * initializes the mermaid library with the "Clean" theme.
     */
    static initialize() {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
                primaryColor: '#e0e7ff', // Indigo 100
                primaryTextColor: '#1e3a8a', // Indigo 900
                primaryBorderColor: '#6366f1', // Indigo 500
                lineColor: '#64748b', // Slate 500
                secondaryColor: '#f0f9ff', // Sky 50
                tertiaryColor: '#fff',
            },
            flowchart: {
                curve: 'basis', // Smooth curves
                padding: 15,
                nodeSpacing: 50,
                rankSpacing: 50,
            }
        });
    }

    /**
     * Generates the mermaid syntax for the given flow.
     */
    static generateMermaidSyntax(flow: any[], mode: 'business' | 'technical'): string {
        const isTech = mode === 'technical';
        let graph = 'flowchart TD\n';

        // Define classes for styling
        graph += '    classDef source fill:#dbeafe,stroke:#1e40af,stroke-width:2px,color:#1e40af;\n'; // Blue (light bg, dark text/border)
        graph += '    classDef target fill:#dcfce7,stroke:#166534,stroke-width:2px,color:#166534;\n'; // Green (light bg, dark text/border)
        graph += '    classDef process fill:#f3f4f6,stroke:#9ca3af,stroke-width:1px,color:#374151;\n'; // Gray
        graph += '    classDef decision fill:#fff7ed,stroke:#f97316,stroke-width:1px,color:#7c2d12,shape:diamond;\n'; // Orange
        graph += '    classDef error fill:#fef2f2,stroke:#dc2626,stroke-width:2px,color:#991b1b;\n'; // Red
        graph += '    classDef group fill:#ffe4e6,stroke:#f43f5e,stroke-width:2px,color:#881337,stroke-dasharray: 5 5;\n'; // Dusky Pink (Rose)
        graph += '    classDef endNode fill:#1e293b,stroke:#334155,stroke-width:2px,color:#fff,shape:circle;\n'; // Dark Slate Circle
        graph += '    classDef bigSave fill:#dcfce7,stroke:#166534,stroke-width:3px,color:#166534,font-size:14px,font-weight:bold;\n'; // Green (for files)

        let steps: string[] = [];
        let links: string[] = [];
        let nodeId = 0;
        const nodeMap = new Map<string, string>(); // StepName -> NodeID

        const getSafeId = (name: string) => {
            if (!nodeMap.has(name)) {
                nodeMap.set(name, `N${nodeId++}`);
            }
            return nodeMap.get(name)!;
        };

        const escapeLabel = (label: string) => {
            // Allow more characters for detailed labels (80 chars)
            return label.replace(/["()]/g, '').slice(0, 80);
        };

        const traverse = (items: any[], parentId?: string, incomingLabel?: string): string | undefined => {
            let previousId = parentId;
            let currentLabel = incomingLabel;

            items.forEach(item => {
                // --- Group Handling (Subgraph) ---
                if (item.RawType === 'Group' || (isTech && item.RawType === 'Loop')) {
                    const groupId = getSafeId(item.Step);
                    // Use a subgraph for visual grouping
                    steps.push(`    subgraph ${groupId}_sg ["${item.RawType}: ${item.Step}"]`);
                    graph += `    style ${groupId}_sg fill:#ffe4e6,stroke:#f43f5e,stroke-dasharray: 5 5\n`; // Inline style workaround or use classDef if possible for subgraphs? 
                    // Note: Mermaid classes on subgraphs are tricky.

                    // Recurse: The first child links to 'previousId'.
                    // The 'traverse' returns the ID of the last child in the group.
                    const lastChildId = traverse(item.children, previousId, currentLabel);
                    steps.push(`    end`);

                    // The last node of the group becomes the 'previousId' for the next sibling
                    if (lastChildId) {
                        previousId = lastChildId;
                        currentLabel = undefined; // Label consumed by first child
                    }
                    return;
                }

                // --- Special Handling for Branch (Structural) ---
                if (item.RawType === 'Branch') {
                    // Extract Condition
                    let condition = item.FlowLabel || item.Context || 'Condition';
                    if (condition.startsWith('If ')) condition = condition.substring(3);

                    if (item.children && item.children.length > 0) {
                        // Pass condition to the first child of the branch
                        traverse(item.children, parentId, condition);
                    } else {
                        // Empty Branch -> Connect to End Node
                        const endId = getSafeId(`${item.Step}_END`);
                        steps.push(`    ${endId}(("End")):::endNode`);
                        if (parentId) {
                            links.push(`    ${parentId} -- "${condition}" --> ${endId}`);
                        }
                    }
                    return; // Done with Branch, don't render it as a node
                }


                const id = getSafeId(item.Step);
                // Use FlowLabel if available, fallback to Context/Step
                let label = escapeLabel(item.FlowLabel || item.Context || item.Step);

                // Highlight Filters
                if (item.ExistsLogic && item.ExistsLogic.length > 0) {
                    label = `🌪️ ${label}`;
                }

                let shape = '[', shapeEnd = ']';
                let className = 'process';

                // --- Shape & Logic Mapping ---
                if (['RunDirectQuery', 'RunTableQuery', 'RunDatasourceQuery'].includes(item.RawType)) {
                    shape = '[('; shapeEnd = ')]';
                    className = 'source';
                    // Clean label for better readability - add icon without trailing space
                    const cleanLabel = label.replace(/^(Source Table: |Source: |Datasource: )/, '');
                    label = '📥 ' + cleanLabel.trim();
                }
                else if (['ImportWarehouseData', 'ExportToExcel', 'SendEmail'].includes(item.RawType)) {
                    shape = '(['; shapeEnd = '])';
                    className = 'target';
                    // Add icons for output actions - no trailing space
                    const cleanLabel = label.trim();
                    if (item.RawType === 'ImportWarehouseData') label = '📥' + cleanLabel;
                    if (item.RawType === 'ExportToExcel') label = '📊' + cleanLabel;
                    if (item.RawType === 'SendEmail') label = '✉️' + cleanLabel;
                }
                else if (['SaveText', 'SaveTextfile'].includes(item.RawType)) {
                    shape = '[/'; shapeEnd = '/]'; // Parallelogram
                    className = 'bigSave';
                    label = '📄 ' + label.trim(); // File icon
                }
                else if (['Decision'].includes(item.RawType)) {
                    shape = '{'; shapeEnd = '}';
                    className = 'decision';
                    label = '❓' + label.trim();
                }
                else if (['AddColumn', 'UpdateColumn'].includes(item.RawType)) {
                    shape = '[('; shapeEnd = ')]';
                    className = 'process';
                    if (!isTech) label = '⚙️' + label.trim(); // Simplified in business
                }
                else if (['CalculateVariable', 'SetVariable'].includes(item.RawType)) {
                    shape = '[('; shapeEnd = ')]';
                    className = 'process';
                    if (!isTech) label = '🔢' + label.trim(); // Simplified in business
                }

                // Business Mode Simplification: Make calc steps smaller/simplified but still visible
                if (!isTech && (item.RawType === 'AddColumn' || item.RawType === 'CalculateVariable') && !item.Description) {
                    // Don't skip - just simplify label
                    label = label.length > 30 ? label.substring(0, 30) + '...' : label;
                    // Use minimal node style
                    shape = '[('; shapeEnd = ')]';
                    className = 'process';
                    // Skip rendering this node in business mode
                    return;
                }

                steps.push(`    ${id}${shape}"${label}"${shapeEnd}:::${className}`);

                if (previousId) {
                    let linkDef = ' --> ';
                    // If connecting from parent and we have a label (Branch Condition)
                    if (previousId === parentId && currentLabel) {
                        linkDef = ` -- "${currentLabel}" --> `;
                        currentLabel = undefined; // Use only once
                    }
                    links.push(`    ${previousId}${linkDef}${id}`);
                }
                previousId = id; // Update chain

                if (item.children && item.children.length > 0) {
                    // Logic for containers (Loops, etc) could be subgraphs
                    // if (isTech && item.RawType === 'Loop') { // Handled as subgraph above
                    //     steps.push(`    subgraph ${id}_sg ["Loop: ${item.SmartDesc || 'Iterator'}"]`);
                    //     traverse(item.children, id);
                    //     steps.push(`    end`);
                    // }
                    if (item.RawType === 'Decision') {
                        // For Decision, children are Branches. 
                        // We pass 'id' (the Decision Node) as the parent. 
                        // The loop above will handle the 'Branch' types.
                        traverse(item.children, id);
                        // Decision flow continues? Usually Decision is a split.
                        // The siblings after decision? 
                        // Flow usually ends or converges. 
                        // For now, assume Decision is a terminal split or logic handles merge manually.
                        // We don't update previousId for Decision? 
                        // Actually, if there are steps AFTER Decision in the array, they should probably link from where?
                        // In this ETL, Decision usually contains steps. Steps matching sequence.
                    } else {
                        // Normal recursion (should imply Group/Loop handled above)
                        // If we are here, it's a node with children but NOT a Group/Loop/Branch.
                        // Maybe unknown container? Treat as chain.
                        const lastChild = traverse(item.children, id);
                        if (lastChild) previousId = lastChild;
                    }
                }
            });
            return previousId;
        };

        traverse(flow);

        // Deduplicate links
        const uniqueLinks = [...new Set(links)];

        if (steps.length === 0) return '';

        return graph + steps.join('\n') + '\n' + uniqueLinks.join('\n');
    }

    /**
     * Renders the flow chart to an SVG string using Mermaid.
     */
    static async renderToSvg(flow: any[], mode: 'business' | 'technical', id: string = 'mermaid-chart'): Promise<string> {
        this.initialize();
        const syntax = this.generateMermaidSyntax(flow, mode);
        try {
            const { svg } = await mermaid.render(id, syntax);
            return svg;
        } catch (e) {
            console.error('Mermaid Render Error:', e);
            return '<div class="text-red-500 font-mono text-xs p-2 border border-red-300 bg-red-50 rounded">Error Rendering Flow Chart</div>';
        }
    }

    /**
     * Renders simple syntax for direct embedding (if using mermaid.contentLoaded)
     */
    static getRawSyntax(flow: any[], mode: 'business' | 'technical'): string {
        return this.generateMermaidSyntax(flow, mode);
    }

    /**
     * Generates a base64 PNG image for DOCX embedding.
     */
    static async getFlowChartImage(flow: any[], mode: 'business' | 'technical'): Promise<string> {
        const svg = await this.renderToSvg(flow, mode, 'mermaid-hidden-' + Date.now());

        // 1. Create a dummy container to parse SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'image/svg+xml');
        const svgEl = doc.documentElement;

        // 2. Get dimensions
        const width = parseFloat(svgEl.getAttribute('width') || '800');
        const height = parseFloat(svgEl.getAttribute('height') || '600');

        // 3. Create formatting Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // High-res
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        // 4. Draw
        ctx.scale(2, 2);
        const img = new Image();
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        return new Promise((resolve) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => {
                console.error('Failed to convert SVG to Image');
                resolve('');
            };
            img.src = url;
        });
    }
}
