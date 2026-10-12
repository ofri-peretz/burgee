#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * declaration-reach.mts — the declaration files a package's `exports` can reach, and the
 * pruning of every other one from `dist/` before it is packed.
 *
 * `tsc` emits a `.d.ts` beside every module, and `files: ["dist"]` published all of them. A
 * TypeScript consumer can only ever load the ones its resolver reaches: the `types` target of
 * an `exports` entry (or the declaration beside a JavaScript target with none), `types` /
 * `typings`, a `typesVersions` mapping, and whatever those import, re-export, `import()` or
 * `/// <reference>`, transitively. On 2026-10-11 burgee shipped 35 declaration files outside
 * that closure — 80,794 B unpacked, `migrate.d.ts` alone 20,463 B — and the tarball ratchet
 * (`check-published-artifacts.ts`) was the thing that noticed.
 *
 * The closure is not computed by a regex over import lines. It is the set of source files
 * TypeScript's own program loads from those entry points, under the `NodeNext` resolution
 * every package here is built with, so every edge the compiler follows is followed here —
 * including package self-references (`burgee/commander` from inside burgee) — and nothing is
 * pruned that a consumer's compiler would open. `pack-list-lock.test.ts` checks the result
 * independently: every relative specifier in every packed declaration resolves to a packed
 * file. The decision is `.sdlc/decisions/D-20261011-tarball-unreachable-declarations.md`.
 *
 * Plain Node (type stripping); run from a package directory as the last step of its `build`:
 *
 *   node ../../scripts/declaration-reach.mts --prune     # delete the unreachable ones
 *   node ../../scripts/declaration-reach.mts             # list them, delete nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

import ts from 'typescript';

/** The `package.json` fields that decide which declaration files a consumer can reach. */
export interface TypedPackage {
  name?: string;
  main?: string;
  types?: string;
  typings?: string;
  exports?: unknown;
  typesVersions?: Record<string, Record<string, string[]>>;
}

const DECLARATION = /\.d\.[cm]?ts$/;

/** `x.js` → `x.d.ts`, `x.mjs` → `x.d.mts`, `x.cjs` → `x.d.cts`: where tsc puts a module's types. */
export function declarationBeside(file: string): string | undefined {
  const m = /\.([cm]?)js$/.exec(file);
  return m === null ? undefined : `${file.slice(0, -m[0].length)}.d.${m[1]}ts`;
}

/** Every string target in an `exports` value: a path, a conditions object, an array, nested. */
function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(exportTargets);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(exportTargets);
  return [];
}

/** Every file under `dir`, as package-relative POSIX paths. */
function filesUnder(dir: string, at = ''): string[] {
  const full = path.join(dir, at);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.name === 'node_modules') return [];
    return entry.isDirectory() ? filesUnder(dir, rel) : [rel];
  });
}

/**
 * The files a target pattern names. Node and TypeScript both allow one `*` in an `exports` or
 * `typesVersions` target, and it matches any run of characters, `/` included.
 */
function expand(target: string, all: () => string[]): string[] {
  const rel = path.posix.normalize(target.replace(/^\.\//, ''));
  const star = rel.indexOf('*');
  if (star === -1) return [rel];
  const head = rel.slice(0, star);
  const tail = rel.slice(star + 1);
  return all().filter((f) => f.length >= head.length + tail.length && f.startsWith(head) && f.endsWith(tail));
}

/**
 * The declaration files a consumer's resolver starts from: each `types` target, the
 * declaration beside each JavaScript target (TypeScript's fallback when there is no `types`
 * condition), `types` / `typings`, the declaration beside `main`, and every `typesVersions`
 * mapping. Package-relative, existing files only.
 */
export function entryDeclarations(dir: string, pkg: TypedPackage): string[] {
  let cache: string[] | undefined;
  const all = (): string[] => (cache ??= filesUnder(dir));
  const targets = [
    ...exportTargets(pkg.exports),
    ...[pkg.types, pkg.typings, pkg.main].filter((t): t is string => typeof t === 'string'),
    ...Object.values(pkg.typesVersions ?? {}).flatMap((map) => Object.values(map).flat()),
  ];
  const found = new Set<string>();
  for (const target of targets) {
    for (const file of expand(target, all)) {
      const decl = DECLARATION.test(file) ? file : declarationBeside(file);
      if (decl !== undefined && fs.existsSync(path.join(dir, decl))) found.add(decl);
    }
  }
  return [...found].toSorted();
}

/**
 * The declaration files inside `dir` that TypeScript loads when a program starts from
 * {@link entryDeclarations} — the transitive closure, as the compiler computes it.
 */
export function reachableDeclarations(dir: string, pkg: TypedPackage): string[] {
  const real = fs.realpathSync(dir);
  const roots = entryDeclarations(real, pkg).map((f) => path.join(real, f));
  if (roots.length === 0) return [];
  const program = ts.createProgram(roots, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    noLib: true,
    types: [],
    skipLibCheck: true,
    resolveJsonModule: true,
  });
  const inside = `${real}${path.sep}`;
  return program
    .getSourceFiles()
    .map((sf) => path.resolve(sf.fileName))
    .filter((f) => f.startsWith(inside) && DECLARATION.test(f))
    .map((f) => path.relative(real, f).split(path.sep).join('/'))
    .toSorted();
}

/** The declaration files under `dist/` that no entry point reaches. */
export function unreachableDeclarations(dir: string, pkg: TypedPackage, out = 'dist'): string[] {
  const reachable = new Set(reachableDeclarations(dir, pkg));
  return filesUnder(dir, out)
    .filter((f) => DECLARATION.test(f) && !reachable.has(f))
    .toSorted();
}

/** Delete the unreachable declarations and their declaration maps. Returns what went, and its bytes. */
export function pruneDeclarations(dir: string, pkg: TypedPackage, out = 'dist'): { files: string[]; bytes: number } {
  const files = unreachableDeclarations(dir, pkg, out);
  let bytes = 0;
  for (const file of files) {
    for (const each of [file, `${file}.map`]) {
      const full = path.join(dir, each);
      if (!fs.existsSync(full)) continue;
      if (each === file) bytes += fs.statSync(full).size;
      fs.rmSync(full);
    }
  }
  return { files, bytes };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (isMain) {
  const dir = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as TypedPackage;
  if (process.argv.includes('--prune')) {
    const { files, bytes } = pruneDeclarations(dir, pkg);
    process.stdout.write(`pruned ${files.length} unreachable declaration file(s), ${bytes} B, from dist\n`);
  } else {
    for (const file of unreachableDeclarations(dir, pkg)) process.stdout.write(`${file}\n`);
  }
}
