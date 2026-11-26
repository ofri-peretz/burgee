/**
 * `burgee migrate` on the project around the files: which files it reads, what another
 * dependency installs, the release-age setting line by line, the pins it forces, the text a
 * person reads, and the refusals it throws. Each case names the one input that tells the
 * reading apart from a near miss.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { DirtyTreeError, exempted, familyVersions, INCUMBENTS, migrate, type MigrateOptions, type MigrationReport, releaseAgeOf, sourceFiles, textOf, UnknownIncumbentError, workingTree } from './migrate.js';

const scratch = scratchDirs();

function project(files: Record<string, string>): string {
  const dir = scratch('burgee-migrate-project-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const manifest = (dependencies: Record<string, string>, more: Record<string, unknown> = {}): string => JSON.stringify({ name: 'x', dependencies, ...more });
const run = async (dir: string, more: Partial<MigrateOptions> = {}): Promise<MigrationReport> => await migrate({ dir, status: () => undefined, registry: async () => undefined, since: {}, ...more });

describe('the files a run reads', () => {
  it('reads every source extension and skips every generated tree', () => {
    const skipped = ['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', '.output', '.cache', '.vercel'];
    const dir = project({ 'a.jsx': '', 'b.mts': '', 'c.cts': '', 'd.txt': '', 'keep/x.ts': '', ...Object.fromEntries(skipped.map((d) => [`${d}/x.ts`, ''])) });
    expect(sourceFiles(dir).sort()).toEqual(['a.jsx', 'b.mts', 'c.cts', 'keep/x.ts']);
  });

  it('lists a held incumbent’s files sorted, a bin read after the sources among them', async () => {
    const kept = "import type { NotAYargsType } from 'yargs';\n";
    const dir = project({ 'package.json': manifest({ yargs: '^18.0.0' }, { bin: { x: 'bin/cli' } }), 'z.ts': kept, 'bin/cli': kept });
    expect((await run(dir)).held).toEqual([{ from: 'yargs', files: ['bin/cli', 'z.ts'], because: 'kept' }]);
  });

  it('finds no guided site in a file that names no guided package', async () => {
    const dir = project({ 'package.json': manifest({ picocolors: '^1.0.0' }), 'a.ts': "import c from 'picocolors';\n" });
    expect((await run(dir, { dryRun: true })).guided).toEqual([]);
  });

  it('counts the files refused, not the refusals', async () => {
    const deep = "import help from 'commander/lib/help.js';\n";
    const dir = project({ 'package.json': manifest({ commander: '^15.0.0' }), 'a.ts': deep, 'b.ts': deep });
    expect((await run(dir, { dryRun: true })).summary).toMatch(/, 2 refused$/u);
  });
});

describe('what another dependency installs', () => {
  it('names the dependencies in order, and never an incumbent that moves too', async () => {
    const needs = JSON.stringify({ version: '1.0.0', dependencies: { picocolors: '^1.0.0' } });
    const dir = project({
      'package.json': manifest({ picocolors: '^1.0.0', chalk: '^6.0.0', 'b-dep': '1.0.0', 'a-dep': '1.0.0' }),
      'node_modules/b-dep/package.json': needs,
      'node_modules/a-dep/package.json': needs,
      'node_modules/chalk/package.json': JSON.stringify({ version: '6.0.0', dependencies: { picocolors: '^1.0.0' } }),
      'a.ts': "import c from 'picocolors';\nimport k from 'chalk';\n",
    });
    expect((await run(dir, { dryRun: true })).transitive).toEqual([{ from: 'picocolors', through: ['a-dep', 'b-dep'], exports: [] }]);
  });
});

describe('the pin style', () => {
  it('pins exactly when every runtime dependency is exact, an incumbent declared only for development included', async () => {
    const dir = project({ 'package.json': manifest({ other: '1.0.0' }, { devDependencies: { picocolors: '^1.0.0' } }), 'a.ts': "import c from 'picocolors';\n" });
    expect((await run(dir, { dryRun: true, versions: { roundel: '1.3.2' } })).next).toBe('npm install --save-exact roundel@1.3.2 && npm uninstall picocolors');
  });
});

describe('the report', () => {
  it('keeps its text out of a copy', async () => {
    const report = await run(project({ 'package.json': manifest({}) }));
    expect(Object.getOwnPropertySymbols({ ...report })).toEqual([]);
  });

  it('reads as the lines a person reads', async () => {
    const report = await run(project({ 'package.json': manifest({}) }), { dryRun: true });
    const text = textOf({
      ...report,
      detected: { declared: ['chalk', 'commander'], imported: [] },
      mapped: [{ from: 'chalk', to: 'roundel/chalk', imports: 1, files: 1 }],
      refused: [{ file: 'a.ts', line: 1, specifier: 'x', reason: 'unknown-export', names: ['A', 'B'] }],
      held: [{ from: 'yargs', because: 'kept', files: ['a.ts', 'b.ts'] }],
      undeclared: ['ora', 'x'],
    }).split('\n');
    expect(text).toContain('declared: chalk, commander');
    expect(text).toContain('imported: none');
    expect(text).toContain('  chalk -> roundel/chalk  1 import in 1 file');
    expect(text).toContain('  a.ts:1  x  unknown-export (A, B)');
    expect(text).toContain('held, rewritten in no file:');
    expect(text).toContain('  yargs  kept in a.ts, b.ts');
    expect(text).toContain('undeclared: ora, x  (imported but not in package.json, so left alone; --only names them)');
  });
});

describe('the family versions, run from source', () => {
  it('reads each manifest two directories up, and leaves out a package it finds none for', async () => {
    const root = project({ 'roundel/package.json': JSON.stringify({ version: '1.0.0' }), 'a/b/.keep': '' });
    const versions = await familyVersions(join(root, 'a', 'b'));
    expect(versions).toStrictEqual({ roundel: '1.0.0' });
  });
});

const ageIn = async (file: string, text: string): ReturnType<typeof releaseAgeOf> => await releaseAgeOf(project({ [file]: text }));

describe('the release-age setting', () => {
  it('reads the key only at the start of a line, spelled exactly, with digits first', async () => {
    expect(await ageIn('pnpm-workspace.yaml', '  minimumReleaseAge: 1440\n')).toBeNull();
    expect(await ageIn('pnpm-workspace.yaml', 'minimumReleaseAge: x1440\n')).toBeNull();
    expect(await ageIn('pnpm-workspace.yaml', 'minimumReleaseAgeX: 60\n')).toBeNull();
  });

  it('reads an npmrc with no dot, and only its exclusion lines', async () => {
    expect(await ageIn('npmrc', 'minimum-release-age=60\nminimum-release-age-exclude[]=roundel\nother=1\n')).toStrictEqual({
      file: 'npmrc',
      key: 'minimum-release-age',
      minutes: 60,
      exclude: ['roundel'],
    });
  });

  it('exempts nothing when the exclusion key is missing, whatever list sits elsewhere', async () => {
    expect((await ageIn('pnpm-workspace.yaml', '  - roundel\nminimumReleaseAge: 1440\n'))?.exclude).toEqual([]);
  });

  it('drops an empty entry from a flow list', async () => {
    expect((await ageIn('pnpm-workspace.yaml', 'minimumReleaseAge: 1\nminimumReleaseAgeExclude: [roundel, ]\n'))?.exclude).toEqual(['roundel']);
  });

  it('ends a block list at an empty item, and reads past an indented comment', async () => {
    expect((await ageIn('pnpm-workspace.yaml', 'minimumReleaseAge: 1\nminimumReleaseAgeExclude:\n  -\n  - roundel\n'))?.exclude).toEqual([]);
    expect((await ageIn('pnpm-workspace.yaml', 'minimumReleaseAge: 1\nminimumReleaseAgeExclude:\n  - a\n  # c\n  - b\n'))?.exclude).toEqual(['a', 'b']);
  });

  it('takes quotes off only a quoted entry: one character, an unquoted one, and an unclosed one stay', async () => {
    const text = `minimumReleaseAge: 1\nminimumReleaseAgeExclude:\n  - "\n  - aba\n  - "abc\n  - 'x' # c\n`;
    expect((await ageIn('pnpm-workspace.yaml', text))?.exclude).toEqual(['"', 'aba', '"abc', 'x']);
  });
});

describe('an exemption', () => {
  it('matches a glob only where every part fits, in order and without overlap', () => {
    expect(exempted('abba', ['ab*ba'])).toBe('*');
    expect(exempted('aba', ['ab*ba'])).toEqual(new Set());
    expect(exempted('abc', ['a*b*c'])).toBe('*');
    expect(exempted('axc', ['a*b*c'])).toEqual(new Set());
    expect(exempted('abc', ['a*bc*c'])).toEqual(new Set());
    expect(exempted('abc', ['a*b*b*c'])).toEqual(new Set());
  });

  it('reads a scoped name whole, and a version after the last @', () => {
    expect(exempted('@scope/pkg', ['@scope/pkg'])).toBe('*');
    expect(exempted('a', ['a@1'])).toEqual(new Set(['1']));
  });
});

const now = new Date('2026-10-18T12:00:00Z');
const ago = (minutes: number): string => new Date(now.getTime() - minutes * 60_000).toISOString();
const svgo = (): string =>
  project({
    'package.json': manifest({ picocolors: '^1.0.0' }),
    'pnpm-lock.yaml': '',
    'pnpm-workspace.yaml': 'minimumReleaseAge: 60\n',
    'a.ts': "import c from 'picocolors';\n",
  });

const pinned = async (graded: string, times: Record<string, string> | undefined): Promise<MigrationReport['releaseAge']> =>
  (await run(svgo(), { dryRun: true, now, versions: { roundel: graded }, registry: async () => times })).releaseAge;

describe('the pins a release age forces', () => {

  it('reads a major of two digits whole', async () => {
    const age = await pinned('10.2.0', { '1.0.0': ago(9000), '10.1.0': ago(3000), '10.2.0': ago(1) });
    expect(age?.pins).toMatchObject([{ version: '10.1.0' }]);
    const young = await pinned('10.2.0', { '10.2.0': ago(0) });
    expect(young?.note).toContain('no roundel 10.x is old enough until 2026-10-18 13:00 UTC');
  });

  it('reads a minor and a patch of two digits whole', async () => {
    expect((await pinned('1.10.12', { '1.10.11': ago(3000), '1.10.12': ago(1) }))?.pins).toMatchObject([{ version: '1.10.11' }]);
  });

  it('leaves out a release whose publish time does not parse', async () => {
    expect((await pinned('1.0.2', { '1.0.1': 'garbage', '1.0.0': ago(30), '1.0.2': ago(0) }))?.pins).toMatchObject([{ version: '1.0.0' }]);
  });

  it('counts a release old enough at the very minute it becomes so', async () => {
    expect((await pinned('1.0.2', { '1.0.0': ago(1440), '1.0.1': ago(60), '1.0.2': ago(0) }))?.pins).toMatchObject([{ version: '1.0.1' }]);
    expect((await pinned('1.0.0', { '1.0.0': ago(60) }))?.pins).toEqual([]);
  });

  it('says only that the registry was silent when it was', async () => {
    expect((await pinned('1.0.0', undefined))?.note).toBe(
      'pnpm-workspace.yaml sets minimumReleaseAge to 60 minutes; the registry did not say when roundel was published, so next pins the graded version, which may be younger than that',
    );
  });
});

describe('the refusals', () => {
  it('name themselves, and say what to do', () => {
    expect(new DirtyTreeError(['?? a']).name).toBe('DirtyTreeError');
    const unknown = new UnknownIncumbentError(['ora', 'x']);
    expect(unknown.name).toBe('UnknownIncumbentError');
    expect(unknown.message).toBe('burgee migrate does not migrate ora, x');
    expect(unknown.fix).toBe(`name incumbents by package, comma-separated: ${INCUMBENTS.join(', ')}`);
    expect(INCUMBENTS).toEqual([...INCUMBENTS].sort());
  });

  it('reads the tree’s entries without the empty line after the last', async () => {
    const dir = project({ 'a.ts': '' });
    spawnSync('git', ['init', '-q', dir]);
    expect(await workingTree(dir)).toEqual(['?? a.ts']);
  });
});
