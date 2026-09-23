/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a drop-in exports every name its incumbent exports, types included.
 *
 * `compat-oracle` grades behaviour with the incumbent's own tests, which are JavaScript: a
 * drop-in can pass every case and still break a TypeScript program on its first line.
 * `import { type Options } from 'boxen'`, rewritten to `flagstaff/boxen`, named a type that did
 * not exist there, and so did ten more across seven drop-ins (2026-09-23). `burgee migrate`
 * leaves such an import on the incumbent rather than break the build, which is safe and is
 * not a migration.
 *
 * So this asks the TypeScript checker, over the built `dist/*.d.ts`, for every name each
 * incumbent exports and each drop-in exports, and fails on any name the drop-in lacks that is
 * not named in `GAPS` with its reason. An incumbent not installed at the workspace root is
 * skipped by name, never silently.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Incumbent → drop-in, for every drop-in `burgee migrate` rewrites to (A12). */
const PAIRS: readonly (readonly [string, string])[] = [
  ['chalk', 'roundel/chalk'],
  ['ora', 'flagstaff/ora'],
  ['log-update', 'flagstaff/log-update'],
  ['boxen', 'flagstaff/boxen'],
  ['cli-table3', 'flagstaff/cli-table3'],
  ['string-width', 'linegauge'],
  ['strip-ansi', 'linegauge/strip'],
  ['wrap-ansi', 'linegauge/wrap'],
  ['slice-ansi', 'linegauge/slice'],
  ['restore-cursor', 'closeout/restore-cursor'],
  ['exit-hook', 'closeout/exit-hook'],
  ['signal-exit', 'closeout/signal-exit'],
  ['signal-exit/signals', 'closeout/signal-exit/signals'],
  ['yargs-parser', 'burgee/yargs/parser'],
];

/** Names a drop-in does not export yet, each with the reason — the list only shrinks. */
const GAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'flagstaff/cli-table3': Object.fromEntries(
    [
      'CellOptions',
      'CellValue',
      'CharName',
      'CrossTableRow',
      'GenericTable',
      'HorizontalAlignment',
      'HorizontalTableRow',
      'TableConstructorOptions',
      'TableInstanceOptions',
      'VerticalAlignment',
      'VerticalTableRow',
    ].map((name) => [name, "cli-table3's types live on a CommonJS `export =` namespace; ours is an ES module, and the namespace's members are reached as `Table.X`, not as imports"]),
  ),
  'roundel/chalk': Object.fromEntries(
    ['backgroundColors', 'colors', 'foregroundColors', 'modifiers'].map((name) => [
      name,
      "chalk's deprecated arrays, kept for chalk 4 callers; they cost 142 B against `./chalk`'s budget, which is chalk's own source size, and `burgee migrate` refuses a value import it cannot satisfy rather than break it",
    ]),
  ),
  'closeout/signal-exit': { Handler: "a type on a CommonJS `export =` object, which cannot carry a type export beside it without a namespace merge in the `.cts` source" },
  'burgee/yargs/parser': { detailed: "a property of yargs-parser's default function, reached as `parser.detailed(...)`; ours has it there too, and a named import of it does not run against yargs-parser either" },
};

/** Names checked as properties of an `export =` value that are not API: a class's `prototype`. */
const NOT_API = new Set(['prototype']);

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: ['node'],
  skipLibCheck: true,
  noEmit: true,
};

/** Every name a specifier exports as an ES importer sees it, `export =` properties included; `undefined` when it does not resolve. */
function surfaces(specifiers: readonly string[]): Map<string, string[] | undefined> {
  const probeDir = join(ROOT, 'packages/burgee/.type-probe');
  const files = new Map(specifiers.map((s, i) => [join(probeDir, `p${i}.mts`).replaceAll('\\', '/'), `export * as m from '${s}';\n`]));
  const host = ts.createCompilerHost(OPTIONS);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (f) => files.has(f) || fileExists.call(host, f);
  host.readFile = (f) => files.get(f) ?? readFile.call(host, f);
  host.directoryExists = () => true;
  host.getSourceFile = (f, v, ...rest) => {
    const text = files.get(f);
    return text === undefined ? getSourceFile.call(host, f, v, ...rest) : ts.createSourceFile(f, text, v, true);
  };
  const program = ts.createProgram([...files.keys()], OPTIONS, host);
  const checker = program.getTypeChecker();
  return new Map(
    [...files.keys()].map((file, i) => {
      const decl = program.getSourceFile(file)?.statements[0];
      const mod = decl !== undefined && ts.isExportDeclaration(decl) && decl.moduleSpecifier !== undefined ? checker.getSymbolAtLocation(decl.moduleSpecifier) : undefined;
      if (mod === undefined) return [specifiers[i]!, undefined];
      const names = checker.getExportsOfModule(mod).map((e) => e.name);
      const exportEquals = mod.exports?.get(ts.InternalSymbolName.ExportEquals);
      if (exportEquals !== undefined) names.push(...checker.getPropertiesOfType(checker.getTypeOfSymbol(exportEquals)).map((p) => p.name));
      return [specifiers[i]!, [...new Set(names)].filter((n) => n !== 'default' && !NOT_API.has(n)).sort()];
    }),
  );
}

const seen = surfaces(PAIRS.flat());
const resolved = PAIRS.filter(([incumbent]) => seen.get(incumbent) !== undefined);

describe('a drop-in exports every name its incumbent exports', () => {
  it('resolves every drop-in, and most incumbents, so the comparison cannot pass vacuously', () => {
    expect(PAIRS.filter(([, ours]) => seen.get(ours) === undefined), 'a drop-in that does not resolve — build the packages first').toEqual([]);
    expect(resolved.length).toBeGreaterThanOrEqual(12);
  });

  it.each(resolved)('%s ⊆ %s', (incumbent, ours) => {
    const have = new Set(seen.get(ours));
    const allowed = GAPS[ours] ?? {};
    expect((seen.get(incumbent) ?? []).filter((name) => !have.has(name) && allowed[name] === undefined)).toEqual([]);
  });

  it('names no gap that is not one, so the list only shrinks', () => {
    const stale = Object.entries(GAPS).flatMap(([ours, names]) => Object.keys(names).filter((name) => (seen.get(ours) ?? []).includes(name)).map((name) => `${ours} ${name}`));
    expect(stale).toEqual([]);
  });
});
