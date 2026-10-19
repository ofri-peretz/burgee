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
 *   node ../../scripts/declaration-reach.mts --write-types   # derive types + typesVersions from exports
 *
 * `--write-types` is run by hand when `exports` changes, never by a build: the two fields it
 * writes are what a `node10` resolver reads instead of `exports`, and
 * `declaration-reach.test.ts` fails, with this command in its message, until they match
 * {@link expectedTypes} again. The decision is spec `types-under-node10`.
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

/** The two `package.json` fields a `node10` resolver reads instead of `exports`. */
export interface LegacyTypes {
  types: string;
  typesVersions: Record<string, Record<string, string[]>>;
}

/** The `types` condition of one `exports` value, when it is a conditions object that has one. */
function typesCondition(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const types = (value as Record<string, unknown>)['types'];
  return typeof types === 'string' ? types : undefined;
}

/**
 * The `types` and `typesVersions` a package must declare so a `node10` resolver reaches exactly
 * the typed subpaths `exports` publishes (spec `types-under-node10` R1–R3).
 *
 * `node10` — TypeScript's default under `module: commonjs` — ignores `exports`. Without these two
 * fields, `import … from 'burgee/commander'` is TS2307 there, although `require()` of the same
 * specifier works. The map is derived, never written by hand: `types` is the root's `types`
 * target, and each non-root entry with a `types` condition becomes one key, in `exports` order,
 * pointing at that same file. A data entry (`./schema.json`) has no `types` condition and gets no
 * key. A wildcard map would be shorter, but it would type `burgee/execute` wherever its `.d.ts`
 * survives the prune while Node's `exports` refuses it at run time.
 */
export function expectedTypes(pkg: TypedPackage): LegacyTypes {
  const entries = pkg.exports !== null && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports) ? Object.entries(pkg.exports as Record<string, unknown>) : [];
  let types: string | undefined;
  const map: Record<string, string[]> = {};
  for (const [key, value] of entries) {
    const target = typesCondition(value);
    if (target === undefined) continue;
    if (key === '.') types = target;
    else map[key.replace(/^\.\//, '')] = [target];
  }
  if (types === undefined) throw new Error(`${pkg.name ?? 'package'}: exports['.'] has no types condition, so there is nothing for node10 to read`);
  return { types, typesVersions: { '*': map } };
}

/**
 * `package.json` text with {@link expectedTypes} written in: `types` just above `exports`, and
 * `typesVersions` just below it. Edits lines rather than re-serialising, so every other line keeps
 * its hand formatting (inline arrays and all); an earlier copy of either field is replaced, so a
 * second run is a no-op. Expects the 2-space layout every `package.json` here has, with
 * `exports` not the last field.
 */
export function withLegacyTypes(text: string, pkg: TypedPackage): string {
  const { types, typesVersions } = expectedTypes(pkg);
  const lines = text.split('\n');
  const closing = (from: number): number => lines.findIndex((line, i) => i > from && /^ {2}[\]}],?$/.test(line));
  for (const key of ['types', 'typesVersions']) {
    const at = lines.findIndex((line) => line.startsWith(`  "${key}": `));
    if (at === -1) continue;
    const last = lines[at]!.endsWith('{') ? closing(at) : at;
    lines.splice(at, last - at + 1);
  }
  const open = lines.indexOf('  "exports": {');
  const close = open === -1 ? -1 : closing(open);
  if (close === -1 || lines[close] !== '  },') throw new Error(`${pkg.name ?? 'package'}: no top-level "exports" object followed by another field`);
  const map = `  "typesVersions": ${JSON.stringify(typesVersions, null, 2).replaceAll(/\[\n\s+("[^"\n]*")\n\s+\]/g, '[$1]').replaceAll('\n', '\n  ')},`;
  lines.splice(close + 1, 0, map);
  lines.splice(open, 0, `  "types": ${JSON.stringify(types)},`);
  return lines.join('\n');
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
  const manifest = path.join(dir, 'package.json');
  const text = fs.readFileSync(manifest, 'utf8');
  const pkg = JSON.parse(text) as TypedPackage;
  if (process.argv.includes('--write-types')) {
    fs.writeFileSync(manifest, withLegacyTypes(text, pkg));
    process.stdout.write(`wrote types and typesVersions (${Object.keys(expectedTypes(pkg).typesVersions['*']!).length} subpaths) from exports\n`);
  } else if (process.argv.includes('--prune')) {
    const { files, bytes } = pruneDeclarations(dir, pkg);
    process.stdout.write(`pruned ${files.length} unreachable declaration file(s), ${bytes} B, from dist\n`);
  } else {
    for (const file of unreachableDeclarations(dir, pkg)) process.stdout.write(`${file}\n`);
  }
}
