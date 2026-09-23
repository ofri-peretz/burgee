/**
 * `burgee migrate` — A1 … A10 of `.sdlc/intents/burgee-migrate/design.md`.
 *
 * **Every case below was run against a mutation of the implementation before it was run
 * against the implementation**, and the design names the five mutations. They are named
 * here too, beside the case that kills each, because a test whose failure mode nobody has
 * seen is a test nobody has graded:
 *
 *   M-a  `yargs/helpers` maps to `burgee/yargs` — the subpath dropped.
 *        → "the mapping is the design's table, subpaths included"
 *   M-b  a quoted host name anywhere is rewritten, not only in a specifier position.
 *        → "a string that is not a specifier is not a specifier"
 *   M-c  a file with one refusal in it is written anyway, minus the refused line.
 *        → "one refusal leaves the whole file as it was"
 *   M-d  the compat figures are typed into the report instead of read.
 *        → `compat-baseline-lock.test.ts`, which is where that mutation lands
 *   M-e  the run exits `OK` with refusals present.
 *        → "the exit code says whether anything was left undone"
 *
 * The real gate is not in this file's fixtures. `examples/demo-cli-commander` holds the
 * same program written twice — once against `commander`, once against `burgee/commander` —
 * and that pair predates this feature, which is what makes it a gate rather than a fixture.
 * `migrate-demo.test.ts` runs it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { bindingsOf, DirtyTreeError, FACADE_EXPORTS, MAPPING, migrate, packageOf, rewriteSource, scan, sourceFiles, workingTree } from './migrate.js';

/** A project on disk, under a fresh temporary directory each time. */
function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

/** No repository, so A6's dirty-tree check has nothing to refuse — the fixtures are about the rewrite. */
const clean = (): undefined => undefined;
const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');

/** Whether a family specifier is a subpath its package's exports map publishes. */
function published(to: string): boolean {
  const name = packageOf(to);
  const pkg = JSON.parse(readFileSync(new URL(`../../${name}/package.json`, import.meta.url), 'utf8')) as { exports: Record<string, unknown> };
  return pkg.exports[`.${to.slice(name.length)}`] !== undefined;
}

describe('A2 — the mapping is data, and it is the design’s table', () => {
  it('maps every row, subpaths included', () => {
    // M-a: collapsing `yargs/helpers` to `burgee/yargs` is the mutation this kills. It is
    // the plausible one — three of the four rows have no subpath on the right — and it
    // would hand a user `hideBin` from a module that does not export it.
    //
    // Restated 2026-09-23 (A12, D-137): the table grew from commander and yargs to every
    // drop-in the oracle grades level with its incumbent, so it is written out here in full
    // — a row that appears or disappears is a decision, and this is where it shows.
    // `scripts/migrate-drop-ins-lock.test.ts` holds the same list equal to `compat-oracle`.
    expect(MAPPING).toEqual({
      commander: 'burgee/commander',
      yargs: 'burgee/yargs',
      'yargs/yargs': 'burgee/yargs',
      'yargs/helpers': 'burgee/yargs/helpers',
      'yargs-parser': 'burgee/yargs/parser',
      chalk: 'roundel/chalk',
      ora: 'flagstaff/ora',
      'log-update': 'flagstaff/log-update',
      boxen: 'flagstaff/boxen',
      'cli-table3': 'flagstaff/cli-table3',
      'string-width': 'linegauge',
      'strip-ansi': 'linegauge/strip',
      'wrap-ansi': 'linegauge/wrap',
      'slice-ansi': 'linegauge/slice',
      'cross-spawn': 'bellpull/cross-spawn',
      lilconfig: 'seniority/lilconfig',
      '@inquirer/core': 'caique/inquirer',
      'restore-cursor': 'closeout/restore-cursor',
      'exit-hook': 'closeout/exit-hook',
      'signal-exit': 'closeout/signal-exit',
      'signal-exit/signals': 'closeout/signal-exit/signals',
    });
  });

  it('rewrites `yargs/helpers` to a module that keeps the subpath', () => {
    const { source, mapped } = rewriteSource("import { hideBin } from 'yargs/helpers';\n");
    expect(source).toBe("import { hideBin } from 'burgee/yargs/helpers';\n");
    expect(mapped).toEqual([{ from: 'yargs/helpers', to: 'burgee/yargs/helpers' }]);
  });

  it('every specifier it can produce is a subpath its package actually publishes', () => {
    // A mapping to an unpublished subpath is a codemod that installs ERR_MODULE_NOT_FOUND.
    // Restated 2026-09-23 (A12): the targets are no longer all burgee's, so each is checked
    // against the exports map of the family package it names.
    expect([...new Set(Object.values(MAPPING))].filter((to) => !published(to))).toEqual([]);
  });

  it('is a fixed point: a migrated file migrates to itself', () => {
    const once = rewriteSource("import { Command } from 'commander';\n").source;
    expect(rewriteSource(once)).toMatchObject({ source: once, relevant: false, mapped: [] });
  });
});

describe('A3 — the five specifier positions, and nothing else', () => {
  it.each([
    ["import { Command } from 'commander';", "import { Command } from 'burgee/commander';"],
    ["import type { Command } from 'commander';", "import type { Command } from 'burgee/commander';"],
    ["import 'commander';", "import 'burgee/commander';"],
    ["export { Command } from 'commander';", "export { Command } from 'burgee/commander';"],
    ["export * from 'commander';", "export * from 'burgee/commander';"],
    ["const m = await import('commander');", "const m = await import('burgee/commander');"],
    ["const m = require('commander');", "const m = require('burgee/commander');"],
    ['import { Command } from "commander";', 'import { Command } from "burgee/commander";'],
    ["import yargs from 'yargs/yargs';", "import yargs from 'burgee/yargs';"],
  ])('rewrites %j', (source, expected) => {
    expect(rewriteSource(`${source}\n`).source).toBe(`${expected}\n`);
  });

  it.each([
    "const name = 'commander';",
    "console.log('commander');",
    "const opts = { from: 'commander' };",
    "throw new Error('install commander first');",
    "// import { Command } from 'commander';",
    "/* import { Command } from 'commander'; */",
    'const re = /["\']commander["\']/;',
    'const t = `commander`;',
  ])('leaves %j alone — it is a string, not a specifier', (source) => {
    // M-b: a regex over the file's text that rewrites any quoted `commander` passes every
    // case above it and fails every case here. It is the mutation the design names second,
    // and it is what a codemod without a scanner actually does.
    const result = rewriteSource(`${source}\n`);
    expect(result.source).toBe(`${source}\n`);
    expect(result.relevant, 'a file with no host specifier is unrelated, not untouched').toBe(false);
  });

  it('finds a specifier that a comment containing a quote would otherwise desynchronise', () => {
    const source = "// don't stop\nimport { Command } from 'commander';\n";
    expect(rewriteSource(source).source).toBe("// don't stop\nimport { Command } from 'burgee/commander';\n");
  });

  it('reports the line a specifier sits on, counting through a block comment', () => {
    const source = "/* one\n * two\n */\nimport 'commander/lib/command.js';\n";
    expect(scan(source).sites[0]).toMatchObject({ line: 4, specifier: 'commander/lib/command.js' });
  });
});

describe('A4 — refusals are named by file and line, never guessed at', () => {
  it('refuses a deep import and leaves the file exactly as it was', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\nimport { Command } from 'commander/lib/command.js';\n" });
    const before = read(dir, 'src/a.ts');
    const report = await migrate({ dir, status: clean });
    expect(report.refused).toEqual([{ file: 'src/a.ts', line: 2, specifier: 'commander/lib/command.js', reason: 'deep-import' }]);
    expect(read(dir, 'src/a.ts'), 'a refused file is not written').toBe(before);
  });

  it('refuses a dynamic specifier that is not a literal', () => {
    const result = rewriteSource("import { Command } from 'commander';\nconst m = await import(name);\n");
    expect(result.refused).toEqual([{ line: 2, specifier: '', reason: 'non-literal-specifier' }]);
  });

  it('refuses a template specifier, because a template is not a literal it can rewrite', () => {
    expect(rewriteSource("import 'commander';\nrequire(`${pkg}`);\n").refused).toMatchObject([{ line: 2, reason: 'non-literal-specifier' }]);
  });

  it('does not refuse a dynamic specifier in a file that has no host in it at all', () => {
    // Otherwise every `require(x)` in a repository is a refusal, and the list that is
    // supposed to name what needs a human names the whole tree instead.
    expect(rewriteSource('const m = await import(name);\n')).toMatchObject({ refused: [], relevant: false });
  });

  it('keeps `yargs/helpers` out of the deep-import refusal it superficially resembles', () => {
    expect(rewriteSource("import { hideBin } from 'yargs/helpers';\n").refused).toEqual([]);
  });
});

describe('A5 — the unit of success is the file', () => {
  it('leaves a file entirely unchanged when one specifier in it is refused', async () => {
    // M-c: writing the mapped half of a mixed file is the mutation. It passes every case in
    // A2 and A3, and it ships a CLI that imports burgee for `Command` and commander for
    // `Command` in the same module — a failure that surfaces in someone else's runtime.
    const mixed = "import { Command } from 'commander';\nimport { helpers } from 'commander/lib/help.js';\n";
    const dir = project({ 'src/mixed.ts': mixed, 'src/clean.ts': "import { Command } from 'commander';\n" });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/mixed.ts')).toBe(mixed);
    expect(read(dir, 'src/clean.ts'), 'the other files still migrate — the refusal is per file, not per run').toBe("import { Command } from 'burgee/commander';\n");
    expect(report).toMatchObject({ files: 1, imports: 1 });
  });

  it('does not count a refused file’s imports as mapped', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\nimport 'yargs/build/index.js';\n" });
    const report = await migrate({ dir, status: clean });
    expect(report).toMatchObject({ files: 0, imports: 0, mapped: [] });
  });

  it('keeps a still-imported dependency out of the removable list', async () => {
    // The maintainer's next commit is `npm rm commander`. If a refused file still imports
    // it, that commit breaks their build, and the report is what told them it was safe.
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { commander: '^15.0.0', yargs: '^18.0.0' } }),
      'src/a.ts': "import 'commander/lib/command.js';\n",
      'src/b.ts': "import 'yargs';\n",
    });
    const report = await migrate({ dir, status: clean });
    // `add` joined the report with A12: the rewritten import names burgee, which this
    // project does not declare yet.
    expect(report.dependencies).toEqual({ before: ['commander', 'yargs'], removable: ['yargs'], after: 1, add: ['burgee'] });
  });
});

describe('A6 — never silently', () => {
  it('refuses a dirty tree, and names the fix', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    await expect(migrate({ dir, status: () => [' M src/a.ts'] })).rejects.toBeInstanceOf(DirtyTreeError);
    expect(read(dir, 'src/a.ts'), 'nothing is written on the path that refuses').toBe("import 'commander';\n");
  });

  it('migrates a dirty tree under --force', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    await migrate({ dir, force: true, status: () => [' M src/a.ts'] });
    expect(read(dir, 'src/a.ts')).toBe("import 'burgee/commander';\n");
  });

  it('writes nothing under --dry-run, and still reports what it would do', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    const report = await migrate({ dir, dryRun: true, status: () => [' M src/a.ts'] });
    expect(read(dir, 'src/a.ts')).toBe("import 'commander';\n");
    expect(report).toMatchObject({ files: 1, imports: 1, dryRun: true, changed: false });
  });

  it('proceeds where there is no repository to ask, because there is nothing to be dirty', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    await expect(workingTree(dir), 'a bare temporary directory is not a git tree').resolves.toBeUndefined();
    await migrate({ dir });
    expect(read(dir, 'src/a.ts')).toBe("import 'burgee/commander';\n");
  });

  it('reads the real `git status --porcelain` on a real repository', async () => {
    // The injected `status` above is what keeps the other cases hermetic; this is the one
    // case that grades the function they stand in for.
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' });
    await expect(workingTree(dir)).resolves.toEqual(['?? src/']);
  });
});

describe('A1 — two independent sources, and they are allowed to disagree', () => {
  it('reports a dependency that is declared and never imported', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { yargs: '^18.0.0' } }), 'src/a.ts': "import 'commander';\n" });
    const report = await migrate({ dir, status: clean });
    expect(report.detected).toEqual({ declared: ['yargs'], imported: ['commander'] });
  });

  it('reports a host that is imported and never declared', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x' }), 'src/a.ts': "import 'commander';\n" });
    expect((await migrate({ dir, status: clean })).detected).toEqual({ declared: [], imported: ['commander'] });
  });

  it('finds a host in devDependencies too', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', devDependencies: { commander: '^15.0.0' } }), 'src/a.ts': "import 'commander';\n" });
    expect((await migrate({ dir, status: clean })).detected.declared).toEqual(['commander']);
  });
});

describe('A7 — the numbers in the report are read, not typed', () => {
  it('carries the oracle’s graded row for each host it touched', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    // M-d lands in `compat-baseline-lock.test.ts`, which holds these equal to
    // `compat-oracle/baseline/commander.json`. This case only proves the report reaches them.
    // `control` joined the row with A12 (D-137): it is what decides whether a drop-in is
    // rewritten at all, so the report shows it beside the grade.
    expect((await migrate({ dir, status: clean })).graded).toEqual([{ host: 'commander', reference: 1360, passed: 1360, rate: 1, control: 1360 }]);
  });

  it('does not claim a graded row for a host the project does not use', async () => {
    const dir = project({ 'src/a.ts': "import 'yargs';\n" });
    expect((await migrate({ dir, status: clean })).graded.map((g) => g.host)).toEqual(['yargs']);
  });

  it('rolls the imports up per mapping, in the order the mapping declares', async () => {
    const dir = project({
      'src/a.ts': "import 'commander';\nimport 'commander';\n",
      'src/b.ts': "import { hideBin } from 'yargs/helpers';\nimport yargs from 'yargs/yargs';\n",
    });
    expect((await migrate({ dir, status: clean })).mapped).toEqual([
      { from: 'commander', to: 'burgee/commander', imports: 2, files: 1 },
      { from: 'yargs/yargs', to: 'burgee/yargs', imports: 1, files: 1 },
      { from: 'yargs/helpers', to: 'burgee/yargs/helpers', imports: 1, files: 1 },
    ]);
  });
});

describe('A8 — the exit code says whether anything was left undone', () => {
  it('reports OK when everything mapped', async () => {
    const dir = project({ 'src/a.ts': "import 'commander';\n" });
    expect((await migrate({ dir, status: clean })).exitCode).toBe(ExitCode.OK);
  });

  it('reports RUNTIME when anything was refused', async () => {
    // M-e: a report that always carries `exitCode: 0` is the mutation, and it is invisible
    // to every other case in this file — the document is identical apart from one number.
    const dir = project({ 'src/a.ts': "import 'commander/lib/command.js';\n" });
    expect((await migrate({ dir, status: clean })).exitCode).toBe(ExitCode.RUNTIME);
  });

  it('carries every count the human surface prints', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { commander: '^15.0.0' } }), 'src/a.ts': "import 'commander';\n" });
    expect(Object.keys(await migrate({ dir, status: clean })).sort()).toEqual(
      // `partial` and `next` joined with A12: what was left alone and why, and the command to run.
      ['changed', 'dependencies', 'detected', 'dryRun', 'exitCode', 'files', 'graded', 'imports', 'kept', 'mapped', 'next', 'partial', 'refused'].sort(),
    );
  });
});

describe('A12 — every drop-in the oracle grades level, in one run', () => {
  it('rewrites the family drop-ins beside the front-ends, in one pass over one file', () => {
    // cross-spawn was a `require()` here until the case below: a require of an ES module with a
    // default gets its namespace, so that rewrite produced `spawn is not a function`.
    const source = "import { Command } from 'commander';\nimport chalk from 'chalk';\nimport ora from 'ora';\nimport spawn from 'cross-spawn';\n";
    expect(rewriteSource(source).source).toBe(
      "import { Command } from 'burgee/commander';\nimport chalk from 'roundel/chalk';\nimport ora from 'flagstaff/ora';\nimport spawn from 'bellpull/cross-spawn';\n",
    );
  });

  it('keeps a scoped incumbent whole, and refuses a deep import into it', () => {
    expect(rewriteSource("import { createPrompt } from '@inquirer/core';\n").source).toBe("import { createPrompt } from 'caique/inquirer';\n");
    expect(rewriteSource("import x from '@inquirer/core/dist/esm/lib/key.js';\n").refused).toEqual([{ line: 1, specifier: '@inquirer/core/dist/esm/lib/key.js', reason: 'deep-import' }]);
    expect(packageOf('@inquirer/core/dist/x.js')).toBe('@inquirer/core');
  });

  it('leaves a drop-in that is not level yet alone, and says so with its grade', async () => {
    // dotenv's drop-in passes 80 of the 141 cases dotenv itself passes: rewriting it would
    // be a migration that breaks someone. It is reported, not refused — `dotenv/config` is
    // not a deep import into anything this command rewrites.
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { dotenv: '^16.0.0', chalk: '^5.0.0' } }),
      'src/a.ts': "import 'dotenv/config';\nimport chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/a.ts')).toBe("import 'dotenv/config';\nimport chalk from 'roundel/chalk';\n");
    expect(report.refused).toEqual([]);
    expect(report.partial).toEqual([{ from: 'dotenv', to: 'seniority/dotenv', reference: 141, passed: 80, rate: 0.5673758865248227, control: 141 }]);
  });

  it('names the family packages to add, and the command that adds them and removes the incumbents', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { chalk: '^5.0.0', ora: '^8.0.0', flagstaff: '^0.5.0' } }),
      'pnpm-lock.yaml': '',
      'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\n",
    });
    const report = await migrate({ dir, status: clean });
    // flagstaff is already declared, so only roundel is new.
    expect(report.dependencies.add).toEqual(['roundel']);
    expect(report.next).toBe('pnpm add roundel && pnpm remove chalk ora');
  });

  it('defaults the next step to npm, and prints nothing when there is nothing to do', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { 'string-width': '^7.0.0' } }), 'src/a.ts': "import w from 'string-width';\n" });
    expect((await migrate({ dir, status: clean })).next).toBe('npm install linegauge && npm uninstall string-width');
    const empty = project({ 'src/a.ts': 'export {};\n' });
    expect((await migrate({ dir: empty, status: clean })).next).toBe('');
  });

  it('checks a family target\'s exports too: a type it lacks is kept, a value it lacks refuses', () => {
    // flagstaff/boxen has no `Options` type; the type-only import stays on boxen and says why,
    // while `boxen` itself moves. roundel/chalk has no `modifiers` array: a value import of
    // it would not run, so the file is refused rather than rewritten.
    const kept = rewriteSource("import boxen from 'boxen';\nimport type { Options } from 'boxen';\n");
    expect(kept.source).toBe("import boxen from 'flagstaff/boxen';\nimport type { Options } from 'boxen';\n");
    expect(kept.kept.map((k) => k.names)).toEqual([['Options']]);
    expect(rewriteSource("import { modifiers } from 'chalk';\n").refused.map((r) => r.specifier)).toEqual(['chalk']);
  });

  it('refuses a require() whose target is an ES module with a default, and rewrites one without', () => {
    // `require()` of an ES module returns its namespace: `require('roundel/chalk').red` is
    // undefined where `require('chalk').red` was a function. commander's façade has no default,
    // so `const { Command } = require('commander')` reads the same names either way.
    expect(rewriteSource("const chalk = require('chalk');\n").refused).toEqual([{ line: 1, specifier: 'chalk', reason: 'require-of-default' }]);
    expect(rewriteSource("const { Command } = require('commander');\n").source).toBe("const { Command } = require('burgee/commander');\n");
    expect(rewriteSource("const { onExit } = require('signal-exit');\n").source).toBe("const { onExit } = require('closeout/signal-exit');\n");
  });

  it('maps a subpath of an incumbent to the same subpath of its drop-in', () => {
    expect(rewriteSource("import { signals } from 'signal-exit/signals';\n").source).toBe("import { signals } from 'closeout/signal-exit/signals';\n");
  });
});

/**
 * A rewrite is only right if the target exports every name the import asks for.
 *
 * The defect this closes: `import type { Argv } from 'yargs'` was rewritten to
 * `'burgee/yargs'`, which exported no `Argv`, so a TypeScript yargs project came out of the
 * codemod not compiling (`.sdlc/research/adoption-targets.md`). The façades now export the
 * incumbents' whole type surface — `facade-types.test.ts` compiles against it — and this is
 * the guard for the next name that is not there.
 *
 * Mutations, each red against a case below:
 *   M-f  no check at all — every import is rewritten. → "keeps a type-only import …" and
 *        "refuses a value import …" both fail: the file is rewritten to a missing name.
 *   M-g  a missing name refuses the file even when the import is type-only. → "keeps a
 *        type-only import …": the value import next to it never moves.
 *   M-h  `type` read as a modifier on `{ type }` / `import type from`. → the bindingsOf cases.
 *   M-i  a kept import's host reported removable. → "does not call the host removable …".
 */
describe('A11 — a rewrite moves only names the target exports', () => {
  it.each([
    ["import type { Argv } from 'yargs';", "import type { Argv } from 'burgee/yargs';"],
    ["import yargs, { Argv } from 'yargs';", "import yargs, { Argv } from 'burgee/yargs';"],
    ["import yargs, { type Arguments } from 'yargs';", "import yargs, { type Arguments } from 'burgee/yargs';"],
    ["import type { CommandModule, InferredOptionTypes } from 'yargs';", "import type { CommandModule, InferredOptionTypes } from 'burgee/yargs';"],
    ["import { Command, type OptionValues } from 'commander';", "import { Command, type OptionValues } from 'burgee/commander';"],
    ["export type { Argv as Y } from 'yargs';", "export type { Argv as Y } from 'burgee/yargs';"],
    ["import * as yargs from 'yargs';", "import * as yargs from 'burgee/yargs';"],
  ])('rewrites %j — every name in it is exported', (source, expected) => {
    expect(rewriteSource(`${source}\n`)).toMatchObject({ source: `${expected}\n`, refused: [], kept: [] });
  });

  it('keeps a type-only import of a name the façade lacks, and moves the rest of the file', () => {
    const source = "import yargs from 'yargs';\nimport type { Argv, NotAYargsType } from 'yargs';\n";
    const result = rewriteSource(source);
    expect(result.source).toBe("import yargs from 'burgee/yargs';\nimport type { Argv, NotAYargsType } from 'yargs';\n");
    expect(result.refused).toEqual([]);
    expect(result.kept).toEqual([
      {
        line: 2,
        specifier: 'yargs',
        names: ['NotAYargsType'],
        note: "burgee/yargs does not export NotAYargsType; this type-only import stays on 'yargs', so keep its types installed",
      },
    ]);
  });

  it('refuses a value import of a name the façade lacks, and leaves the file as it was', () => {
    const source = "import { Command } from 'commander';\nimport { NotACommanderExport } from 'commander';\n";
    expect(rewriteSource(source)).toEqual({
      source,
      mapped: [],
      refused: [{ line: 2, specifier: 'commander', reason: 'unknown-export', names: ['NotACommanderExport'] }],
      kept: [],
      relevant: true,
    });
  });

  it('refuses a mixed import with a missing type — a scan cannot split the statement', () => {
    const result = rewriteSource("import yargs, { type NotAYargsType } from 'yargs';\n");
    expect(result.refused).toEqual([{ line: 1, specifier: 'yargs', reason: 'unknown-export', names: ['NotAYargsType'] }]);
  });

  it('does not call the host removable while a kept import still names it', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { yargs: '^18.0.0' } }),
      'src/a.ts': "import yargs from 'yargs';\nimport type { NotAYargsType } from 'yargs';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(report.kept).toMatchObject([{ file: 'src/a.ts', line: 2, specifier: 'yargs', names: ['NotAYargsType'] }]);
    // `add` joined the report with A12: the rewritten imports now name burgee.
    expect(report.dependencies).toEqual({ before: ['yargs'], removable: [], after: 1, add: ['burgee'] });
    expect(report.exitCode, 'a kept type import is a note, not a failure — the program compiles and runs').toBe(ExitCode.OK);
    expect(read(dir, 'src/a.ts')).toBe("import yargs from 'burgee/yargs';\nimport type { NotAYargsType } from 'yargs';\n");
  });

  it('checks every target the mapping can produce', () => {
    expect(Object.keys(FACADE_EXPORTS).sort()).toEqual([...new Set(Object.values(MAPPING))].sort());
  });

  it.each([
    [['{', 'a', ',', 'type', 'b', ',', 'c', 'as', 'd', '}'], { typeOnly: false, names: ['a', 'b', 'c'] }],
    [['type', '{', 'Argv', '}'], { typeOnly: true, names: ['Argv'] }],
    [['type'], { typeOnly: false, names: [] }],
    [['yargs', ',', '{', 'type', '}'], { typeOnly: false, names: ['type'] }],
    [['{', 'type', 'as', 't', '}'], { typeOnly: false, names: ['type'] }],
    [['{', 'default', 'as', 'yargs', ',', '}'], { typeOnly: false, names: [] }],
    [['*', 'as', 'ns'], { typeOnly: false, names: [] }],
    [['type', '*', 'as', 'ns'], { typeOnly: true, names: [] }],
  ])('bindingsOf(%j)', (clause, expected) => {
    expect(bindingsOf(clause)).toEqual(expected);
  });

  it('reads the clause across lines and comments', () => {
    const source = "import {\n  // the instance\n  Argv,\n  /* and */ Arguments,\n} from 'yargs';\n";
    expect(scan(source).sites[0]?.clause).toEqual(['{', 'Argv', ',', 'Arguments', ',', '}']);
  });

  it('does not carry a clause into a later dynamic import', () => {
    const source = "export function load() {\n  return import('yargs');\n}\n";
    expect(scan(source).sites[0]).not.toHaveProperty('clause');
  });
});

describe('the walk', () => {
  it('reads source files and skips the generated and vendored trees', () => {
    const dir = project({
      'src/a.ts': '',
      'src/deep/b.mjs': '',
      'src/c.tsx': '',
      'README.md': '',
      'node_modules/pkg/index.js': '',
      'dist/out.js': '',
      'coverage/x.js': '',
    });
    expect(sourceFiles(dir).sort()).toEqual(['src/a.ts', 'src/c.tsx', 'src/deep/b.mjs']);
  });
});
