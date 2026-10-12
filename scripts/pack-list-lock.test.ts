/**
 * Packaging lock — what `exports` promises is in the tarball npm actually builds.
 *
 * `package-shape-lock.test.ts` grades the *shape* of every `exports` entry: a conditions
 * object with `types`, `import` and `default`, and data subpaths as plain paths into `dist/`.
 * What no check has ever graded is whether those files are **published**. `files` is a
 * separate list with its own negations —
 *
 *     "files": ["dist", "!dist/**\/*.map", "!dist/**\/*.test.*", "locales"]
 *
 * — and an entry point excluded by one of them installs into a user's tree as
 * `ERR_MODULE_NOT_FOUND` while every check in this repo stays green. The roadmap names this
 * one directly: *"the exports lock checks disk, not the pack list, so an entry excluded by
 * `files` ships broken and passes."*
 *
 * So this asks npm, rather than reasoning about globs: `npm pack --dry-run --json` returns
 * the exact file list of the tarball that `npm publish` would upload. `test` depends on
 * `build` in `turbo.json`, so `dist/` is there when this runs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** `npm pack` on four packages, each a real pack of a real tree. */
const PACK_TIMEOUT_MS = 120000;

interface Pkg {
  name: string;
  private?: boolean;
  files?: string[];
  exports?: Record<string, unknown>;
}

const published = readdirSync(join(root, 'packages'))
  .filter((dir) => existsSync(join(root, 'packages', dir, 'package.json')))
  .map((dir) => ({ dir, pkg: JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as Pkg }))
  .filter(({ pkg }) => pkg.private !== true);

/**
 * Files a package reads at run time that no `exports` subpath names, so nothing else would
 * notice them going missing.
 *
 * One entry, and it is here because it has already happened once: `burgee/yargs` loads its
 * string table from `locales/` by walking up to `package.json`, and that directory is in
 * `files` for no reason a reader of `exports` could see. Drop it and every localised string
 * becomes its own key — which is exactly the shape of the regression that took yargs from
 * 804 to 790 in #170, in the form that would reach a user instead of CI.
 */
const RUNTIME_DATA: Record<string, string[]> = {
  burgee: ['locales/en.json', 'locales/de.json'],
};

/**
 * How to run npm without assuming a POSIX shell.
 *
 * `npm` on Windows is `npm.cmd`, and Node refuses to execute a `.cmd` without a shell:
 * `execFileSync('npm', …)` fails with `spawnSync npm ENOENT`, which is how nine of these
 * tests went red on `windows-latest` in #179 while passing everywhere else.
 *
 * `npm_execpath` is set by npm itself for any script it runs — and CI reaches these tests
 * that way, `npm run test` → turbo → vitest. It names `npm-cli.js`, a plain JavaScript file
 * that this process's own Node runs identically on every platform. The fallback is for a
 * bare `npx vitest`, where npm set nothing.
 */
const NPM_CLI = process.env['npm_execpath'];
const NPM_IS_JS = NPM_CLI !== undefined && NPM_CLI.endsWith('.js');
const PACK_ARGS = ['pack', '--dry-run', '--json'];

/** Every package-relative path npm would put in the tarball. */
function packedPaths(dir: string): Set<string> {
  const cwd = join(root, 'packages', dir);
  const io = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] } as const;
  const out = NPM_IS_JS
    ? execFileSync(process.execPath, [NPM_CLI, ...PACK_ARGS], io)
    : execFileSync('npm', PACK_ARGS, { ...io, shell: process.platform === 'win32' });
  const parsed = JSON.parse(out) as { files: { path: string }[] }[];
  return new Set((parsed[0]?.files ?? []).map((f) => f.path));
}

/** The files one `exports` target names: a plain path, or every string in a conditions object. */
function targetPaths(target: unknown): string[] {
  if (typeof target === 'string') return [target];
  if (target === null || typeof target !== 'object') return [];
  return Object.values(target as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
}

/**
 * Every file an `exports` map promises, as package-relative paths.
 *
 * A conditions object contributes all three of `types`, `import` and `default` — a missing
 * `.d.ts` is as broken for a TypeScript caller as a missing `.js` is for anyone. `.` and
 * `./package.json` resolve to the manifest, which npm always ships.
 */
export function promisedFiles(exports: Record<string, unknown> | undefined): string[] {
  const paths = Object.entries(exports ?? {})
    .filter(([subpath]) => subpath !== './package.json')
    .flatMap(([, target]) => targetPaths(target));
  return [...new Set(paths)].map((p) => p.replace(/^\.\//, '')).toSorted();
}

/** The promised files npm would not ship. */
export function missingFromPack(exports: Record<string, unknown> | undefined, packed: Set<string>): string[] {
  return promisedFiles(exports).filter((p) => !packed.has(p));
}

/**
 * Every module specifier a declaration file names: imports, re-exports, `import()` types,
 * `import x = require()`, module augmentations and `/// <reference path>`.
 *
 * Read from the syntax tree here, deliberately not through `declaration-reach.mts`: that
 * script prunes `dist/` by the closure TypeScript's program computes, and this is the
 * independent check that what it left is closed. A file it wrongly pruned shows up here as a
 * specifier that no longer resolves inside the tarball.
 */
export function declarationSpecifiers(text: string): string[] {
  const sf = ts.createSourceFile('x.d.ts', text, ts.ScriptTarget.Latest, true);
  const found: string[] = sf.referencedFiles.map((r) => r.fileName);
  const literal = (node: ts.Node | undefined): void => {
    if (node !== undefined && ts.isStringLiteral(node)) found.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) literal(node.moduleSpecifier);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) literal(node.argument.literal);
    else if (ts.isExternalModuleReference(node)) literal(node.expression);
    else if (ts.isModuleDeclaration(node)) literal(node.name);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) literal(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** The package-relative files a relative specifier can name, as NodeNext resolution tries them. */
export function declarationCandidates(from: string, specifier: string): string[] {
  const at = posix.normalize(posix.join(posix.dirname(from), specifier));
  const js = /\.([cm]?)js$/.exec(at);
  if (js !== null) return [`${at.slice(0, -js[0].length)}.d.${js[1]}ts`];
  if (/\.(d\.[cm]?ts|json)$/.test(at)) return [at];
  return [`${at}.d.ts`, `${at}/index.d.ts`];
}

/** `file -> specifier` for each relative specifier of a packed declaration that names no packed file. */
export function danglingDeclarationImports(packed: Set<string>, read: (file: string) => string): string[] {
  return [...packed]
    .filter((f) => /\.d\.[cm]?ts$/.test(f))
    .toSorted()
    .flatMap((file) =>
      declarationSpecifiers(read(file))
        .filter((s) => s.startsWith('.'))
        .filter((s) => !declarationCandidates(file, s).some((c) => packed.has(c)))
        .map((s) => `${file} -> ${s}`),
    );
}

describe('declarationSpecifiers / danglingDeclarationImports', () => {
  const index = [
    '/// <reference path="./ref.d.ts" />',
    "import type { A } from './a.js';",
    "export * from './b.js';",
    "export type C = import('./nested/c.js').C;",
    "import d = require('./d.cjs');",
    "declare module './e.js' { interface E { e: 1 } }",
    "import type { X } from 'other-package';",
  ].join('\n');
  const read = (file: string): string => (file === 'dist/index.d.ts' ? index : "export * from '../a.js';\n");

  it('reads every form of specifier a declaration file can use', () => {
    expect(declarationSpecifiers(index).toSorted()).toEqual(['./a.js', './b.js', './d.cjs', './e.js', './nested/c.js', './ref.d.ts', 'other-package']);
  });

  it('reports each relative specifier whose declaration is not packed, and nothing for a bare one', () => {
    const packed = new Set(['dist/index.d.ts', 'dist/ref.d.ts', 'dist/a.d.ts', 'dist/nested/c.d.ts', 'dist/d.d.cts', 'dist/index.js']);
    expect(danglingDeclarationImports(packed, read)).toEqual(['dist/a.d.ts -> ../a.js', 'dist/d.d.cts -> ../a.js', 'dist/index.d.ts -> ./b.js', 'dist/index.d.ts -> ./e.js', 'dist/ref.d.ts -> ../a.js']);
  });
});

describe('promisedFiles / missingFromPack', () => {
  const exports = {
    '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
    './schema.json': './dist/schema.json',
    './package.json': './package.json',
  };

  it('collects types, import and default, deduped, without ./', () => {
    expect(promisedFiles(exports)).toEqual(['dist/index.d.ts', 'dist/index.js', 'dist/schema.json']);
  });

  it('reports nothing when the tarball carries every promised file', () => {
    expect(missingFromPack(exports, new Set(['dist/index.d.ts', 'dist/index.js', 'dist/schema.json']))).toEqual([]);
  });

  it('reports a code entry that `files` excluded', () => {
    expect(missingFromPack(exports, new Set(['dist/index.d.ts', 'dist/schema.json']))).toEqual(['dist/index.js']);
  });

  it('reports a missing .d.ts as loudly as a missing .js', () => {
    expect(missingFromPack(exports, new Set(['dist/index.js', 'dist/schema.json']))).toEqual(['dist/index.d.ts']);
  });

  it('reports a data export that `files` excluded', () => {
    expect(missingFromPack(exports, new Set(['dist/index.d.ts', 'dist/index.js']))).toEqual(['dist/schema.json']);
  });
});

describe.each(published)('published package $pkg.name', ({ dir, pkg }) => {
  it(
    'ships every file its `exports` promises',
    () => {
      expect(missingFromPack(pkg.exports, packedPaths(dir))).toEqual([]);
    },
    PACK_TIMEOUT_MS,
  );

  it(
    'ships the run-time data it reads without going through `exports`',
    () => {
      const expected = RUNTIME_DATA[pkg.name] ?? [];
      if (expected.length === 0) return;
      const packed = packedPaths(dir);
      expect(expected.filter((p) => !packed.has(p))).toEqual([]);
    },
    PACK_TIMEOUT_MS,
  );

  it(
    'ships every declaration file its shipped declarations import',
    () => {
      const at = join(root, 'packages', dir);
      expect(danglingDeclarationImports(packedPaths(dir), (file) => readFileSync(join(at, file), 'utf8'))).toEqual([]);
    },
    PACK_TIMEOUT_MS,
  );
});
