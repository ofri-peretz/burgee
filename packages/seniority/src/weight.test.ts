/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Weight, per entry and as published. Mirrors `bellpull/src/weight.test.ts`.
 *
 * It reads `dist/`, so it measures what is published rather than what is written. The
 * whole-package ceiling, the zero-dependency claim and `seniority/yaml`'s own budget live in
 * `shape.test.ts`; this file adds what that one does not hold — a budget per published entry,
 * and the band.
 *
 * **Why this file exists.** Until 2026-10-05 seniority had no test comparing
 * `layers.seniority.ours` in `.sdlc/bands/foundation-ceilings.json` to `npm pack`. The band read
 * 164,614 B while the package shipped 193,590 B after `seniority/yaml` landed (#776), and nothing
 * failed: the README printed the stale ratio as a measurement.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, { import: string } | string> };

interface EntryRule {
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules this entry must never reach, whatever else changes. */
  denied: string[];
}

/** The program, and the parser a program carries only if it reads YAML (D-20260930-seniority-yaml). */
const NEVER = ['cli.js', 'check.js', 'yaml.js'];
/** One façade per graded incumbent. Overriding `dotenv` must not acquire the cosmiconfig façade. */
const FACADES = ['cosmiconfig.js', 'dotenv.js', 'lilconfig.js', 'rc.js', 'find-up.js'];
const others = (own: string): string[] => FACADES.filter((f) => f !== own);
/** The pure half: what reads a file is `./config` and the façades. */
const DISK = ['search.js', 'load.js', 'runtime.js'];

// Measured 2026-10-05 on a clean build; each budget is the measurement plus a few percent.
const RULES: Record<string, EntryRule> = {
  // The root re-exports the cosmiconfig surface, so it carries that façade and no other. 42,950.
  '.': { budget: 45_000, denied: [...NEVER, 'plugin.js', ...others('cosmiconfig.js')] },
  './precedence': { budget: 4_000, denied: [...NEVER, ...FACADES, ...DISK] },
  './explain': { budget: 3_000, denied: [...NEVER, ...FACADES, ...DISK] },
  // Registering a plugin reads no file. 7,744.
  './plugin': { budget: 8_200, denied: [...NEVER, ...FACADES, ...DISK] },
  './config': { budget: 13_000, denied: [...NEVER, ...FACADES] },
  './cosmiconfig': { budget: 26_000, denied: [...NEVER, ...others('cosmiconfig.js')] },
  // Raised 10,700 → 18,200 on 2026-10-06 for dotenv 18: its `{ fast: true }` character scanner
  // (`dotenv-scan.js`) and the `DOTENV_*` defaults (`dotenv-options.js`), both on `config()`'s
  // path as upstream has them. 17,479.
  './dotenv': { budget: 18_200, denied: [...NEVER, ...others('dotenv.js')] },
  // `import 'dotenv/config'`: the façade and one call. 17,713.
  './dotenv/config': { budget: 18_500, denied: [...NEVER, ...others('dotenv.js')] },
  // `dotenv run`: the façade, argv and the spawn that forwards signals. 28,682.
  './dotenv/cli': { budget: 29_800, denied: [...NEVER, ...others('dotenv.js')] },
  './lilconfig': { budget: 13_500, denied: [...NEVER, ...others('lilconfig.js')] },
  './rc': { budget: 12_000, denied: [...NEVER, ...others('rc.js')] },
  './find-up': { budget: 2_800, denied: [...NEVER, ...others('find-up.js')] },
  // Same number as `shape.test.ts`'s YAML_BYTES; here it must also reach nothing else.
  './yaml': { budget: 25_000, denied: ['cli.js', 'check.js', 'index.js', ...FACADES, ...DISK] },
};

/** Static `from '…'`, `import('…')` and bare `import '…'`, read as tokens as in `shape.test.ts`. */
function specifiers(text: string): string[] {
  return ts.preProcessFile(text, true, true).importedFiles.map((f) => f.fileName);
}

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (!spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

const entryFile = (subpath: string): string => resolve(pkgRoot, (manifest.exports[subpath] as { import: string }).import);

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('depends on nothing', () => {
    expect(graph.external).toEqual([]);
  });

  it('reaches nothing on its denied list', () => {
    expect(graph.reached.filter((f) => rule.denied.includes(f))).toEqual([]);
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    // A new subpath without a budget here fails, which is the point: a new surface cannot
    // ship until someone has said what it may weigh.
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });
});

/** npm on Windows is `npm.cmd`, which Node will only spawn through a shell. Fixed argv, nothing to escape. */
const WINDOWS = process.platform === 'win32';
const measured = (): number =>
  (JSON.parse(execFileSync(WINDOWS ? 'npm.cmd' : 'npm', ['pack', '--dry-run', '--json'], { cwd: pkgRoot, encoding: 'utf8', shell: WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] })) as { unpackedSize: number }[])[0]?.unpackedSize ?? 0;

interface BandLayer {
  ours: number;
  ceiling: number;
  ratio: number;
}
const band = (): BandLayer =>
  (JSON.parse(readFileSync(resolve(pkgRoot, '../../.sdlc/bands/foundation-ceilings.json'), 'utf8')) as { layers: Record<string, BandLayer> }).layers['seniority'] as BandLayer;

describe('the ceilings file', () => {
  it(
    'tracks the band: what this package weighs is what the ceilings file says it weighs',
    () => {
      const ours = measured();
      const { ours: recordedOurs, ceiling, ratio: recordedRatio } = band();
      // R9's claim in the form D1 defines it: under the installed tree of cosmiconfig + dotenv + rc.
      expect(ours).toBeLessThanOrEqual(ceiling);
      // Equality against the band rather than a literal: the band follows the package, and
      // either moving without the other goes red here.
      expect({ ours, ratio: Number((ours / ceiling).toFixed(4)) }, 'the package and its recorded weight disagree — run `npm run weight:converge`').toEqual({
        ours: recordedOurs,
        ratio: recordedRatio,
      });
    },
    120_000,
  );
});
