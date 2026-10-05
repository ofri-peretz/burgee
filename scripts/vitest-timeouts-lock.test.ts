/**
 * Every workspace that runs vitest runs it on the family's clocks (`vitest-timeouts.config.ts`).
 *
 * vitest's defaults are 5 s a test and 10 s a hook. They are a bet on the machine, and the
 * pre-push battery runs every workspace at once beside endpoint scanners: on 2026-10-05 every
 * push from five sessions died in a docs app's `examples.test.ts`, whose `afterAll` removes
 * scratch installs, at `Hook timed out in 10000ms` — a different app each time, all green alone.
 * The nine docs apps had no vitest config at all, so they never got the clocks the packages had.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Workspace directories, from the root manifest's globs (`dir/*` or a plain `dir`). */
function workspaces(root: string): string[] {
  const globs = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { workspaces: string[] }).workspaces;
  return globs.flatMap((glob) =>
    glob.endsWith('/*')
      ? readdirSync(join(root, glob.slice(0, -2)), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          // POSIX on every OS: a workspace is named the way the manifest's globs name it.
          .map((e) => `${glob.slice(0, -2)}/${e.name}`)
      : [glob],
  );
}

/** Workspaces whose `test` script runs vitest and whose config does not take the family's clocks. */
export function offClock(root: string): string[] {
  return workspaces(root).filter((dir) => {
    const manifest = join(root, dir, 'package.json');
    if (!existsSync(manifest)) return false;
    const test = (JSON.parse(readFileSync(manifest, 'utf8')) as { scripts?: { test?: string } }).scripts?.test ?? '';
    if (!test.includes('vitest')) return false;
    const config = join(root, dir, 'vitest.config.ts');
    // The shared clocks, or a hook timeout of its own chosen on purpose (benchmarks, conformance).
    return !existsSync(config) || !/vitest-timeouts\.config|hookTimeout:/u.test(readFileSync(config, 'utf8'));
  });
}

describe('vitest clocks', () => {
  it('is not blind: a vitest workspace with no config, or a config without clocks, is named', () => {
    const fake = mkdtempSync(join(tmpdir(), 'clocks-'));
    try {
      writeFileSync(join(fake, 'package.json'), JSON.stringify({ workspaces: ['apps/*', 'lib'] }));
      for (const [dir, test, config] of [
        ['apps/bare', 'vitest run', undefined],
        ['apps/default', 'vitest run', "export default { test: { include: ['x'] } };"],
        ['apps/shared', 'vitest run', "import { timeouts } from '../../vitest-timeouts.config.js';"],
        ['lib', 'node --test', undefined],
      ] as const) {
        mkdirSync(join(fake, dir), { recursive: true });
        writeFileSync(join(fake, dir, 'package.json'), JSON.stringify({ scripts: { test } }));
        if (config !== undefined) writeFileSync(join(fake, dir, 'vitest.config.ts'), config);
      }
      mkdirSync(join(fake, 'apps/no-manifest'));
      expect(offClock(fake)).toEqual(['apps/bare', 'apps/default']);
    } finally {
      rmSync(fake, { recursive: true, force: true });
    }
  });

  it('every workspace that runs vitest spreads the family timeouts', () => {
    expect(offClock(ROOT), 'add a vitest.config.ts that spreads `timeouts` from vitest-timeouts.config.ts').toEqual([]);
  });
});
