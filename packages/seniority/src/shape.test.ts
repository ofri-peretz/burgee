/**
 * R8, R11, R9 — the three properties that are claims rather than behaviour, locked.
 *
 * Each of these is something a README says. A claim nothing checks is a claim that stops
 * being true on a Tuesday: this file is why "zero dependencies", "nothing reads the process"
 * and "lighter than lilconfig" are statements about the built package rather than about an
 * intention.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, '..');
const DIST = join(PKG_ROOT, 'dist');
const manifest = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  exports: Record<string, unknown>;
};

/** The subpaths R8 names, plus the root and the plugin host. */
const SUBPATHS = ['.', './plugin', './cosmiconfig', './dotenv', './find-up', './schema.json'];

describe('the export map is the compatibility claim (R8)', () => {
  it('publishes the root, the plugin host and one override target per graded incumbent', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual([...SUBPATHS].sort());
  });

  it('gives every subpath its own entry point, so an override targets one and not the rest', () => {
    // Subpath isolation, as in `roundel`: a program overriding `dotenv` must not thereby
    // acquire the cosmiconfig façade, because the two are graded separately and a shared
    // entry would make one suite's pass rate depend on the other's module graph.
    const entries = Object.entries(manifest.exports)
      .filter(([key]) => key !== './schema.json')
      .map(([, value]) => (value as { import: string }).import);
    expect(new Set(entries).size).toBe(entries.length);
  });
});

describe('zero dependencies (constraint 3, Y1)', () => {
  it('declares none — not a short list, none', () => {
    expect(manifest.dependencies).toBeUndefined();
  });

  /**
   * Line-anchored, and doc-comment lines removed first. The loose form of this check — any
   * `from '…'` anywhere in the file — read the words `import` and `'cosmiconfig'` out of this
   * package's own prose and reported two dependencies that do not exist. A checker that reads
   * printed source rather than shape is the defect this repository has caught in itself
   * before, and it fails in the alarming direction here rather than the flattering one, which
   * is the only reason it was cheap.
   */
  it('imports nothing that is not a node builtin or a file in this package', () => {
    const foreign = sources().flatMap((file) => specifiers(readFileSync(file, 'utf8')));
    expect([...new Set(foreign)].filter((spec) => !spec.startsWith('node:') && !spec.startsWith('.'))).toEqual([]);
  });
});

describe('nothing reads the process (R11, Y9)', () => {
  /**
   * The repository-wide lock is `packages/burgee/src/process-reference-lock.test.ts`, and
   * seniority has no entry on its allow-list — which is the claim. This one is local and
   * deliberately redundant: it fails inside this package, where whoever broke it is working,
   * rather than in another package's suite.
   */
  it('names `process` nowhere in its sources', () => {
    const offenders = sources().filter((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => !/^\s*(\*|\/\/|\/\*)/.test(line) && /(?<![.\w])process\??\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/u.test(line.replace(/'(?:[^'\\]|\\.)*'/gu, "''").replace(/`(?:[^`\\$]|\\.)*`/gu, '``'))),
    );
    expect(offenders.map((f) => f.slice(PKG_ROOT.length))).toEqual([]);
  });
});

/**
 * R9 (Y8) — the weight ceiling.
 *
 * The bar is **`lilconfig`**, the lightest zero-dependency incumbent in this layer, and not
 * `cosmiconfig`, which ships `js-yaml`, `env-paths`, `parent-module` and `import-fresh` and
 * would therefore be a free pass. lilconfig's published tarball is ~14 kB unpacked.
 *
 * The number below is a **ceiling on our own growth**, checked against what is built rather
 * than what is written. It is deliberately not "smaller than lilconfig today": this package
 * also carries `resolve`, `explain`, the plugin host and three façades, which lilconfig does
 * not have. What the lock prevents is the thing weight locks exist to prevent — a dependency
 * or a bundled parser arriving without anyone noticing, which would move this by an order of
 * magnitude rather than by a few hundred bytes.
 */
const CEILING_BYTES = 140_000;

describe('the weight ceiling (R9, Y8)', () => {
  it('keeps the built package under its declared ceiling', () => {
    let total = 0;
    for (const file of walk(DIST)) {
      if (file.endsWith('.map') || file.endsWith('.d.ts')) continue;
      total += statSync(file).size;
    }
    expect(total, `dist is ${String(total)} B against a ceiling of ${String(CEILING_BYTES)} B — a jump this size is a dependency or a bundled parser, not a feature`).toBeLessThanOrEqual(CEILING_BYTES);
    // A floor as well as a ceiling: a `dist` that shrank to nothing means the build ran and
    // produced nothing, which would otherwise pass the assertion above with flying colours.
    expect(total).toBeGreaterThan(0);
  });
});

/** Every module specifier a file actually loads: static `from '…'`, and `import('…')`. */
function specifiers(text: string): string[] {
  const code = text
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');
  const statics = [...code.matchAll(/^\s*(?:import|export)\b[^'"\n]*from\s*'([^']+)'/gmu)].map((m) => m[1] ?? '');
  const dynamics = [...code.matchAll(/\bimport\(\s*'([^']+)'/gu)].map((m) => m[1] ?? '');
  const bare = [...code.matchAll(/^\s*import\s*'([^']+)'/gmu)].map((m) => m[1] ?? '');
  return [...statics, ...dynamics, ...bare];
}

function sources(): string[] {
  return walk(join(PKG_ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
}

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) walk(at, out);
    else out.push(at);
  }
  return out;
}
