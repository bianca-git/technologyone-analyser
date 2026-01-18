/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    plugins: [
        tailwindcss(),
    ],
    test: {
        environment: 'jsdom',
        globals: true
    }
})