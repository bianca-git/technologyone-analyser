import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { build } from 'esbuild';

const DIST_DIR = path.resolve('dist');
const SW_SRC = path.resolve('sw.ts');
const SW_DEST = path.join(DIST_DIR, 'sw.js');

async function main() {
    console.log('🏗️  Building Service Worker...');

    if (!fs.existsSync(DIST_DIR)) {
        console.error('❌ dist/ directory not found. Run "vite build" first.');
        process.exit(1);
    }

    // 1. Scan dist/ for assets
    const files = await glob('**/*.*', { cwd: DIST_DIR });
    const assets = files
        .filter(f => !f.includes('sw.js')) // Don't cache the SW itself
        .map(f => `/${f.replace(/\\/g, '/')}`); // Ensure forward slashes

    console.log(`📦 Found ${assets.length} assets to cache.`);

    // 2. Read Source
    let source = fs.readFileSync(SW_SRC, 'utf-8');

    // 3. Inject Assets into Source (Before Compilation)
    const assetsJSON = JSON.stringify(assets, null, 4);
    const regex = /const\s+ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\];/;

    if (regex.test(source)) {
        source = source.replace(regex, `const ASSETS_TO_CACHE = ${assetsJSON};`);
        console.log('✅ Injected asset list into source.');
    } else {
        console.warn('⚠️  Could not find ASSETS_TO_CACHE in sw.ts. Check your variable naming.');
        // We continue anyway, but the cache list will be wrong/empty
    }

    // 4. Compile TS -> JS using esbuild
    const result = await build({
        stdin: {
            contents: source,
            resolveDir: process.cwd(),
            loader: 'ts',
        },
        write: false,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        outfile: 'sw.js'
    });

    const swContent = result.outputFiles[0].text;

    // 5. Write to dist
    fs.writeFileSync(SW_DEST, swContent);
    console.log(`🚀 Service Worker written to ${SW_DEST}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
