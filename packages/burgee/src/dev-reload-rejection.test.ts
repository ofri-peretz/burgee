/**
 * A reload the watcher started must not reject to nobody.
 *
 * `reload()` reports its own failures: it attaches a catch to the reload's promise and
 * keeps that as `chain`, so the *next* caller waits on a promise that never rejects. But
 * the catch is on a **derived** promise — the one `reload()` itself returns still rejects,
 * and the watcher discards it (`void reload()`). So a save that lands while the entry is
 * being removed produces an unhandled rejection, which vitest reports as an error *after*
 * the suite has passed and CI reads as a failed run with 229 passing tests.
 *
 * That is not hypothetical: it took macos-latest red on PR #50 with
 * `ERR_MODULE_NOT_FOUND … cli.ts?burgee-dev=3`, a debounced reload importing a fixture the
 * teardown had already deleted.
 *
 * This reproduces it directly — start the watcher, let it schedule a reload, delete the
 * entry out from under it — and fails on the unfixed code with exactly that rejection.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { dev } from './dev.js';

const DEBOUNCE_MS = 5;
/** Long enough for the debounce to fire and its reload to fail, on a loaded runner. */
const SETTLE_MS = 400;

// The entry has to load for real, or `ready` fails and the rejection under test is
// drowned out by the fixture's own. Same trick dev.test.ts uses: an absolute specifier.
const burgee = JSON.stringify(resolve(dirname(fileURLToPath(import.meta.url)), 'index.ts'));
const ENTRY = `import { defineCommand, defineProgram } from ${burgee};
export const program = defineProgram({ name: 'reloaddemo', description: 'a CLI that is about to vanish', commands: [defineCommand({ name: 'ping', description: 'Reply', effects: 'read_only', run: () => 'pong' })] });
`;

let dir = '';
afterEach(() => {
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('the watcher never rejects to nobody', () => {
  it('a debounced reload whose entry vanished is reported, not thrown at the process', async () => {
    dir = mkdtempSync(join(tmpdir(), 'burgee-reload-'));
    const entry = join(dir, 'cli.ts');
    writeFileSync(entry, ENTRY);

    const logged: string[] = [];
    const handle = dev({
      entry,
      input: new PassThrough(),
      output: new PassThrough(),
      log: { write: (s: string) => logged.push(s) },
      debounceMs: DEBOUNCE_MS,
    });
    await handle.ready;

    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => void rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    try {
      // Touch the entry so the watcher schedules a reload, then take it away before the
      // debounce fires — the exact shape of a teardown racing a pending reload.
      writeFileSync(entry, `${ENTRY}// touched\n`);
      rmSync(entry, { force: true });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    } finally {
      process.off('unhandledRejection', onRejection);
      handle.close();
    }

    expect(rejections, `unhandled: ${rejections.map((r) => (r instanceof Error ? r.message : String(r))).join(' | ')}`).toEqual([]);
  });
});
