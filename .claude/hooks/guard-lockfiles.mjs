#!/usr/bin/env node
/**
 * PreToolUse hook — blocks hand-edits to pnpm lock/workspace files.
 *
 * These regenerate via pnpm. Hand-edits have repeatedly broken CI
 * (ERR_PNPM_IGNORED_BUILDS, malformed pnpm-workspace.yaml). Change deps
 * with `pnpm add/remove`, not by editing these files.
 *
 * Reads the tool-call payload on stdin, exits 2 (with a message on stderr)
 * to block, exits 0 to allow.
 */
import { readFileSync } from 'node:fs';

const GUARDED = ['pnpm-lock.yaml', 'pnpm-workspace.yaml'];

function normalize(p) {
    return String(p || '').replace(/\\/g, '/').toLowerCase();
}

let raw = '';
try {
    raw = readFileSync(0, 'utf-8');
} catch {
    process.exit(0); // no stdin → nothing to guard
}

let payload;
try {
    payload = JSON.parse(raw);
} catch {
    process.exit(0);
}

const input = payload.tool_input ?? payload.toolInput ?? {};
const target = normalize(input.file_path ?? input.filePath ?? input.path);

if (GUARDED.some((name) => target.endsWith('/' + name) || target.endsWith(name))) {
    process.stderr.write(
        `Blocked: ${target.split('/').pop()} is managed by pnpm and must not be hand-edited.\n` +
            `Change dependencies with \`pnpm add\` / \`pnpm remove\` and let pnpm regenerate it.\n`
    );
    process.exit(2);
}

process.exit(0);
