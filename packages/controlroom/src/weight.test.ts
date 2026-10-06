/**
 * U5 / R14 — weight is paid per import. Mirrors `caique/src/weight.test.ts`: every published
 * entry declares the bare specifiers it may import, a byte budget over the `dist/` files it
 * reaches, and the modules it must never reach. It reads `dist/`, so it measures what is
 * published rather than what is written.
 *
 * **The root never resolves React** (R14, W3, the intent's constraint 6). `react` and
 * `react-reconciler` are optional peers reached from `controlroom/ink` alone, and the flexbox
 * subset lives under `ink/` alone; both are on the root's denied list, so a native-API program
 * can never pay for either.
 *
 * What this cannot say is how much the drop-in costs a program *with* React bundled: that is
 * W1 against `ink` + `react` (674,652 B), measured by the benchmark axis rather than here,
 * because the peers' bytes are the program's own install and not in `dist/`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');

interface Manifest {
  exports: Record<string, { import: string } | string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as Manifest;

/** Every package published from this repo, read from the directory so a new sibling cannot make this stale. */
const FAMILY = readdirSync(resolve(pkgRoot, '..')).filter((dir) => existsSync(resolve(pkgRoot, '..', dir, 'package.json')));

interface EntryRule {
  /** Bare specifiers this entry may import, statically or with `import()`. */
  allow: string[];
  /** Bytes reachable from it. A ratchet: lowering is free, raising is a decision with a comment. */
  budget: number;
  /** Modules and packages this entry must never reach. */
  denied: string[];
}

/** Every module of the drop-in, by its dist path: none of them may be reachable from the root. */
const INK = readdirSync(resolve(dist, 'ink'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => `ink/${f}`);

const RULES: Record<string, EntryRule> = {
  // The native API: the screen, the compositor, layout and tab state over the family. Measured
  // 12,672 B on 2026-10-05, reaching only same-repo subpaths and nothing of `ink/`.
  // Raised 2026-10-05 for R10 and R20, measured 20,485 B: `open()` resolves registered keymaps
  // and panes (the plugin registry and its validation) and hosts caique's line editor, so the
  // root reaches `plugin.js`, `caique/editor` and `flagstaff/plugin`'s registry.
  '.': {
    allow: ['caique/editor', 'caique/keys', 'closeout', 'closeout/cursor', 'flagstaff/loop', 'flagstaff/plugin', 'linegauge', 'roundel/policy'],
    budget: 21_000,
    denied: ['react', 'react-reconciler', ...INK],
  },
  // The Ink drop-in (R11, R12): the host config, the flexbox subset, the output grid, Ink's
  // components, hooks and write protocol. Its two optional peers are the program's own and
  // are not counted here. Measured 130,443 B on 2026-10-05 — the flexbox subset is 34,688 B
  // of it — against `ink` 6.8.0's own 169,374 B, before the 134,274 B of `yoga-layout` this
  // replaces. With React bundled it is W1's number, which the benchmark axis owns.
  // R10: keymaps and panes as data, validated against the family schema. Key specs are read by
  // caique's own `canonical()`, so no second key grammar lives here.
  './plugin': {
    allow: ['caique/keys'],
    budget: 4_200, // measured 3,965 B on 2026-10-05
    denied: ['react', 'react-reconciler', ...INK],
  },
  './ink': {
    allow: [
      'closeout',
      'closeout/cursor',
      'closeout/restore-cursor',
      'flagstaff/plugin',
      'linegauge',
      'paratext/csi',
      'paratext/link',
      'react',
      'react-reconciler',
      'react-reconciler/constants.js',
      'roundel/chalk',
      'roundel/policy',
      'roundel/tokens',
    ],
    // 134,554 B on 2026-10-05 with kitty keyboard negotiation (ink 584 / 584): still under ink's own.
    // Raised 2026-10-06 for ink 8 (D-20261006-controlroom-ink-8), measured 212,195 B: ink 8's
    // own runtime — the alternate screen, `suspendTerminal`, bracketed paste, `useAnimation`,
    // `useBoxMetrics`, incremental line updates, and yoga's insets, maxima, aspect ratio and
    // baselines in the flexbox port — against ink 8.0.0's own `build/` of 250,669 B before yoga.
    budget: 213_000,
    denied: ['screen.js', 'compose.js', 'layout.js', 'tabs.js'],
  },
};

const SPECIFIER = /(?:from|import)\s*'([^']+)'|import\(\s*'([^']+)'\s*\)/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const [, fromStatic, fromDynamic] of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const spec = fromStatic ?? fromDynamic ?? '';
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f).split(sep).join('/')), external: [...external], bytes };
}

function entryFile(subpath: string): string {
  const conditions = manifest.exports[subpath];
  if (typeof conditions !== 'object') throw new Error(`no code exports entry for ${subpath}`);
  return resolve(pkgRoot, conditions.import);
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as EntryRule;
  const graph = walk(entryFile(subpath));

  it('imports only what its rule allows', () => {
    expect(graph.external.sort()).toEqual([...rule.allow].sort());
  });

  it('reaches nothing on its denied list', () => {
    for (const denied of rule.denied) {
      expect(graph.reached).not.toContain(denied);
      expect(graph.external).not.toContain(denied);
    }
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry point declares a weight rule', () => {
    const code = Object.entries(manifest.exports)
      .filter(([, target]) => typeof target === 'object')
      .map(([subpath]) => subpath);
    expect(code.sort()).toEqual(Object.keys(RULES).sort());
  });

  it('every bare specifier is a declared family dependency, or one of the optional peers', () => {
    const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
    for (const rule of Object.values(RULES)) {
      for (const spec of rule.allow) {
        const pkg = spec.split('/')[0] as string;
        expect(declared.has(pkg), `${spec} is not declared in package.json`).toBe(true);
        expect(FAMILY.includes(pkg) || Object.keys(manifest.peerDependencies ?? {}).includes(pkg), `${spec} is neither family nor a peer`).toBe(true);
      }
    }
  });

  it('the walker sees a dynamic import, so a peer loaded with import() cannot hide', () => {
    expect([...`await import('react');`.matchAll(SPECIFIER)].map((m) => m[2])).toEqual(['react']);
  });
});
