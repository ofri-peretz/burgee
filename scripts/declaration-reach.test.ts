/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The declaration closure `declaration-reach.mts` prunes by, and the lock that it is applied.
 *
 * The first block builds small packages on disk and asks which declarations their `exports`
 * reach, one edge kind per case, because a missed edge is the one failure that matters: it
 * would prune a file a consumer's compiler opens. The second holds every published package's
 * built `dist/` to "no declaration outside the closure", and its `build` to running the prune,
 * so the 35 files burgee stopped publishing on 2026-10-11 cannot creep back one module at a
 * time. `pack-list-lock.test.ts` checks the other direction from the tarball itself.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { declarationBeside, entryDeclarations, expectedTypes, pruneDeclarations, reachableDeclarations, type TypedPackage, unreachableDeclarations, withLegacyTypes } from './declaration-reach.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let made: string[] = [];
afterEach(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
  made = [];
});

/** A package on disk: `package.json` from `pkg`, and each file of `files` under it. */
function fixture(pkg: TypedPackage, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'declaration-reach-'));
  made.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', ...pkg }));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const ENTRY = { '.': { types: './dist/index.d.ts', import: './dist/index.js' } };

describe('declarationBeside', () => {
  it('maps each JavaScript extension to the declaration tsc emits beside it', () => {
    expect(declarationBeside('dist/a.js')).toBe('dist/a.d.ts');
    expect(declarationBeside('dist/a.mjs')).toBe('dist/a.d.mts');
    expect(declarationBeside('dist/a.cjs')).toBe('dist/a.d.cts');
    expect(declarationBeside('dist/a.json')).toBeUndefined();
  });
});

describe('entryDeclarations', () => {
  it('starts from types targets, the declaration beside a bare JavaScript target, types and typesVersions', () => {
    const dir = fixture(
      {
        name: 'p',
        types: './dist/top.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' }, './bare': './dist/bare.js', './data.json': './dist/data.json', './lib/*': { import: './dist/lib/*.js' } },
        typesVersions: { '*': { legacy: ['dist/legacy.d.ts'] } },
      },
      {
        'dist/index.d.ts': '',
        'dist/bare.d.ts': '',
        'dist/top.d.ts': '',
        'dist/legacy.d.ts': '',
        'dist/data.json': '{}',
        'dist/lib/one.js': '',
        'dist/lib/one.d.ts': '',
        'dist/lib/deep/two.js': '',
        'dist/lib/deep/two.d.ts': '',
      },
    );
    expect(entryDeclarations(dir, JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as TypedPackage)).toEqual([
      'dist/bare.d.ts',
      'dist/index.d.ts',
      'dist/legacy.d.ts',
      'dist/lib/deep/two.d.ts',
      'dist/lib/one.d.ts',
      'dist/top.d.ts',
    ]);
  });
});

describe('reachableDeclarations — every edge a compiler follows', () => {
  /** [what, dist/index.d.ts, the file it reaches, extra exports]. */
  const cases: [string, string, string, Record<string, unknown>][] = [
    ['an import', "import type { B } from './b.js';\nexport type A = B;\n", 'dist/b.d.ts', {}],
    ['a re-export', "export * from './b.js';\n", 'dist/b.d.ts', {}],
    ['a named re-export', "export { type B } from './b.js';\n", 'dist/b.d.ts', {}],
    ['an import() type', "export type A = import('./b.js').B;\n", 'dist/b.d.ts', {}],
    ['a triple-slash reference', '/// <reference path="./b.d.ts" />\nexport type A = B;\n', 'dist/b.d.ts', {}],
    ['a directory index', "export * from './b/index.js';\n", 'dist/b/index.d.ts', {}],
    ['a self-reference by package name', "export * from 'p/b';\n", 'dist/b/index.d.ts', { './b': { types: './dist/b/index.d.ts' } }],
  ];
  it.each(cases)('follows %s', (_, index, target, extra) => {
    const pkg: TypedPackage = { name: 'p', exports: { ...ENTRY, ...extra } };
    const dir = fixture(pkg, {
      'dist/index.d.ts': index,
      [target]: 'export interface B { b: 1 }\n',
      'dist/orphan.d.ts': 'export type O = 1;\n',
    });
    expect(reachableDeclarations(dir, pkg)).toEqual(['dist/index.d.ts', target].toSorted());
    expect(unreachableDeclarations(dir, pkg)).toEqual(['dist/orphan.d.ts']);
  });

  it('follows edges transitively, and not out of an unreachable file', () => {
    const pkg: TypedPackage = { name: 'p', exports: ENTRY };
    const dir = fixture(pkg, {
      'dist/index.d.ts': "export * from './a.js';\n",
      'dist/a.d.ts': "export type A = import('./nested/b.js').B;\n",
      'dist/nested/b.d.ts': "export * from '../c.js';\nexport interface B { b: 1 }\n",
      'dist/c.d.ts': 'export type C = 1;\n',
      'dist/dead.d.ts': "export * from './dead-dep.js';\n",
      'dist/dead-dep.d.ts': 'export type D = 1;\n',
    });
    expect(reachableDeclarations(dir, pkg)).toEqual(['dist/a.d.ts', 'dist/c.d.ts', 'dist/index.d.ts', 'dist/nested/b.d.ts']);
    expect(unreachableDeclarations(dir, pkg)).toEqual(['dist/dead-dep.d.ts', 'dist/dead.d.ts']);
  });

  it('reaches nothing, and so would prune everything, when no entry has types — callers must not prune such a package blind', () => {
    const pkg: TypedPackage = { name: 'p', exports: { '.': './dist/index.js' } };
    const dir = fixture(pkg, { 'dist/index.js': '', 'dist/other.d.ts': '' });
    expect(reachableDeclarations(dir, pkg)).toEqual([]);
  });
});

describe('pruneDeclarations', () => {
  it('deletes the unreachable declarations and their maps, keeps everything else, and counts the bytes', () => {
    const pkg: TypedPackage = { name: 'p', exports: ENTRY };
    const dir = fixture(pkg, {
      'dist/index.js': 'export {};\n',
      'dist/index.d.ts': 'export {};\n',
      'dist/dead.js': 'export {};\n',
      'dist/dead.d.ts': 'export type Dead = 1;\n',
      'dist/dead.d.ts.map': '{}',
    });
    expect(pruneDeclarations(dir, pkg)).toEqual({ files: ['dist/dead.d.ts'], bytes: 'export type Dead = 1;\n'.length });
    expect(readdirSync(join(dir, 'dist')).toSorted()).toEqual(['dead.js', 'index.d.ts', 'index.js']);
  });
});

describe('expectedTypes', () => {
  const pkg: TypedPackage = {
    name: 'p',
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
      './schema.json': './dist/schema.json',
      './zeta': { types: './dist/zeta.d.ts', import: './dist/zeta.js', default: './dist/zeta.js' },
      './help': { types: './dist/help-entry.d.ts', import: './dist/help-entry.js', default: './dist/help-entry.js' },
      './signal-exit/signals': { types: './dist/signal-exit-signals.d.cts', import: './dist/signal-exit-signals.cjs', default: './dist/signal-exit-signals.cjs' },
      './untyped': { import: './dist/untyped.js', default: './dist/untyped.js' },
      './package.json': './package.json',
    },
  };

  it('maps each typed subpath to its own types target, skips data exports, keeps exports order', () => {
    const got = expectedTypes(pkg);
    expect(got).toEqual({
      types: './dist/index.d.ts',
      typesVersions: { '*': { zeta: ['./dist/zeta.d.ts'], help: ['./dist/help-entry.d.ts'], 'signal-exit/signals': ['./dist/signal-exit-signals.d.cts'] } },
    });
    expect(Object.keys(got.typesVersions['*']!)).toEqual(['zeta', 'help', 'signal-exit/signals']);
  });

  it('refuses a package whose root has no types condition, rather than inventing one', () => {
    expect(() => expectedTypes({ name: 'p', exports: { '.': './dist/index.js' } })).toThrow(/p: exports\['\.'\] has no types condition/);
    expect(() => expectedTypes({ exports: ['./dist/index.js'] })).toThrow(/package: exports/);
    expect(() => expectedTypes({ name: 'q' })).toThrow(/q: exports/);
  });
});

describe('withLegacyTypes', () => {
  const pkg: TypedPackage = { name: 'p', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' }, './a/b': { types: './dist/a-b.d.ts', import: './dist/a-b.js' } } };
  const text = ['{', '  "name": "p",', '  "sideEffects": ["./dist/cli.js"],', '  "exports": {', '    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },', '    "./a/b": { "types": "./dist/a-b.d.ts", "import": "./dist/a-b.js" }', '  },', '  "files": ["dist"]', '}', ''].join('\n');
  const want = [
    '{',
    '  "name": "p",',
    '  "sideEffects": ["./dist/cli.js"],',
    '  "types": "./dist/index.d.ts",',
    '  "exports": {',
    '    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },',
    '    "./a/b": { "types": "./dist/a-b.d.ts", "import": "./dist/a-b.js" }',
    '  },',
    '  "typesVersions": {',
    '    "*": {',
    '      "a/b": ["./dist/a-b.d.ts"]',
    '    }',
    '  },',
    '  "files": ["dist"]',
    '}',
    '',
  ].join('\n');

  it('puts types above exports and typesVersions below it, and leaves every other line as written', () => {
    expect(withLegacyTypes(text, pkg)).toBe(want);
  });

  it('replaces a stale copy of either field, so running it twice changes nothing', () => {
    expect(withLegacyTypes(want, pkg)).toBe(want);
    const stale = want.replace('"a/b": ["./dist/a-b.d.ts"]', '"old": ["./dist/old.d.ts"],\n      "a/b": ["./dist/a-b.d.ts"]').replace('"types": "./dist/index.d.ts",\n  "exports"', '"types": "./dist/old.d.ts",\n  "exports"');
    expect(withLegacyTypes(stale, pkg)).toBe(want);
  });

  it('refuses a manifest with no exports object followed by another field, rather than writing invalid JSON', () => {
    expect(() => withLegacyTypes('{\n  "name": "p"\n}\n', pkg)).toThrow(/p: no top-level "exports" object/);
    expect(() => withLegacyTypes('{\n  "exports": {\n    ".": "./x.js"\n  }\n}\n', pkg)).toThrow(/followed by another field/);
  });
});

/** Every published workspace package. */
const published = readdirSync(join(REPO_ROOT, 'packages'))
  .filter((dir) => existsSync(join(REPO_ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(REPO_ROOT, 'packages', dir, 'package.json'), 'utf8')) as TypedPackage & { private?: boolean; scripts?: Record<string, string> } }))
  .filter(({ pkg }) => pkg.private !== true);

/** The step every published package's build ends with. */
const PRUNE = 'node ../../scripts/declaration-reach.mts --prune';

describe.each(published)('published package $pkg.name', ({ dir, pkg }) => {
  it('prunes unreachable declarations as the last step of its build', () => {
    expect(pkg.scripts?.['build']?.endsWith(` && ${PRUNE}`)).toBe(true);
  });

  it('has an entry point with types, so the closure is not empty', () => {
    expect(entryDeclarations(join(REPO_ROOT, 'packages', dir), pkg).length).toBeGreaterThan(0);
  });

  it('builds a dist with no declaration file its exports cannot reach', () => {
    expect(unreachableDeclarations(join(REPO_ROOT, 'packages', dir), pkg)).toEqual([]);
  });

  it('declares types and typesVersions equal to its exports, so node10 reaches every subpath', () => {
    const want = expectedTypes(pkg);
    const fix = `run \`node ../../scripts/declaration-reach.mts --write-types\` in packages/${dir}, or paste:\n${JSON.stringify(want, null, 2)}`;
    expect(pkg.types, fix).toEqual(want.types);
    expect(pkg.typesVersions, fix).toEqual(want.typesVersions);
  });
});

/**
 * The diagnostics that mean "the import did not resolve" — not a type error in the package, but
 * the consumer's compiler failing to find, or to load, what the specifier names.
 */
const RESOLUTION = new Set([2307, 2305, 2724, 7016, 1479, 2306]);

/** The five consumer setups of spec `types-under-node10` R4. */
const CONSUMERS: { name: string; esm: boolean; options: ts.CompilerOptions }[] = [
  { name: 'commonjs, no moduleResolution', esm: false, options: { module: ts.ModuleKind.CommonJS } },
  { name: 'node10', esm: false, options: { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 } },
  { name: 'node16 (ESM consumer)', esm: true, options: { module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 } },
  { name: 'nodenext (ESM consumer)', esm: true, options: { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext } },
  { name: 'bundler', esm: false, options: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler } },
];

/** The root and every typed subpath of every published package — what an adopter can import. */
const specifiers = published.flatMap(({ pkg }) =>
  Object.entries((pkg.exports ?? {}) as Record<string, unknown>)
    .filter(([, value]) => value !== null && typeof value === 'object' && typeof (value as { types?: unknown }).types === 'string')
    .map(([key]) => (key === '.' ? pkg.name! : `${pkg.name!}/${key.slice(2)}`)),
);

/**
 * Spec `types-under-node10` R4/R5: one consumer imports every specifier above and type-checks
 * under each setup with no resolution diagnostic. `node10` — TypeScript's default under
 * `module: commonjs` — ignores `exports`, so before `typesVersions` every one of these was TS2307
 * there (the tsc-alias and @swc/cli trials). `skipLibCheck` is off, so an import inside a family
 * `.d.ts` that fails to resolve is reported instead of silently becoming `any`.
 */
describe('every typed subpath resolves under each moduleResolution', () => {
  let consumer = '';
  beforeAll(() => {
    consumer = mkdtempSync(join(tmpdir(), 'node10-consumer-'));
    mkdirSync(join(consumer, 'node_modules'));
    for (const { dir, pkg } of published) symlinkSync(join(REPO_ROOT, 'packages', dir), join(consumer, 'node_modules', pkg.name!), 'junction');
    writeFileSync(join(consumer, 'index.ts'), `${specifiers.map((spec, i) => `import type * as m${i} from '${spec}';`).join('\n')}\nexport type All = [${specifiers.map((_, i) => `typeof m${i}`).join(', ')}];\n`);
  });
  afterAll(() => rmSync(consumer, { recursive: true, force: true }));

  it('imports the root and every typed subpath of every published package', () => {
    expect(specifiers).toContain('burgee/commander');
    expect(specifiers.length).toBeGreaterThan(published.length);
  });

  it.each(CONSUMERS)('$name', ({ esm, options }) => {
    writeFileSync(join(consumer, 'package.json'), JSON.stringify(esm ? { type: 'module' } : {}));
    const program = ts.createProgram([join(consumer, 'index.ts')], {
      ...options,
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      types: ['node'],
      typeRoots: [join(REPO_ROOT, 'node_modules', '@types')],
      lib: ['lib.es2023.d.ts'],
    });
    const unresolved = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => RESOLUTION.has(d.code))
      .map((d) => `TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, '\n').split('\n')[0]} (${d.file === undefined ? '?' : d.file.fileName.replace(consumer, '<consumer>')})`);
    expect(unresolved, `${unresolved.length} of ${specifiers.length} specifiers did not resolve`).toEqual([]);
  });
});
