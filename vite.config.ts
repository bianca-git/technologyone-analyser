/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(version),
    },
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