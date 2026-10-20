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
  ['ansi-escapes', 'paratext'],
  ['ora', 'flagstaff/ora'],
  ['log-update', 'flagstaff/log-update'],
  ['boxen', 'flagstaff/boxen'],
  ['cli-table3', 'flagstaff/cli-table3'],
  ['string-width', 'linegauge'],
  ['strip-ansi', 'linegauge/strip'],
  ['wrap-ansi', 'linegauge/wrap'],
  ['slice-ansi', 'linegauge/slice'],
  ['restore-cursor', 'closeout/restore-cursor'],
  // Joined 2026-10-11 with `graded-override-targets` R4; cli-cursor 5.0.0 is hoisted at the root.
  ['cli-cursor', 'closeout/cli-cursor'],
  // Joined 2026-10-11 with R5 and R6; both are hoisted at the root at the graded release.
  ['cli-truncate', 'linegauge/cli-truncate'],
  ['widest-line', 'linegauge/widest-line'],
  // Joined 2026-10-11 with R7; picocolors 1.1.1 is hoisted at the root.
  ['picocolors', 'roundel/picocolors'],
  // Joined 2026-10-19 with `supports-color-drop-in` R2; supports-color 11.0.0 is a root devDependency
  // for this comparison and the differential test, as meow is.
  ['supports-color', 'roundel/supports-color'],
  ['exit-hook', 'closeout/exit-hook'],
  ['signal-exit', 'closeout/signal-exit'],
  ['signal-exit/signals', 'closeout/signal-exit/signals'],
  ['yargs-parser', 'burgee/yargs/parser'],
  ['terminal-link', 'paratext/terminal-link'],
  // Joined 2026-09-27, when meow went level and `migrate` began rewriting it. meow 14.1.0 is a
  // root devDependency for this comparison alone: its types ship inside the package.
  ['meow', 'burgee/meow'],
  // Joined 2026-09-30, when clack went level (D-20260930-caique-clack-core-exclusion). It
  // resolves through the copy `@changesets/cli` hoists to the root. When that copy is gone,
  // the pair is skipped, as any incumbent not installed at the root is.
  ['@clack/prompts', 'caique/clack'],
  // Joined 2026-10-20, when inquirer-prompts went level (213 / 213, inquirer-prompts-drop-in R3).
  // `@inquirer/prompts` 8.7.3, the graded release, is a root devDependency for this comparison.
  ['@inquirer/prompts', 'caique/inquirer/prompts'],
  // Joined 2026-10-12 with `extra-typings-drop-in` R3. A root devDependency for this comparison
  // alone, as meow is: the declarations are the whole of what the drop-in adds.
  ['@commander-js/extra-typings', 'burgee/commander/extra-typings'],
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
  // `graded-override-targets` R7. picocolors' `export =` object lets TypeScript import each
  // style by name, and Node's ES loader does not: `import { red } from 'picocolors'` throws
  // `Named export 'red' not found` against picocolors itself (measured 2026-10-11, Node 24.13),
  // because `module.exports = createColors()` hides the names from cjs-module-lexer. Exporting
  // the forty-one by name took the façade from 1,607 B to 2,845 B bundled, over picocolors'
  // 2,739 B — R7's kill criterion. A CommonJS `const { red } = require(…)` gets them from the
  // default object, as it does from picocolors; `burgee migrate` keeps a named import on the
  // incumbent rather than rewrite a name the target does not export.
  'roundel/picocolors': Object.fromEntries(
    [
      'reset', 'bold', 'dim', 'italic', 'underline', 'inverse', 'hidden', 'strikethrough',
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray',
      'bgBlack', 'bgRed', 'bgGreen', 'bgYellow', 'bgBlue', 'bgMagenta', 'bgCyan', 'bgWhite',
      'blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright',
      'bgBlackBright', 'bgRedBright', 'bgGreenBright', 'bgYellowBright', 'bgBlueBright', 'bgMagentaBright', 'bgCyanBright', 'bgWhiteBright',
    ].map((name) => [name, "a member of picocolors' `export =` object, which TypeScript lets a caller import by name and Node's ES loader does not; by name it costs 1,238 B and takes the façade over picocolors' own bytes (R7)"]),
  ),
  paratext: {
    AnnotationOptions: "the options of `iTerm.annotation`, and `iTerm` is declared and empty (NotImplemented) until paratext has a capability for it",
    LiteralUnion: "a helper inside ansi-escapes' declaration file, exported only because a `.d.ts` exports every top-level declaration — not API",
    Primitive: "a helper inside ansi-escapes' declaration file, exported only because a `.d.ts` exports every top-level declaration — not API",
  },
  'caique/clack': Object.fromEntries(
    ['box', 'progress', 'taskLog', 'BoxAlignment', 'BoxOptions', 'ProgressOptions', 'ProgressResult', 'TaskLogCompletionOptions', 'TaskLogMessageOptions', 'TaskLogOptions'].map((name) => [
      name,
      "not built, because no graded case reaches them: clack's box, progress bar and task log, with their option and result types (D-152). `burgee migrate` refuses a file that imports one, so it stays on clack whole",
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

/** The virtual probe directory exists, as far as the compiler host is concerned. */
const always = (): boolean => true;

/** Every name a specifier exports as an ES importer sees it, `export =` properties included; `undefined` when it does not resolve. */
function surfaces(specifiers: readonly string[]): Map<string, string[] | undefined> {
  const probeDir = join(ROOT, 'packages/burgee/.type-probe');
  const files = new Map(specifiers.map((s, i) => [join(probeDir, `p${i}.mts`).replaceAll('\\', '/'), `export * as m from '${s}';\n`]));
  const host = ts.createCompilerHost(OPTIONS);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (f) => files.has(f) || fileExists.call(host, f);
  host.readFile = (f) => files.get(f) ?? readFile.call(host, f);
  host.directoryExists = always;
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
