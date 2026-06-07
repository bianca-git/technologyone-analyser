---
name: verify-app
description: Verify a UI/render change in the T1 Analyser by running the dev server, loading a real sample file, and checking the rendered view + console. Use after changing any generator, formatter, main.ts render path, or styling — and whenever asked to "verify the app", "check it renders", or "confirm the change works in the browser".
---

# Verify App

The T1 Analyser is browser-rendered (vanilla DOM, no framework). DOM-only assertions miss
visual/console regressions. This skill runs the real app against a real sample and checks it.

## When to use

After editing: `src/lib/generators/*`, `src/lib/formatters/*`, `src/main.ts` render/template
functions, `src/style.css`, or anything that changes what the user sees.

## Steps

### 1. Start the dev server
```bash
pnpm dev        # Vite, http://localhost:5173
```
Run it in the background; don't block on it.

### 2. Open the app
Use Chrome DevTools MCP (preferred — real screenshots + console + network) or Claude Preview:
- Navigate to `http://localhost:5173`.
- **OfflineVerifier blocks the UI until the device looks offline.** In the browser, this overlay
  may appear. For verification you usually need to dismiss/bypass it — check `OfflineVerifier.ts`
  for the current bypass (it monitors `navigator.onLine` + active pings). If it blocks rendering,
  note it and use the test suite for logic, the browser only for the visual layer you can reach.

### 3. Load a sample
Samples live in `samples/`. Good ETL choices:
- `samples/ETLs/FPR_TRANS_*.t1etlp` — general ETL flow
- `samples/ETLs/SAVETODATETIME_*.t1etlp` — smaller, fast
- `samples/ETLs/COMMENTS_*.t1etlp` — comment-heavy (XSS-relevant)

Data Models: `samples/Data Models/`. Drive the file-input / drag-drop the app exposes (inspect
`FileProcessor` wiring in `main.ts` for the input element id).

### 4. Check
- **Console clean** — no errors/warnings (list_console_messages / preview_console_logs).
- **Render correct** — the flow diagram / step list / table view shows expected content.
  Screenshot it.
- **Network silent** — local-first app should make no data-path requests (list_network_requests).
- If you changed perf-sensitive code, run a Lighthouse audit or check that the `mermaid` chunk
  only loads when a diagram renders (Network tab).

### 5. Report
Share the screenshot + a one-line verdict. If broken: read the source, fix, re-check from step 3.
Never ask the user to check manually — verify and show proof.

## Fallback
If the browser path is blocked (offline overlay, MCP unavailable): run `pnpm test` for logic
coverage and say explicitly that the visual layer was not verified in-browser.
