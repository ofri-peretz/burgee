/**
 * migrate-dynamic-specifiers — a computed specifier holds only what it could load
 * (`.sdlc/intents/migrate-dynamic-specifiers/`).
 *
 * The fixtures are the 2026-10-18 field trial's two refusals (barrier 9 in
 * `.sdlc/research/adoption-barriers-2026-10.md`), cut down to the lines that decide them and
 * padded so every line keeps its number at the pinned SHA: postcss-cli `03e8cee3` and madge
 * `456057b8`. **Every case here failed on `main` at `1dcf064a03`** first; the PR records each
 * failure line.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { ExitCode } from './exit-code.js';
import { migrate, type MigrateOptions, rewriteSource } from './migrate.js';

const scratch = scratchDirs();

function project(files: Record<string, string>): string {
  const dir = scratch('burgee-migrate-dynamic-');
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

/** postcss-cli `03e8cee3` `index.js`: picocolors on line 7, four computed imports on 69–71 and 77. */
const POSTCSS_INDEX = lined({
  7: "import pc from 'picocolors'",
  16: "import argv from './lib/args.js'",
  69: '    parser: argv.parser ? await import(argv.parser) : undefined,',
  70: '    syntax: argv.syntax ? await import(argv.syntax) : undefined,',
  71: '    stringifier: argv.stringifier ? await import(argv.stringifier) : undefined,',
  75: '        argv.use.map(async (plugin) => {',
  77: '            return (await import(plugin)).default()',
  79: "            const msg = e.message || `Unknown error in '${plugin}'`",
});

/** madge `456057b8` `bin/cli.js`: commander 7 (off-major) and rc, and a `package.json` read from the working directory on line 63. */
const MADGE_CLI = lined({
  4: "const path = require('path');",
  6: "const program = require('commander');",
  7: "const rc = require('rc')('madge');",
  63: "\tpackageConfig = require(path.join(process.cwd(), 'package.json')).madge;",
});

/** The non-literal refusal lines of one source, and the computed sites it passed. */
function verdict(source: string): { refused: number[]; dynamic: unknown } {
  const result = rewriteSource(source);
  return { refused: result.refused.filter((r) => r.reason === 'non-literal-specifier').map((r) => r.line), dynamic: result.dynamic };
}

describe('migrate-dynamic-specifiers — the field trial', () => {
  it('the postcss-cli shape: picocolors moves, the run is complete, and the four computed imports are listed', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'postcss-cli', type: 'module', dependencies: { picocolors: '^1.1.1', yargs: '^18.0.0' } }), 'index.js': POSTCSS_INDEX });
    const report = await run(dir);
    expect(report.refused).toEqual([]);
    expect(report.held).toEqual([]);
    expect(report.summary).toBe('complete: 1 file rewritten');
    expect(report.exitCode).toBe(ExitCode.OK);
    expect(read(dir, 'index.js').split('\n')[6]).toBe("import pc from 'roundel/picocolors'");
    expect(report.dynamic).toEqual([
      { file: 'index.js', line: 69, shape: 'argv-member' },
      { file: 'index.js', line: 70, shape: 'argv-member' },
      { file: 'index.js', line: 71, shape: 'argv-member' },
      { file: 'index.js', line: 77, shape: 'argv-element' },
    ]);
  });

  it('the madge shape: the file moves, and line 63 is read as a cwd path', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'madge', dependencies: { commander: '^7.2.0', rc: '^1.2.8' } }),
      'node_modules/commander/package.json': JSON.stringify({ name: 'commander', version: '7.2.0' }),
      'bin/cli.js': MADGE_CLI,
    });
    const report = await run(dir);
    expect(report.refused).toEqual([]);
    expect(report.held).toEqual([]);
    expect(report.exitCode).toBe(ExitCode.OK);
    const lines = read(dir, 'bin/cli.js').split('\n');
    expect(lines[6]).toBe("const rc = require('seniority/rc')('madge');");
    expect(lines[5], 'commander 7 is off-major and stays').toBe("const program = require('commander');");
    expect(report.dynamic).toEqual([{ file: 'bin/cli.js', line: 63, shape: 'cwd-path' }]);
  });

  it('a run with no computed specifier still reports dynamic, as []', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', type: 'module', dependencies: { picocolors: '^1.1.1' } }), 'a.js': "import pc from 'picocolors'\n" });
    expect((await run(dir)).dynamic).toEqual([]);
  });
});

describe('migrate-dynamic-specifiers R1–R3 — the three shapes pass', () => {
  it.each([
    ["require(path.resolve(__dirname))", 'cwd-path'],
    ["require(path.resolve(process.cwd(), \"a\", 'b.json'))", 'cwd-path'],
    ["require(path.join(__dirname, 'package.json'))", 'cwd-path'],
    ['await import(args.x)', 'argv-member'],
    ['await import(options.reporter)', 'argv-member'],
    ['await import(opts.$x)', 'argv-member'],
    ['await import(flags.loader)', 'argv-member'],
  ])('%s passes as %s', (line, shape) => {
    const result = rewriteSource(`import pc from 'picocolors';\n${line};\n`);
    expect(result.refused).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 2, shape }]);
    expect(result.source.split('\n')[0]).toBe("import pc from 'roundel/picocolors';");
  });

  it.each([
    'argv.use.map(function (p) { return import(p) })',
    'argv.use.forEach(p => require(p))',
    'options.plugins.flatMap(async function (p) { return import(p) })',
    'flags.x.filter(async p => import(p))',
    'args.x.map((p) => import(p))',
    'argv.use.map(async (p) => import(p))',
  ])('an argv element bound by %s passes', (line) => {
    const result = rewriteSource(`import pc from 'picocolors';\n${line};\n`);
    expect(result.refused).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 2, shape: 'argv-element' }]);
  });

  it('the words a callback opens with are not bound: async and function stay unknown names', () => {
    expect(verdict("import pc from 'picocolors';\nargv.use.map(async function (p) {});\nimport(async);\nimport(function);\nimport(p);\n")).toEqual({ refused: [3, 4], dynamic: [{ line: 5, shape: 'argv-element' }] });
  });

  it('an element is bound from its callback on: an import of the same name before it is refused', () => {
    expect(verdict("import pc from 'picocolors';\nimport(p);\nargv.use.map((p) => 1);\nimport(p);\n")).toEqual({ refused: [2], dynamic: [{ line: 4, shape: 'argv-element' }] });
  });

  it.each([
    'cfg.use.map((p) => import(p))',
    'argv.use.some((p) => import(p))',
    'argv.use.map(function named(p) { return import(p) })',
    'argv.use.map(([p]) => import(p))',
    'argv.use.map(((p)) => import(p))',
    'argv.use.map(async async (p) => import(p))',
    'argv.use.map(function p() { return import(p) })',
    'argv . use . map ( x , ( p ) => import(p))',
    'argv[use].map((p) => import(p))',
    'argv.use(map((p) => import(p)))',
    'argv+use.map((p) => import(p))',
  ])('a P bound by %s does not pass', (line) => {
    expect(verdict(`import pc from 'picocolors';\n${line};\n`)).toEqual({ refused: [2], dynamic: [] });
  });
});

describe('migrate-dynamic-specifiers R4 — a file that names an incumbent in a string still refuses', () => {
  it.each([
    ["const name = 'chalk';\nawait import(argv.x);", 3],
    ["require(path.join(__dirname, 'node_modules', 'chalk'));", 2],
    ["const core = '@inquirer/core';\nargv.use.map((plugin) => import(plugin));", 3],
    ["const core = 'x/node_modules/@inquirer/core/dist/index.js';\nawait import(argv.x);", 3],
    ["const p = `chalk`;\nawait import(argv.x);", 3],
    ["const p = `${root}/chalk`;\nawait import(argv.x);", 3],
    ["const p = `chalk${suffix}`;\nawait import(argv.x);", 3],
    ["const p = `${prefix}chalk`;\nawait import(argv.x);", 3],
    ['const name = "chalk";\nawait import(argv.x);', 3],
    ["const p = 'C:\\\\deps\\\\chalk';\nawait import(argv.x);", 3],
    ["await import(argv.x);\nconst late = 'chalk';", 2],
  ])('%s refuses', (body, line) => {
    const result = rewriteSource(`import pc from 'picocolors';\n${body}\n`);
    expect(result.refused).toEqual([{ line, specifier: '', reason: 'non-literal-specifier' }]);
    expect(result.dynamic).toEqual([]);
  });

  it.each([
    "const name = 'chalk-template';",
    "const name = 'my-chalk';",
    "const scope = 'node_modules/@inquirer';",
    "const name = 'core/@inquirer';",
    "log(`Unknown error in '${plugin}'`);",
  ])('%s names no incumbent, so the computed import still passes', (body) => {
    const result = rewriteSource(`import pc from 'picocolors';\n${body}\nawait import(argv.x);\n`);
    expect(result.refused).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 3, shape: 'argv-member' }]);
  });

  it('the incumbent the string names is held in every file, beside the ones the refused file imports (intent criterion 2)', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', type: 'module', dependencies: { chalk: '^6.0.0', picocolors: '^1.1.1' } }),
      'a.js': "import pc from 'picocolors';\nconst name = 'chalk';\nawait import(argv.x);\n",
      'b.js': "import chalk from 'chalk';\n",
    });
    const report = await run(dir);
    expect(report.held).toEqual([
      { from: 'chalk', files: ['a.js'], because: 'refused' },
      { from: 'picocolors', files: ['a.js'], because: 'refused' },
    ]);
    expect(read(dir, 'b.js'), 'chalk does not move in the file that imports it').toBe("import chalk from 'chalk';\n");
    expect(report.summary).toBe('partial: 0 files rewritten, 1 refused');
  });

  it('a file that imports no incumbent, and builds a computed name from a string that names one, is refused and holds it', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', type: 'module', dependencies: { chalk: '^6.0.0' } }),
      'load.js': "const name = 'chalk';\nexport default await import(name);\n",
      'b.js': "import chalk from 'chalk';\n",
    });
    const report = await run(dir);
    expect(report.refused).toEqual([{ file: 'load.js', line: 2, specifier: '', reason: 'non-literal-specifier' }]);
    expect(report.held).toEqual([{ from: 'chalk', files: ['load.js'], because: 'refused' }]);
    expect(read(dir, 'b.js')).toBe("import chalk from 'chalk';\n");
    expect(report.exitCode).toBe(ExitCode.RUNTIME);
  });

  it('a string that names an incumbent the run does not move guards nothing', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', type: 'module', dependencies: { picocolors: '^1.1.1' } }),
      'a.js': "import pc from 'picocolors';\nconst name = 'chalk';\nawait import(argv.x);\n",
      'load.js': "const name = 'chalk';\nexport default await import(name);\n",
    });
    const report = await run(dir);
    expect(report.refused).toEqual([]);
    expect(report.held).toEqual([]);
    expect(report.dynamic).toEqual([{ file: 'a.js', line: 3, shape: 'argv-member' }]);
    expect(read(dir, 'a.js').split('\n')[0]).toBe("import pc from 'roundel/picocolors';");
  });

  it('a string that names an incumbent, in a file with no computed specifier, holds nothing', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', type: 'module', dependencies: { chalk: '^6.0.0' } }),
      'a.js': "log('chalk');\n",
      'b.js': "import chalk from 'chalk';\n",
    });
    const report = await run(dir);
    expect(report.held).toEqual([]);
    expect(report.dynamic).toEqual([]);
    expect(read(dir, 'b.js')).toBe("import chalk from 'roundel/chalk';\n");
  });

  it('an incumbent named in a specifier position is not a string the guard reads', () => {
    const result = rewriteSource("import pc from 'picocolors';\nvi.mock('chalk');\nimport c from 'chalk';\nawait import(argv.x);\n");
    expect(result.refused).toEqual([]);
    expect(result.dynamic).toEqual([{ line: 4, shape: 'argv-member' }]);
  });
});

describe('migrate-dynamic-specifiers R5 — every other computed specifier is refused as before', () => {
  it.each([
    'await import(name)',
    'require(`${pkg}`)',
    'require(a + b)',
    'await import(argv[x])',
    'await import(cfg.plugin)',
    'await import(argv.x.y)',
    'await import(this.argv.x)',
    'await import(argv.x + y)',
    'await import(fn(argv.x))',
    "require(path.join(base, 'x'))",
    "require(join(process.cwd(), 'x'))",
    "require(path.join(process.cwd(), 'a', name))",
    'require(path.join(process.cwd(), str))',
    'await import(str)',
    "require(path.join(process.cwd(), 'a'), x)",
    "require(path.join(process.cwd()) + 'x')",
    "require(path.resolve(process.cwd, 'x'))",
    "require(path.join(__filename, 'x'))",
    "require(path.relative(__dirname, 'x'))",
    "require(os.join(__dirname, 'x'))",
    "require(path.join(process.argv(), 'x'))",
    "require(path.join(__dirname, 'x',))",
    'require(path.join(__dirname, require(x)))',
  ])('%s is refused', (line) => {
    const result = rewriteSource(`import pc from 'picocolors';\n${line};\n`);
    expect(result.refused.map((r) => r.line)).toContain(2);
    expect(result.refused.every((r) => r.reason === 'non-literal-specifier' && r.specifier === '')).toBe(true);
    expect(result.dynamic).toEqual([]);
  });

  it('a computed import the file never closes is refused at its line', () => {
    expect(verdict("import pc from 'picocolors';\nawait import(argv.x\n")).toEqual({ refused: [2], dynamic: [] });
  });

  it('a literal specifier is still a literal: require("x") and import() are not computed', () => {
    const result = rewriteSource("import pc from 'picocolors';\nrequire('x');\nimport();\n");
    expect(result.refused).toEqual([]);
    expect(result.dynamic).toEqual([]);
  });
});
