/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                // Split heavy vendor libs into their own chunks so the main
                // entry stays small. mermaid is additionally lazy-loaded
                // (see MermaidGenerator) so it only downloads when a chart renders.
                manualChunks(id) {
                    if (id.includes('node_modules/mermaid')) return 'mermaid';
                    if (id.includes('node_modules/docx')) return 'docx';
                    if (id.includes('node_modules/fast-xml-parser') || id.includes('node_modules/jszip')) return 'xml';
                },
            },
        },
    },
    test: {
        environment: 'jsdom',
        globals: true
    }
})