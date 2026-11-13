import { writeFileSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// Loading this config holds each server inside `createVitest` for 60 s, as loading Vitest does on
// a busy machine, so a server is mid-load when its coordinator dies (e2e.test.ts, T6 at start-up).
// It marks both ends of the load in files under the path the test hands it: the test kills the
// coordinator once a server is `loading`, and a server that reaches `loaded` lived through a load
// its dead coordinator could never use, which is the defect. 60 s, not the 4 s it was: the verdict
// is the marker, not a clock, and a load this long does not end before even a starved server reads
// the disconnect (measured 2026-11-12: servers took up to 21 s to exit at load 200).
const START_DELAY_MS = 60_000;
const marker = process.env['OXMUTATE_E2E_MARKER'];
if (marker) writeFileSync(`${marker}.loading-${String(process.pid)}`, '');
await new Promise((resolve) => setTimeout(resolve, START_DELAY_MS));
if (marker) writeFileSync(`${marker}.loaded-${String(process.pid)}`, '');

export default defineConfig({ test: { include: ['src/**/*.spec.ts'] } });
