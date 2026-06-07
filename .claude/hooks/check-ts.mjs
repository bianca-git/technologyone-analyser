#!/usr/bin/env node
/**
 * PostToolUse hook — typecheck + lint after editing a src TypeScript file.
 *
 * Surfaces type regressions and lint errors mid-session instead of at commit.
 * Strict typing (no `any` on the XML spine) is a live project goal.
 *
 * Runs `eslint --fix` on the edited file, then a project-wide `tsc --noEmit`
 * (tsc has no reliable single-file mode with project references). Non-blocking:
 * always exits 0 so edits aren't rejected; findings are printed for Claude to act on.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function normalize(p) {
    return String(p || '').replace(/\\/g, '/');
}

let raw = '';
try {
    raw = readFileSync(0, 'utf-8');
} catch {
    process.exit(0);
}

let payload;
try {
    payload = JSON.parse(raw);
} catch {
    process.exit(0);
}

const input = payload.tool_input ?? payload.toolInput ?? {};
const file = normalize(input.file_path ?? input.filePath ?? input.path);

// Only act on src TS/TSX files (accept absolute or relative paths; case-insensitive for Windows).
if (!/(?:^|\/)src\/.*\.(ts|tsx)$/i.test(file)) process.exit(0);

// Defence in depth: on win32 we spawn with shell:true (needed to resolve the
// pnpm .cmd shim), so the shell could reinterpret metacharacters in `file`.
// Reject any path containing shell-significant chars — a legitimate source
// path under src/ never needs them.
if (/[;&|`$(){}<>"'!*?\s\\]/.test(file.replace(/\//g, ''))) {
    process.exit(0);
}

const out = [];

// Args are passed as an array (not a shell string). On POSIX (shell:false)
// this fully prevents shell interpretation of the file path. On win32 we set
// shell:true so spawn can resolve the `pnpm` .cmd shim — there the shell CAN
// reinterpret metacharacters, which is why the caller already rejects any
// `file` containing shell-significant characters before we get here.
function run(label, cmd, args) {
    const res = spawnSync(cmd, args, {
        stdio: 'pipe',
        encoding: 'utf-8',
        shell: process.platform === 'win32',
    });
    if (res.error) {
        out.push(`[${label}]\n${res.error.message}`);
        return;
    }
    if (res.status !== 0) {
        const msg = `${res.stdout || ''}${res.stderr || ''}`.trim();
        if (msg) out.push(`[${label}]\n${msg}`);
    }
}

run('eslint', 'pnpm', ['exec', 'eslint', '--fix', file]);
run('tsc', 'pnpm', ['exec', 'tsc', '--noEmit']);

if (out.length) {
    process.stderr.write(out.join('\n\n') + '\n');
}
process.exit(0);
