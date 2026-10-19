/**
 * migrate-older-majors — an off-major project gets a work list, and a move only where no line is in
 * its way (`.sdlc/intents/migrate-older-majors/`).
 *
 * The fixtures are the 2026-10-18 field trial's four `manual`-arm crashes (barrier 1 in
 * `.sdlc/research/adoption-barriers-2026-10.md`), cut down to the lines that decide them and padded
 * so every line keeps its number at the pinned SHA: wait-port `16083537`, madge `456057b8`,
 * tsc-alias `1077308b` and node-qrcode `3848ed2c`. **Every case here failed on `main` at
 * `326907ec`** first, except those marked as written first, which guard the change; the PR records
 * each failure line.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { PREVIOUS_MAJOR_ENTRIES, SUPPORTED_MAJORS } from './compat.js';
import { ExitCode } from './exit-code.js';
import { type MajorHost, moveOf, nearestOf, removedMajor, REMOVED_APIS, type RemovedApiId, removedSites } from './migrate-majors.js';
import { FACADE_EXPORTS, MAPPING, migrate, type MigrateOptions, textOf, tokensOf } from './migrate.js';

const scratch = scratchDirs();

function project(files: Record<string, string>): string {
  const dir = scratch('burgee-migrate-majors-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');
/** No registry and no release age: nothing here reaches the network. */
const run = async (dir: string, more: Partial<MigrateOptions> = {}): ReturnType<typeof migrate> => await migrate({ dir, status: () => undefined, registry: async () => undefined, since: {}, ...more });

/** A file whose line `n` is `lines[n]`, and every other line blank, so a fixture keeps the trial's line numbers. */
function lined(lines: Record<number, string>): string {
  const last = Math.max(...Object.keys(lines).map(Number));
  return `${Array.from({ length: last }, (_, i) => lines[i + 1] ?? '').join('\n')}\n`;
}

const manifest = (dependencies: Record<string, string>, more: object = {}): string => JSON.stringify({ name: 'x', dependencies, ...more });
const installed = (name: string, version: string): Record<string, string> => ({ [`node_modules/${name}/package.json`]: JSON.stringify({ name, version }) });

/** The row of one API, as a site carries it. */
function cited(api: RemovedApiId): { api: RemovedApiId; removedIn: string; replacement: string; source: string } {
  const { removedIn, replacement, source } = REMOVED_APIS.find((row) => row.api === api) as (typeof REMOVED_APIS)[number];
  return { api, removedIn, replacement, source };
}

/** wait-port `16083537`: commander 9, `require('commander')` as the program on line 4, first used for `.version` on line 13. */
const WAIT_PORT = {
  'package.json': manifest({ commander: '^9.3.0' }, { bin: { 'wait-port': './bin/wait-port.js' } }),
  ...installed('commander', '9.4.0'),
  'bin/wait-port.js': lined({
    1: '#!/usr/bin/env node',
    4: "const program = require('commander');",
    5: "const pkg = require('../package.json');",
    12: 'program',
    13: '  .version(pkg.version)',
    15: "  .option('-t, --timeout [n]', 'Timeout', parseInt)",
  }),
};

/** madge `456057b8`: commander 7, the same shape, first used on line 14 — `storeOptionsAsProperties`, which commander 15 still has on a Command. */
const MADGE = {
  'package.json': manifest({ commander: '^7.2.0' }),
  ...installed('commander', '7.2.0'),
  'bin/cli.js': lined({
    1: '#!/usr/bin/env node',
    6: "const program = require('commander');",
    14: 'program.storeOptionsAsProperties();',
    16: 'program',
    17: '  .version(version)',
  }),
};

/** tsc-alias `1077308b`: commander 9 through named imports, and the two-letter short flag `-fe` on line 23. */
const TSC_ALIAS = {
  'package.json': manifest({ commander: '^9.0.0' }),
  ...installed('commander', '9.5.0'),
  'src/bin/index.ts': lined({
    1: '#! /usr/bin/env node',
    2: "import { Option, program } from 'commander';",
    7: 'program',
    9: '  .version(version)',
    10: "  .option('-p, --project <file>', 'path to tsconfig.json')",
    12: '  .option(',
    13: "    '--outDir, --dir <dir>',",
    21: '  .addOption(',
    22: '    new Option(',
    23: "      '-fe, --resolve-full-extension [ext]',",
  }),
};

/** node-qrcode `3848ed2c`: yargs 15, the singleton bound on line 2 of the extensionless `bin/qrcode`, first used on line 48. */
const QRCODE = {
  'package.json': manifest({ yargs: '^15.3.1' }, { bin: { qrcode: './bin/qrcode' } }),
  ...installed('yargs', '15.4.1'),
  'lib/index.js': 'module.exports = {};\n',
  'bin/qrcode': lined({
    1: '#!/usr/bin/env node',
    2: "var yargs = require('yargs')",
    3: "var qr = require('../lib')",
    48: '    yargs.showHelp()',
    59: 'var argv = yargs',
    60: '  .detectLocale(false)',
  }),
};

const NOTHING = 'nothing to rewrite; 1 line uses an API a claimed major removed (see offMajor)';

describe('migrate-older-majors — the field trial', () => {
  it('wait-port: names line 4, module-as-program, removed in 12.0.0, first used on line 13, and prints no move', async () => {
    const report = await run(project(WAIT_PORT));
    expect(report.offMajor).toEqual([{ from: 'commander', found: '9.4.0', graded: report.offMajor[0]?.graded, nearest: 14, sites: [{ file: 'bin/wait-port.js', line: 4, ...cited('module-as-program'), firstUse: 13 }], move: null }]);
    expect(report.summary).toBe(NOTHING);
  });

  it('madge: names line 6, module-as-program, first used on line 14 — not storeOptionsAsProperties, which commander 15 still has', async () => {
    const report = await run(project(MADGE));
    expect(report.offMajor[0]).toMatchObject({ found: '7.2.0', nearest: 14, sites: [{ file: 'bin/cli.js', line: 6, ...cited('module-as-program'), firstUse: 14 }], move: null });
  });

  it('tsc-alias: names the -fe literal, multi-char-short-flag, removed in 13.0.0, and prints no move', async () => {
    const report = await run(project(TSC_ALIAS));
    expect(report.offMajor[0]).toMatchObject({ found: '9.5.0', nearest: 14, sites: [{ file: 'src/bin/index.ts', line: 23, ...cited('multi-char-short-flag') }], move: null });
    expect(report.summary).toBe(NOTHING);
  });

  it("qrcode: names bin/qrcode line 2, singleton, removed in 18.0.0, first used on line 48, and moves to 17's own entry, which still has it", async () => {
    const report = await run(project(QRCODE));
    expect(report.offMajor).toEqual([
      { from: 'yargs', found: '15.4.1', graded: report.offMajor[0]?.graded, nearest: 17, sites: [{ file: 'bin/qrcode', line: 2, ...cited('singleton'), firstUse: 48 }], move: { yargs: 'burgee/yargs/v17' } },
    ]);
    expect(report.detected.imported).toEqual(['yargs']);
  });

  it.each([
    ['wait-port', WAIT_PORT],
    ['madge', MADGE],
    ['tsc-alias', TSC_ALIAS],
    ['qrcode', QRCODE],
  ])('changes no file and no exit code in %s (written first: no rewrite without a grade)', async (_, fixture) => {
    const dir = project(fixture);
    const report = await run(dir);
    for (const [file, body] of Object.entries(fixture)) expect(read(dir, file)).toBe(body);
    expect(report.exitCode).toBe(ExitCode.OK);
    expect(report.files).toBe(0);
  });

  it('a project on a claimed major gets no off-major row, and so no sites (written first: intent criterion 2)', async () => {
    const report = await run(project({ ...WAIT_PORT, 'package.json': manifest({ commander: '^15.0.0' }), ...installed('commander', '15.0.0') }));
    expect(report.offMajor).toEqual([]);
  });

  it('prints each site under its incumbent, and says which lines stand in the way of the move', async () => {
    const both = lined({ 2: "const program = require('commander');", 3: "program.option('-ab, --all').version('1')" });
    const report = await run(project({ 'package.json': manifest({ commander: '^9.0.0' }), 'cli.js': both }));
    expect(report.summary).toBe('nothing to rewrite; 2 lines use an API a claimed major removed (see offMajor)');
    expect(textOf(report)).toContain(
      [
        `  commander ^9.0.0 (graded ${report.offMajor[0]?.graded as string}); nearest claimed 14, no move: 2 lines below use an API 14 removed`,
        "    cli.js:2  module-as-program  removed in 12.0.0; use: const { program } = require('commander') (first use line 3)",
        '    cli.js:3  multi-char-short-flag  removed in 13.0.0; use: a one-character short flag, or the long flag alone',
      ].join('\n'),
    );
  });
});

describe('migrate-older-majors — the move', () => {
  it("moves each specifier the project imports to its entry at the nearest claimed major: 17's singleton and factory, and the helpers both share", async () => {
    const report = await run(
      project({
        'package.json': manifest({ yargs: '^16.0.0' }),
        'a.js': "const yargs = require('yargs');\nyargs.option('x').argv;\n",
        'b.js': "const make = require('yargs/yargs');\nconst { hideBin } = require('yargs/helpers');\n",
      }),
    );
    expect(report.offMajor[0]).toMatchObject({ nearest: 17, move: { yargs: 'burgee/yargs/v17', 'yargs/yargs': 'burgee/yargs/v17/yargs', 'yargs/helpers': 'burgee/yargs/helpers' } });
    expect(report.offMajor[0]?.sites.map((s) => [s.line, s.api])).toEqual([[1, 'singleton']]);
  });

  it('lists the move in the order the specifiers sort, whichever file names each first', async () => {
    const report = await run(project({ 'package.json': manifest({ yargs: '^16.0.0' }), 'a.js': "require('yargs/yargs');\n", 'b.js': "require('yargs/helpers');\nrequire('yargs')(process.argv);\n" }));
    expect(Object.keys(report.offMajor[0]?.move ?? {})).toEqual(['yargs', 'yargs/helpers', 'yargs/yargs']);
  });

  it('moves a commander 9 program that reads only what 14 exports to burgee/commander/v14', async () => {
    const report = await run(project({ 'package.json': manifest({ commander: '^9.0.0' }), 'cli.js': "const commander = require('commander');\nconst { program, Option } = require('commander');\nprogram.addOption(new commander.Option('-a, --all')).parse();\n" }));
    expect(report.offMajor[0]).toMatchObject({ nearest: 14, sites: [], move: { commander: 'burgee/commander/v14' } });
  });

  it("keeps each incumbent's sites on its own row, and reads a pattern only in a file that imports its incumbent", async () => {
    const report = await run(
      project({
        'package.json': manifest({ commander: '^9.0.0', yargs: '^15.0.0' }),
        'a.js': "const y = require('yargs/yargs')();\ny.option('-ab, --all').reset();\n",
        'b.js': "const program = require('commander');\nprogram.version('1');\n",
      }),
    );
    expect(report.offMajor.map((o) => [o.from, o.sites.map((s) => `${s.file}:${s.line} ${s.api}`)])).toEqual([
      ['commander', ['b.js:1 module-as-program']],
      ['yargs', ['a.js:2 reset']],
    ]);
  });

  it('says only what it rewrote when files moved, beside an off-major work list', async () => {
    const report = await run(project({ 'package.json': manifest({ chalk: '^6.0.0', commander: '^9.0.0' }), 'a.js': "const chalk = require('chalk');\nconst program = require('commander');\nprogram.version('1');\n" }));
    expect(report.summary).toBe('complete: 1 file rewritten');
    expect(report.offMajor[0]?.sites).toHaveLength(1);
  });

  it('moves a commander 13 program that uses nothing 14 removed to burgee/commander/v14', async () => {
    const report = await run(project({ 'package.json': manifest({ commander: '~13.1.0' }), 'cli.js': "const { program } = require('commander');\nprogram.option('-a, --all').parse();\n" }));
    expect(report.offMajor[0]).toMatchObject({ nearest: 14, sites: [], move: { commander: 'burgee/commander/v14' } });
    expect(report.summary).toBe('nothing to rewrite');
  });

  it('prints no move when the project imports a specifier no claimed entry serves: commander/esm.mjs, or a deep import', async () => {
    const esm = await run(project({ 'package.json': manifest({ commander: '^13.0.0' }), 'cli.mjs': "import { program } from 'commander/esm.mjs';\n" }));
    expect(esm.offMajor[0]).toMatchObject({ nearest: 14, sites: [{ file: 'cli.mjs', line: 1, ...cited('esm-mjs') }], move: null });
    const deep = await run(project({ 'package.json': manifest({ yargs: '^16.0.0' }), 'cli.js': "const make = require('yargs/yargs');\nconst y18n = require('yargs/lib/platform-shims/cjs');\n" }));
    expect(deep.offMajor[0]).toMatchObject({ nearest: 17, sites: [], move: null });
  });

  it('prints no move for an incumbent it has no table for, whose removals nothing here checks, nor for one nothing imports', async () => {
    const report = await run(project({ 'package.json': manifest({ chalk: '^4.1.2', yargs: '^16.0.0' }), 'a.js': "const chalk = require('chalk');\n" }));
    expect(report.offMajor.map((o) => [o.from, o.nearest, o.move])).toEqual([
      ['yargs', 17, null],
      ['chalk', 6, null],
    ]);
  });

  it('has no nearest major, and no move, above the highest claimed one', async () => {
    const report = await run(project({ 'package.json': manifest({ commander: '^16.0.0' }), 'cli.js': "const { program } = require('commander');\n" }));
    expect(report.offMajor[0]).toMatchObject({ nearest: null, sites: [], move: null });
  });

  it('nearest is the smallest claimed major above the found one, read from SUPPORTED_MAJORS', () => {
    expect(nearestOf(9, SUPPORTED_MAJORS['commander'] as readonly number[])).toBe(14);
    expect(nearestOf(15, SUPPORTED_MAJORS['yargs'] as readonly number[])).toBe(17);
    expect(nearestOf(17, [18, 17, 19])).toBe(18);
    expect(nearestOf(19, [18, 17])).toBeUndefined();
  });

  it('the gate: a move is refused by an API removed at or before the target, or by an unserved specifier, and by nothing removed after it', () => {
    expect(moveOf(15, [17, 18], [at('18.0.0')], false)).toBe(17);
    expect(moveOf(15, [17, 18], [at('17.0.0')], false)).toBeUndefined();
    expect(moveOf(15, [17, 18], [at('16.0.0'), at('18.0.0')], false)).toBeUndefined();
    expect(moveOf(15, [17, 18], [], true)).toBeUndefined();
    expect(moveOf(18, [17, 18], [], false)).toBeUndefined();
    expect(moveOf(9, [15, 14], [at('15.0.0')], false)).toBe(14);
  });
});

const at = (removedIn: string): { removedIn: string } => ({ removedIn });

/** Every site `source` holds, for a project on commander 9 and yargs 15, as `[line, api, firstUse]`. */
function sitesIn(source: string, found: [MajorHost, number][] = [['commander', 9], ['yargs', 15]], claimed: Record<MajorHost, number> = { commander: 15, yargs: 18 }): (number | string | undefined)[][] {
  const exports = { commander: FACADE_EXPORTS['burgee/commander'] as readonly string[], yargs: FACADE_EXPORTS['burgee/yargs'] as readonly string[] };
  return removedSites(tokensOf(source), new Map(found), claimed, exports).map((s) => [s.line, s.api, s.firstUse]);
}

describe('migrate-older-majors — what is a site', () => {
  it.each([
    ['a destructured program', "const { program, Command } = require('commander');\nprogram.version('1');\n"],
    ['a named export off the module', "require('commander').program.version('1');\n"],
    ['the module used for its exports', "const commander = require('commander');\nconst p = new commander.Command();\ncommander.program.parse();\n"],
    ['a binding never used as the program', "const program = require('commander');\nmodule.exports = program;\n"],
    ["yargs' factory module", "require('yargs/yargs')(process.argv.slice(2)).argv;\n"],
    ['the singleton called as the factory', "require('yargs')(process.argv.slice(2)).argv;\nconst yargs = require('yargs');\nyargs(process.argv.slice(2)).option('x');\n"],
    ['an export of the façade, off the singleton', "const yargs = require('yargs');\nyargs.hideBin(process.argv);\n"],
    ['a member of a different object with the same name', "const program = require('commander');\nother.program.version('1');\nprogram\n"],
    ['a binding to a property', "app.program = require('commander');\napp.program.version('1');\n"],
    ['a one-character short flag, a long pair, and a computed flags string', "import { program } from 'commander';\nprogram.option('-a, --all').option('--ws, --workspace').option(flags).option('-p <n>|--port');\n"],
    ['an option call with no receiver, and an Option without new', "import { Option } from 'commander';\noption('-ab');\nx.Option('-ab');\nnew Option();\n"],
    ['a type-only default import', "import type yargs from 'yargs';\nyargs.argv;\n"],
    ['rebase, reset and onFinishCommand that are not calls on something', "import yargs from 'yargs/yargs';\nrebase(a, b);\nx.reset;\nconst onFinishCommand = 1;\n"],
    ['an import of another module', "import program from './program.js';\nprogram.version('1');\n"],
    ['a call that is not require', "fake('commander').version('1');\n"],
    ['require passed as an argument', "fn(require, 'commander').version('1');\nwrap(require('commander'));\nwrap.version('1');\n"],
    ['a computed require', "const p = require('commander' + suffix);\np.version('1');\n"],
    ['a renamed destructured export', "const { program: version, Command: argv } = require('commander');\n"],
    ['a require bound to an element', "list[0] = require('commander');\nlist[0].version('1');\n"],
    ['a flags-like string in any other call', "import { Option } from 'commander';\nconsole.log('-ab');\nOption('-ab');\n"],
    ['a namespace import, and a named import after a default one that is not yargs', "import * as y from 'yargs';\ny.argv;\nimport z, { a } from 'yargs/yargs';\nz.argv;\n"],
  ])('does not report %s', (_, source) => {
    expect(sitesIn(source)).toEqual([]);
  });

  it.each([
    ['a whole require bound by const', "const program = require('commander');\nprogram\n  .version('1');\n", [[1, 'module-as-program', 3]]],
    ['a whole require bound by plain assignment', "let program;\nprogram = require('commander');\nprogram.parse();\n", [[2, 'module-as-program', 3]]],
    ['a use above the binding, in a function that runs after it', "function run() {\n  program.parse();\n}\nconst program = require('commander');\n", [[4, 'module-as-program', 2]]],
    ['a default import, alone or with named ones', "import program, { Option } from 'commander';\nprogram.version('1');\nimport y from 'yargs';\ny.argv;\n", [[1, 'module-as-program', 2], [3, 'singleton', 4]]],
    ['a member straight off the module', "require('commander').version('1');\nrequire('yargs')\n  .argv;\n", [[1, 'module-as-program', undefined], [2, 'singleton', undefined]]],
    ['a destructured member the module no longer has', "const { argv } = require('yargs');\nconst { Command, version: v } = require('commander');\n", [[1, 'singleton', undefined], [2, 'module-as-program', undefined]]],
    ['each flag string with a two-letter short flag', "const { program, Option } = require('commander');\nprogram.option('-ab, --all');\nprogram.requiredOption('-n|-xy <n>');\nnew Option('-fe');\nnew commander.Option(\n  '-gh');\n", [[2, 'multi-char-short-flag', undefined], [3, 'multi-char-short-flag', undefined], [4, 'multi-char-short-flag', undefined], [6, 'multi-char-short-flag', undefined]]],
    ['commander/esm.mjs in an import and a require', "import { program } from 'commander/esm.mjs';\nconst c = require('commander/esm.mjs');\n", [[1, 'esm-mjs', undefined], [2, 'esm-mjs', undefined]]],
    ["yargs' removed instance methods", "const y = require('yargs/yargs')();\ny.rebase(a, b);\ny.reset();\ny.onFinishCommand(done);\n", [[2, 'rebase', undefined], [3, 'reset', undefined], [4, 'on-finish-command', undefined]]],
  ])('reports %s', (_, source, sites) => {
    expect(sitesIn(source)).toEqual(sites);
  });

  it.each([
    ["const program = require('commander');\nprogram.option(", [[1, 'module-as-program', 2]]],
    ['import x from', []],
    ['require(', []],
    ['import y,', []],
  ])('does not throw on a file cut off mid-statement: %s', (source, sites) => {
    expect(sitesIn(source)).toEqual(sites);
  });

  it("reads each incumbent's patterns only in a file that imports it", () => {
    const commanderOnly = "program.option('-ab');\nimport 'commander/esm.mjs';\ny.reset();\n";
    expect(sitesIn(commanderOnly, [['yargs', 15]])).toEqual([[3, 'reset', undefined]]);
    expect(sitesIn(commanderOnly, [['commander', 9]])).toEqual([
      [1, 'multi-char-short-flag', undefined],
      [2, 'esm-mjs', undefined],
    ]);
  });

  it('reports an API removed after the found major and at or before the highest claimed one, and no other', () => {
    const source = "const program = require('commander');\nprogram.option('-ab');\nimport 'commander/esm.mjs';\n";
    expect(sitesIn(source, [['commander', 12]])).toEqual([
      [2, 'multi-char-short-flag', undefined],
      [3, 'esm-mjs', undefined],
    ]);
    expect(sitesIn(source, [['commander', 9]], { commander: 14, yargs: 18 })).toEqual([
      [1, 'module-as-program', 2],
      [2, 'multi-char-short-flag', undefined],
    ]);
    expect(sitesIn("const y = require('yargs');\ny.argv;\ny.reset();\n", [['yargs', 16]], { commander: 15, yargs: 17 })).toEqual([[3, 'reset', undefined]]);
  });

  it('removedMajor reads the major of a release', () => {
    expect(removedMajor({ removedIn: '12.0.0' })).toBe(12);
  });
});

/**
 * R6b — each row is true of the drop-in: the entry at every claimed major lacks the API when the
 * incumbent had removed it by then, and serves it when it had not. A row the façade still serves
 * would be a false work item, and a major that serves an API the table calls gone would make the
 * gate refuse a move that works. Loaded through the package's own exports map, as a migrated
 * program loads it; `npm test` builds first.
 */
const MANIFEST = fileURLToPath(new URL('../package.json', import.meta.url));
const loadThrough = createRequire(MANIFEST);

/** The entry `host` takes at a claimed `major`, loaded through burgee's exports map. */
function entryAt(host: MajorHost, major: number): Record<string, unknown> & ((args: string[]) => Record<string, unknown>) {
  const entry = PREVIOUS_MAJOR_ENTRIES[host]?.[major] ?? (MAPPING[host] as string);
  // eslint-disable-next-line node-security/no-dynamic-require, node-security/no-dynamic-dependency-loading -- the specifier is a value of MAPPING or PREVIOUS_MAJOR_ENTRIES, the entry under test
  return loadThrough(entry) as Record<string, unknown> & ((args: string[]) => Record<string, unknown>);
}

/** A yargs instance from the entry at `major`: `require()` of the current entry is its namespace, of 17's the singleton, a function. */
function instanceAt(host: MajorHost, major: number): Record<string, unknown> {
  const yargs = entryAt(host, major);
  return (typeof yargs === 'function' ? yargs : (yargs['default'] as (args: string[]) => Record<string, unknown>))([]);
}

/** Whether `new Option(flags)` from the entry at `major` accepts a two-letter short flag. */
function acceptsMultiCharShort(host: MajorHost, major: number): boolean {
  try {
    new (entryAt(host, major)['Option'] as new (flags: string) => unknown)('-fe, --resolve-full-extension [ext]');
    return true;
  } catch {
    return false;
  }
}

const SERVES: Readonly<Record<RemovedApiId, (host: MajorHost, major: number) => boolean>> = {
  'module-as-program': (host, major) => typeof entryAt(host, major)['version'] === 'function',
  'multi-char-short-flag': acceptsMultiCharShort,
  'esm-mjs': (_, major) => (PREVIOUS_MAJOR_ENTRIES['commander/esm.mjs']?.[major] ?? MAPPING['commander/esm.mjs']) !== undefined,
  rebase: (host, major) => typeof instanceAt(host, major)['rebase'] === 'function',
  reset: (host, major) => typeof instanceAt(host, major)['reset'] === 'function',
  'on-finish-command': (host, major) => typeof instanceAt(host, major)['onFinishCommand'] === 'function',
  singleton: (host, major) => typeof entryAt(host, major)['option'] === 'function',
};

/**
 * Whether the incumbent still had the API at `major`. `commander/esm.mjs` is a specifier, not a
 * member: no claimed entry serves it, 14's included, so the gate refuses a move for it as an
 * unserved specifier, whatever major removed it.
 */
const servedAt = (row: (typeof REMOVED_APIS)[number], major: number): boolean => row.api !== 'esm-mjs' && removedMajor(row) > major;

describe('migrate-older-majors — each removed API, against the drop-in at every claimed major', () => {
  it.each(REMOVED_APIS.flatMap((row) => (SUPPORTED_MAJORS[row.host] as readonly number[]).map((major) => [row.api, row.host, major, servedAt(row, major)] as const)))(
    '%s on %s %i: served is %s',
    (api, host, major, served) => {
      expect(SERVES[api](host, major)).toBe(served);
    },
  );
});
