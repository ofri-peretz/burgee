/**
 * The U12 findings (D-20261008-migrate-u12-findings): what a measure-only trial of
 * `burgee migrate` on two real CLIs — apify/mcpc@bc6d9e8 and guhcostan/mac-cleaner-cli@725f5e7 —
 * found wrong, one `describe` per finding.
 *
 * **Every case here was run against the code before its fix and failed there**; the decision
 * records how each one failed. The fixtures are the trial's shapes cut down to the line that
 * mattered, not the projects themselves.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ExitCode } from './exit-code.js';
import { familyVersions, migrate, type MigrationReport, rewriteSource, scan, textOf, UnknownIncumbentError } from './migrate.js';

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-u12-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const manifest = (dependencies: Record<string, string>, more: Record<string, unknown> = {}): string => JSON.stringify({ name: 'x', dependencies, ...more });
const clean = (): undefined => undefined;
const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');

/** Every published package of this repository at the version its own manifest declares — what `next` must pin to. */
function manifests(): Record<string, string> {
  const packages = fileURLToPath(new URL('../../', import.meta.url));
  const out: Record<string, string> = {};
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const pkg = JSON.parse(readFileSync(join(packages, entry.name, 'package.json'), 'utf8')) as { name: string; version: string; private?: boolean };
      if (pkg.private !== true) out[pkg.name] = pkg.version;
    } catch {
      // a directory without a manifest is not a package
    }
  }
  return out;
}

describe('U12-1 — a mock of an incumbent moves with the import it mocks', () => {
  // mcpc: five `vi.mock('chalk', …)` calls stayed on chalk while the source moved to
  // roundel/chalk, so the mocks mocked a module nothing imported and 51 of 1261 tests failed.
  it.each([
    "vi.mock('chalk', () => ({ default: { red: (s: string) => s } }));",
    "vi.doMock('chalk');",
    "vi.unmock('chalk');",
    "vi.doUnmock('chalk');",
    "const real = await vi.importActual('chalk');",
    "const fake = await vi.importMock('chalk');",
    "jest.mock('chalk');",
    "jest.doMock('chalk', () => ({}));",
    "jest.unmock('chalk');",
    "const real = jest.requireActual('chalk');",
    "const fake = jest.requireMock('chalk');",
    "jest.unstable_mockModule('chalk', () => ({}));",
    "const where = require.resolve('chalk');",
  ])('rewrites the specifier of %j', (line) => {
    expect(rewriteSource(`${line}\n`).source).toBe(`${line.replace("'chalk'", "'roundel/chalk'")}\n`);
  });

  it('reads through type arguments: vi.importActual<typeof import(…)>(…)', () => {
    const source = "const actual = await vi.importActual<typeof import('chalk')>('chalk');\n";
    expect(rewriteSource(source).source).toBe("const actual = await vi.importActual<typeof import('roundel/chalk')>('roundel/chalk');\n");
  });

  it('reads through type arguments that hold an arrow type', () => {
    const source = "const m = await vi.importActual<{ f: () => void }>('chalk');\n";
    expect(rewriteSource(source).source).toBe("const m = await vi.importActual<{ f: () => void }>('roundel/chalk');\n");
  });

  it.each([
    "foo.mock('chalk');",
    "vi.fn('chalk');",
    "vi.mock.calls('chalk');",
    "vi.mock(name, 'chalk');",
    "const x = vi.mock < 'chalk';",
    "obj.vi.mock('chalk');",
  ])('leaves %j alone — not a module position', (line) => {
    expect(rewriteSource(`${line}\n`)).toMatchObject({ source: `${line}\n`, mapped: [] });
  });

  it('does not refuse a mock whose specifier is not a literal', () => {
    expect(rewriteSource("import chalk from 'chalk';\nvi.mock(path);\n")).toMatchObject({ source: "import chalk from 'roundel/chalk';\nvi.mock(path);\n", refused: [] });
  });

  it('treats a mock of a deep path like a deep import', () => {
    expect(rewriteSource("vi.mock('commander/lib/help.js');\n").refused).toEqual([{ line: 1, specifier: 'commander/lib/help.js', reason: 'deep-import' }]);
  });

  it('holds a jest.requireActual of a function-shaped incumbent to the require() rule', () => {
    // A requireActual returns what require() returns, so it is checked the way require() is.
    expect(scan("jest.requireActual('cross-spawn');\n").sites[0]).toMatchObject({ specifier: 'cross-spawn', require: true });
    expect(scan("require.resolve('cross-spawn');\n").sites[0]).not.toHaveProperty('require');
  });

  it('migrates the mcpc shape: the source and its test move together', async () => {
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0' }),
      'src/out.ts': "import chalk from 'chalk';\nexport const red = (s: string) => chalk.red(s);\n",
      'test/out.test.ts': "import { vi } from 'vitest';\nvi.mock('chalk', () => ({ default: { red: (s: string) => s } }));\nimport { red } from '../src/out';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'test/out.test.ts')).toContain("vi.mock('roundel/chalk', ");
    expect(read(dir, 'src/out.ts')).toContain("from 'roundel/chalk'");
    expect(report.mapped).toEqual([{ from: 'chalk', to: 'roundel/chalk', imports: 2, files: 2 }]);
  });
});

describe('U12-2 — the install command pins each family package to the version that carries the graded drop-in', () => {
  // mac-cleaner under pnpm's minimumReleaseAge: an unpinned `pnpm add burgee flagstaff roundel`
  // saved roundel ^0.6.2, flagstaff 1.0.3 and burgee 0.15.0 — none of them the graded versions.
  it('prints name@^version for every family package, read from this repository’s manifests', async () => {
    const versions = manifests();
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0', ora: '^9.0.0', commander: '^15.0.0' }),
      'pnpm-lock.yaml': '',
      'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\nimport { Command } from 'commander';\n",
    });
    const report = await migrate({ dir, status: clean });
    const pinned = ['burgee', 'flagstaff', 'roundel'].map((name) => `${name}@^${versions[name] as string}`).join(' ');
    expect(report.next).toBe(`pnpm add ${pinned} && pnpm remove commander chalk ora`);
    expect(report.dependencies.add, '`add` stays the package names; the pin is in `next`').toEqual(['burgee', 'flagstaff', 'roundel']);
  });

  it('leaves a peer that is not a family package unpinned', async () => {
    const dir = project({ 'package.json': manifest({ ink: '^8.0.0' }), 'src/a.tsx': "import { render } from 'ink';\n" });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install controlroom@^${manifests()['controlroom'] as string} react-reconciler && npm uninstall ink`);
  });

  it('reads the versions from the manifests beside the module, or from the copy the build wrote', async () => {
    // From source the manifests are two directories up; the published package has no such
    // directory, so the build writes `family-versions.json` beside the module.
    expect(await familyVersions()).toEqual(manifests());
    const built = project({ 'dist/family-versions.json': JSON.stringify({ roundel: '9.9.9' }) });
    expect(await familyVersions(join(built, 'dist'))).toEqual({ roundel: '9.9.9' });
    expect(await familyVersions(join(built, 'nowhere/at/all')), 'nothing to read is no pins, not a crash').toEqual({});
  });

  it.each([
    ['pnpm-workspace.yaml', 'packages:\n  - .\n# minimumReleaseAge: 5\nminimumReleaseAge: 1440\n', 1440],
    ['.npmrc', '; a comment\nminimum-release-age=4320\n', 4320],
    ['npmrc', 'minimum-release-age = 60\n', 60],
  ])('says so when %s sets a minimum release age', async (file, body, minutes) => {
    const dir = project({ 'package.json': manifest({ chalk: '^6.0.0' }), [file]: body, 'src/a.ts': "import chalk from 'chalk';\n" });
    const report = await migrate({ dir, status: clean });
    expect(report.releaseAge).toMatchObject({ file, minutes });
    expect(report.releaseAge?.note).toContain('younger');
  });

  it('reports no release age where nothing sets one', async () => {
    const dir = project({ 'package.json': manifest({ chalk: '^6.0.0' }), '.npmrc': 'save-exact=true\n', 'pnpm-workspace.yaml': 'packages:\n  - .\n', 'src/a.ts': "import chalk from 'chalk';\n" });
    expect((await migrate({ dir, status: clean })).releaseAge).toBeNull();
  });
});

describe('U12-3 — the project chooses what moves, and an undeclared incumbent never does', () => {
  // mac-cleaner never declared @inquirer/core — it arrives through @inquirer/checkbox and
  // @inquirer/confirm — and migrate rewrote it and added caique to the install line.
  it('rewrites only incumbents the project declares, and lists the rest as undeclared', async () => {
    const source = "import { createPrompt } from '@inquirer/core';\n";
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0', '@inquirer/confirm': '^5.0.0' }),
      'src/prompt.ts': source,
      'src/a.ts': "import chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/prompt.ts')).toBe(source);
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'roundel/chalk';\n");
    expect(report.undeclared).toEqual(['@inquirer/core']);
    expect(report.dependencies.add).toEqual(['roundel']);
    expect(report.detected.imported).toEqual(['@inquirer/core', 'chalk']);
  });

  it('counts optionalDependencies and peerDependencies as declared', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', optionalDependencies: { chalk: '^6.0.0' }, peerDependencies: { ora: '^9.0.0' } }),
      'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\n",
    });
    expect(await migrate({ dir, status: clean })).toMatchObject({ undeclared: [], detected: { declared: ['chalk', 'ora'] } });
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'roundel/chalk';\nimport ora from 'flagstaff/ora';\n");
  });

  it('--only rewrites the named incumbents and no other', async () => {
    const dir = project({ 'package.json': manifest({ chalk: '^6.0.0', ora: '^9.0.0' }), 'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\n" });
    const report = await migrate({ dir, status: clean, only: ['ora'] });
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'chalk';\nimport ora from 'flagstaff/ora';\n");
    expect(report.dependencies).toMatchObject({ removable: ['ora'], add: ['flagstaff'] });
  });

  it('--only can name an undeclared incumbent, because naming it is the declaration', async () => {
    const dir = project({ 'package.json': manifest({}), 'src/a.ts': "import chalk from 'chalk';\n" });
    const report = await migrate({ dir, status: clean, only: ['chalk'] });
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'roundel/chalk';\n");
    expect(report.undeclared).toEqual([]);
  });

  it('--skip leaves the named incumbents alone and out of the removable list', async () => {
    const dir = project({ 'package.json': manifest({ chalk: '^6.0.0', ora: '^9.0.0' }), 'src/a.ts': "import chalk from 'chalk';\nimport ora from 'ora';\n" });
    const report = await migrate({ dir, status: clean, skip: ['chalk'] });
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'chalk';\nimport ora from 'flagstaff/ora';\n");
    expect(report.dependencies.removable).toEqual(['ora']);
  });

  it('refuses a name it does not migrate, as a usage error that lists the ones it does', async () => {
    const dir = project({ 'package.json': manifest({}) });
    const error = await migrate({ dir, status: clean, only: ['chalk', 'kleur'] }).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnknownIncumbentError);
    expect((error as Error).message).toBe('burgee migrate does not migrate kleur');
    expect((error as { fix: string }).fix).toContain('@inquirer/core');
    expect((error as { constructor: Record<symbol, unknown> }).constructor[Symbol.for('burgee.exitCode')]).toBe(ExitCode.USAGE);
    await expect(migrate({ dir, status: clean, skip: ['yargs/helpers'] })).rejects.toThrow('does not migrate yargs/helpers');
  });
});

describe('U12-4 — an incumbent moves in every file or in none', () => {
  // mac-cleaner: one file's @inquirer/core import was refused (usePagination) and the others
  // moved, so caique's ExitPromptError was not the class @inquirer/confirm threw, and Ctrl+C
  // printed an error where it used to exit 0.
  it('does not rewrite an incumbent anywhere once one of its imports is refused, and says why', async () => {
    const clean1 = "import { createPrompt } from '@inquirer/core';\n";
    const dir = project({
      'package.json': manifest({ '@inquirer/core': '^12.0.0', chalk: '^6.0.0' }),
      'src/page.ts': "import { usePagination } from '@inquirer/core';\n",
      'src/prompt.ts': clean1,
      'src/a.ts': "import chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/prompt.ts'), 'a clean file of a held incumbent stays on it').toBe(clean1);
    expect(read(dir, 'src/a.ts')).toBe("import chalk from 'roundel/chalk';\n");
    expect(report.held).toEqual([{ from: '@inquirer/core', files: ['src/page.ts'], because: 'refused' }]);
    expect(report.dependencies).toMatchObject({ removable: ['chalk'], add: ['roundel'] });
    expect(report.exitCode).toBe(ExitCode.RUNTIME);
  });

  it('holds every incumbent a refused file imports, since that file is left whole', async () => {
    const dir = project({
      'package.json': manifest({ commander: '^15.0.0', chalk: '^6.0.0' }),
      'src/legacy.ts': "import 'commander/lib/help.js';\nimport chalk from 'chalk';\n",
      'src/cli.ts': "import { Command } from 'commander';\nimport chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/cli.ts')).toBe("import { Command } from 'commander';\nimport chalk from 'chalk';\n");
    expect(report.held.map((h) => h.from)).toEqual(['chalk', 'commander']);
    expect(report).toMatchObject({ files: 0, next: '' });
  });

  it('holds an incumbent a kept type-only import still names', async () => {
    const dir = project({
      'package.json': manifest({ yargs: '^18.0.0' }),
      'src/a.ts': "import type { NotAYargsType } from 'yargs';\n",
      'src/b.ts': "import yargs from 'yargs';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/b.ts')).toBe("import yargs from 'yargs';\n");
    expect(report.held).toEqual([{ from: 'yargs', files: ['src/a.ts'], because: 'kept' }]);
    expect(report.exitCode, 'nothing was refused: the incumbent stays, and that is a whole answer').toBe(ExitCode.OK);
  });

  /** A declared dependency of the project's own that depends on `@inquirer/core`, as @inquirer/confirm does. */
  const confirm = { 'node_modules/@inquirer/confirm/package.json': JSON.stringify({ name: '@inquirer/confirm', version: '5.1.0', dependencies: { '@inquirer/core': '^12.0.0' } }) };
  const ERRORS = ['AbortPromptError', 'CancelPromptError', 'ExitPromptError', 'HookError', 'ValidationError'];

  it('reports an incumbent another dependency still installs, and the classes that would split', async () => {
    const dir = project({
      'package.json': manifest({ '@inquirer/core': '^12.0.0', '@inquirer/confirm': '^5.0.0' }),
      ...confirm,
      'src/prompt.ts': "import { createPrompt } from '@inquirer/core';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(report.transitive).toEqual([{ from: '@inquirer/core', through: ['@inquirer/confirm'], exports: ERRORS }]);
    expect(read(dir, 'src/prompt.ts'), 'no class crosses this import, so it moves').toBe("import { createPrompt } from 'caique/inquirer';\n");
  });

  it.each([
    ['names an error class', "import { createPrompt, ExitPromptError } from '@inquirer/core';\n", ['ExitPromptError']],
    ['cannot be read for names', "import * as core from '@inquirer/core';\n", ERRORS],
    ['is a require()', "const core = require('@inquirer/core');\n", ERRORS],
  ])('keeps an import that %s on the incumbent, and so holds it everywhere', async (_what, source, names) => {
    const dir = project({
      'package.json': manifest({ '@inquirer/core': '^12.0.0', '@inquirer/confirm': '^5.0.0' }),
      ...confirm,
      'src/catch.ts': source,
      'src/prompt.ts': "import { createPrompt } from '@inquirer/core';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(read(dir, 'src/catch.ts')).toBe(source);
    expect(read(dir, 'src/prompt.ts')).toBe("import { createPrompt } from '@inquirer/core';\n");
    expect(report.kept).toMatchObject([{ file: 'src/catch.ts', specifier: '@inquirer/core', names }]);
    expect(report.kept[0]?.note).toContain('@inquirer/confirm');
    expect(report.held).toEqual([{ from: '@inquirer/core', files: ['src/catch.ts'], because: 'kept' }]);
  });

  it('lets a type-only import of an error class move: a type is not a class at run time', async () => {
    const dir = project({
      'package.json': manifest({ '@inquirer/core': '^12.0.0', '@inquirer/confirm': '^5.0.0' }),
      ...confirm,
      'src/a.ts': "import type { ExitPromptError } from '@inquirer/core';\n",
    });
    await migrate({ dir, status: clean });
    expect(read(dir, 'src/a.ts')).toBe("import type { ExitPromptError } from 'caique/inquirer';\n");
  });
});

describe('U12-5 — the report says what happened in words', () => {
  it('names a partial run as partial, with the counts', async () => {
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0', commander: '^15.0.0' }),
      'src/a.ts': "import chalk from 'chalk';\n",
      'src/b.ts': "import 'commander/lib/help.js';\n",
    });
    expect((await migrate({ dir, status: clean })).summary).toBe('partial: 1 file rewritten, 1 refused');
  });

  it.each([
    [{ 'src/a.ts': "import chalk from 'chalk';\n", 'src/b.ts': "import chalk from 'chalk';\n" }, false, 'complete: 2 files rewritten'],
    [{ 'src/a.ts': "import chalk from 'chalk';\n" }, true, 'complete: 1 file would be rewritten'],
    [{ 'src/a.ts': 'export {};\n' }, false, 'nothing to rewrite'],
  ])('summarises %j', async (files, dryRun, summary) => {
    const dir = project({ 'package.json': manifest({ chalk: '^6.0.0' }), ...files });
    expect((await migrate({ dir, status: clean, dryRun })).summary).toBe(summary);
  });

  it('renders the human report as text, with no JSON in it', async () => {
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0', commander: '^15.0.0', '@inquirer/confirm': '^5.0.0' }),
      '.npmrc': 'minimum-release-age=1440\n',
      'src/a.ts': "import chalk from 'chalk';\nimport { createPrompt } from '@inquirer/core';\n",
      'src/b.ts': "import 'commander/lib/help.js';\n",
      'src/c.ts': "import { Command } from 'commander';\nimport type { NotACommanderType } from 'commander';\n",
    });
    const report = await migrate({ dir, status: clean, dryRun: true });
    const text = (report as unknown as Record<symbol, () => string>)[Symbol.for('burgee.text')]?.();
    expect(text).toBeDefined();
    expect(text, 'no field prints as raw JSON').not.toMatch(/[[{]"/);
    expect(text?.split('\n')[0]).toBe('partial: 1 file would be rewritten, 1 refused');
    expect(text).toContain('src/b.ts:1  commander/lib/help.js  deep-import');
    expect(text).toContain('chalk -> roundel/chalk');
    expect(text).toContain('undeclared: @inquirer/core');
    expect(text).toContain('.npmrc');
    expect(JSON.parse(JSON.stringify(report)), 'the text is not part of the data').not.toHaveProperty('text');
  });

  it('renders every section a report can carry', () => {
    const report: MigrationReport = {
      summary: 'partial: 1 file rewritten, 2 refused',
      files: 1,
      imports: 2,
      mapped: [{ from: 'chalk', to: 'roundel/chalk', imports: 2, files: 1 }],
      refused: [
        { file: 'a.ts', line: 2, specifier: '', reason: 'non-literal-specifier' },
        { file: 'b.ts', line: 3, specifier: '@clack/core', reason: 'sibling-state', fix: 'do the thing' },
        { file: 'b.ts', line: 4, specifier: '@inquirer/core', reason: 'unknown-export', names: ['usePagination'] },
      ],
      kept: [{ file: 'c.ts', line: 4, specifier: 'yargs', names: ['X'], note: 'a note' }],
      detected: { declared: [], imported: [] },
      dependencies: { before: [], removable: [], after: 0, add: [] },
      graded: [],
      partial: [{ from: 'dotenv', to: 'seniority/dotenv', reference: 141, passed: 106, rate: 0.75, control: 141 }],
      offMajor: [{ from: 'chalk', found: '4.1.2', graded: '6.0.1' }],
      guided: [{ file: 'ui.js', line: 5, from: 'blessed', pattern: 'screen', guide: 'Screen' }],
      undeclared: [],
      held: [],
      transitive: [
        { from: 'chalk', through: ['ora'], exports: [] },
        { from: '@inquirer/core', through: ['@inquirer/confirm', '@inquirer/select'], exports: ['ExitPromptError', 'HookError'] },
      ],
      releaseAge: null,
      next: '',
      dryRun: false,
      changed: true,
      exitCode: ExitCode.RUNTIME,
    };
    expect(textOf(report)).toBe(
      [
        'partial: 1 file rewritten, 2 refused',
        'rewrote:',
        '  chalk -> roundel/chalk  2 imports in 1 file',
        'refused, and left exactly as it was:',
        '  a.ts:2  <not a literal>  non-literal-specifier',
        '  b.ts:3  @clack/core  sibling-state; fix: do the thing',
        '  b.ts:4  @inquirer/core  unknown-export (usePagination)',
        'kept on the incumbent:',
        '  c.ts:4  yargs  a note',
        'still installed by another dependency:',
        '  chalk through ora',
        '  @inquirer/core through @inquirer/confirm, @inquirer/select; its ExitPromptError, HookError would be different classes, so imports of them stay',
        'not level yet, left alone:',
        '  dotenv -> seniority/dotenv  106 / 141 (the incumbent passes 141)',
        'on a major that was not graded, left alone:',
        '  chalk 4.1.2 (graded 6.0.1)',
        'no drop-in; see the guide:',
        '  ui.js:5  blessed  screen  Screen',
        'declared: none',
        'imported: none',
        'add: none',
        'removable: none',
      ].join('\n'),
    );
  });
});

describe('U12 — the edges the cases above do not reach', () => {
  it('reads nested type arguments to their close', () => {
    const source = "const m = await vi.importActual<Map<string, typeof import('chalk')>>('chalk');\n";
    expect(rewriteSource(source).source).toBe("const m = await vi.importActual<Map<string, typeof import('roundel/chalk')>>('roundel/chalk');\n");
  });

  it('reads a release age only from its own key, with a number', async () => {
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0' }),
      'pnpm-workspace.yaml': 'minimumReleaseAgeExclude:\n  - roundel\nminimumReleaseAge: soon\n',
      'src/a.ts': "import chalk from 'chalk';\n",
    });
    expect((await migrate({ dir, status: clean })).releaseAge).toBeNull();
  });

  it('names an incumbent another dependency installs even when it has no class to split', async () => {
    const dir = project({
      'package.json': manifest({ chalk: '^6.0.0', ink: '^6.0.0' }),
      'node_modules/ink/package.json': JSON.stringify({ name: 'ink', version: '6.0.0', dependencies: { chalk: '^5.0.0' } }),
      'src/a.ts': "import chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean });
    expect(report.transitive).toEqual([{ from: 'chalk', through: ['ink'], exports: [] }]);
    expect(read(dir, 'src/a.ts'), 'chalk exports no class, so nothing it exports can split').toBe("import chalk from 'roundel/chalk';\n");
  });

  it('leaves a file that names no incumbent out of the second pass', async () => {
    const dir = project({
      'package.json': manifest({ commander: '^15.0.0' }),
      'src/a.ts': "import 'commander/lib/help.js';\n",
      'src/b.ts': "export const name = 'commander';\n",
    });
    expect(await migrate({ dir, status: clean })).toMatchObject({ files: 0, held: [{ from: 'commander' }] });
    expect(read(dir, 'src/b.ts')).toBe("export const name = 'commander';\n");
  });
});
