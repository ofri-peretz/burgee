/**
 * migrate-pins-carry-the-drop-in — under a release age, `next` never pins a version that
 * predates the drop-in it rewrote to.
 *
 * The 2026-10-18 field trial, barrier 7: svgo@e4cb29be sets `minimumReleaseAge: 10080`.
 * `burgee@1.6.0 migrate` rewrote three `picocolors` imports to `roundel/picocolors` and printed
 * `pnpm add roundel@^1.0.4`, the newest roundel 1.x old enough. `roundel/picocolors` first
 * shipped in 1.1.0, so typecheck failed 3 × TS2307 and `svgo --help` threw
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * **The svgo case below was run against `migrate.ts` before this change and failed there**: it
 * pinned `^1.0.4` and its note named no date for 1.1.0.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { familyVersions, migrate, subpathFloors } from './migrate.js';

/**
 * Every project this file makes, handed after its last test to an `rm` of its own that the hook does
 * not wait for — under the pre-push load, unlinking a scratch directory from Node took 64.9 s
 * (#1137). Before this they were never removed: ~15k `burgee-migrate-*` a day in `$TMPDIR`.
 */
const scratch: string[] = [];
afterAll(() => {
  if (scratch.length > 0 && process.platform !== 'win32') spawn('rm', ['-rf', ...scratch], { detached: true, stdio: 'ignore' }).unref();
});

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'burgee-migrate-pins-'));
  scratch.push(dir);
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const clean = (): undefined => undefined;

/** Every published package of this repository at the version its own manifest declares. */
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

const now = new Date('2026-10-18T12:00:00Z');
const daysAgo = (days: number): string => new Date(now.getTime() - days * 86_400_000).toISOString();
const graded = manifests()['roundel'] as string;
const major = graded.split('.')[0] as string;
/** The release that first exported `./picocolors`, in the graded major: 1.1.0 on the day of the trial. */
const first = `${major}.1.0`;
const older = `${major}.0.4`;

/** svgo's shape: pnpm, a seven-day release age, `picocolors` imported, commander 11 left alone (off-major). */
const svgo = (age = 'minimumReleaseAge: 10080\n'): string =>
  project({
    'package.json': JSON.stringify({ name: 'svgo', dependencies: { picocolors: '^1.0.0', commander: '^11.1.0' } }),
    'pnpm-lock.yaml': '',
    'pnpm-workspace.yaml': age,
    'lib/svgo-node.js': "import colors from 'picocolors';\nexport const red = colors.red;\n",
  });

/** The `since` table the build writes, as it read roundel's tags on 2026-10-18. */
const since = { roundel: { '.': `${major}.0.0`, './chalk': `${major}.0.0`, './picocolors': first } };

/** roundel on the registry: the release without `./picocolors` a month old, the first with it `firstAge` days old, the graded one a day old. */
const registry =
  (firstAge: number) =>
  async (name: string): Promise<Record<string, string> | undefined> => {
    expect(name, 'only roundel is added for a picocolors migration').toBe('roundel');
    return { created: daysAgo(400), '0.6.2': daysAgo(60), [older]: daysAgo(30), [first]: daysAgo(firstAge), [graded]: daysAgo(1) };
  };

/** Every release a week or more old: the graded one too. */
const allOld = async (): Promise<Record<string, string>> => ({ [older]: daysAgo(30), [first]: daysAgo(20), [graded]: daysAgo(10) });
/** The graded release listed before the first that carries the subpath, neither old enough. */
const gradedListedFirst = async (): Promise<Record<string, string>> => ({ [graded]: daysAgo(1), [first]: daysAgo(6), [older]: daysAgo(30) });
/** No release below the first that carries the subpath. */
const firstOnward = async (): Promise<Record<string, string>> => ({ [first]: daysAgo(30), [graded]: daysAgo(1) });

describe('migrate-pins-carry-the-drop-in — the floor exports every subpath the rewrite imports', () => {
  it('the svgo shape: 1.0.4 is old enough and 1.1.0 is not, so next does not pin ^1.0.4 and names the day 1.1.0 installs', async () => {
    expect(graded, `the fixture needs roundel above ${first}; rewrite it on a major bump`).not.toBe(first);
    const report = await migrate({ dir: svgo(), status: clean, registry: registry(6), now, since });
    expect(report.next).toBe(`pnpm add roundel@^${first} && pnpm remove picocolors`);
    expect(report.next).not.toContain(`^${older}`);
    expect(report.releaseAge?.pins).toEqual([
      { name: 'roundel', version: first, graded, installable: '2026-10-19T12:00:00.000Z', requires: { specifiers: ['roundel/picocolors'], since: first } },
    ]);
    expect(report.releaseAge?.note).toBe(
      `pnpm-workspace.yaml sets minimumReleaseAge to 10080 minutes; no roundel ${major}.x that exports roundel/picocolors (first in ${first}) is old enough until 2026-10-19 12:00 UTC, when ${first} is: the install fails before then, or exempt roundel from the rule`,
    );
  });

  it('pins the first release that carries the subpath once it is old enough, and says why it is not older', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: registry(8), now, since });
    expect(report.next).toBe(`pnpm add roundel@^${first} && pnpm remove picocolors`);
    expect(report.releaseAge?.note).toContain(`roundel ${graded} is younger than that, so next pins ^${first}, the newest roundel ${major}.x that exports roundel/picocolors (first in ${first}) old enough`);
  });

  it('pins nothing below the graded release once the graded release is itself old enough', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: allOld, now, since });
    expect(report.next, 'the graded release is old enough, so nothing is pinned below it').toBe(`pnpm add roundel@^${graded} && pnpm remove picocolors`);
    expect(report.releaseAge?.pins).toEqual([]);
  });

  it('adds no `requires` when no release of the major was passed over', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: firstOnward, now, since });
    expect(report.releaseAge?.pins).toEqual([{ name: 'roundel', version: first, graded, installable: daysAgo(23) }]);
    expect(report.releaseAge?.note).not.toContain('exports');
  });

  it('floors a subpath the table does not name at the graded version: nothing older is known to carry it', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: registry(8), now, since: { roundel: { '.': `${major}.0.0` } } });
    expect(report.next).toBe(`pnpm add roundel@^${graded} && pnpm remove picocolors`);
    expect(report.releaseAge?.pins).toEqual([{ name: 'roundel', version: graded, graded, installable: '2026-10-24T12:00:00.000Z', requires: { specifiers: ['roundel/picocolors'], since: graded } }]);
  });

  it('has no floor for a package the table does not name, which is what it printed before', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: registry(6), now, since: {} });
    expect(report.next).toBe(`pnpm add roundel@^${older} && pnpm remove picocolors`);
  });

  it('takes the highest floor of every specifier one package is imported by', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { picocolors: '^1.0.0', chalk: '^6.0.0' } }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n',
      'src/a.ts': "import colors from 'picocolors';\nimport chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean, registry: registry(8), now, since });
    expect(report.next).toBe(`pnpm add roundel@^${first} && pnpm remove chalk picocolors`);
    expect(report.releaseAge?.pins[0]?.requires).toEqual({ specifiers: ['roundel/picocolors'], since: first });
  });

  it('lists every specifier that sets an equal floor', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { picocolors: '^1.0.0', chalk: '^6.0.0' } }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n',
      'src/a.ts': "import colors from 'picocolors';\nimport chalk from 'chalk';\n",
    });
    const report = await migrate({ dir, status: clean, registry: registry(8), now, since: { roundel: { './chalk': first, './picocolors': first } } });
    expect(report.releaseAge?.pins[0]?.requires).toEqual({ specifiers: ['roundel/chalk', 'roundel/picocolors'], since: first });
    expect(report.releaseAge?.note).toContain(`that exports roundel/chalk, roundel/picocolors (first in ${first})`);
  });

  it('names only the specifier that sets the floor when a lower one follows it', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'x', dependencies: { picocolors: '^1.0.0', chalk: '^6.0.0' } }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n',
      'src/a.ts': "import colors from 'picocolors';\nimport chalk from 'chalk';\n",
    });
    // `roundel/chalk` sorts first and sets the higher floor; `roundel/picocolors` floors lower.
    const report = await migrate({ dir, status: clean, registry: registry(8), now, since: { roundel: { './chalk': first, './picocolors': `${major}.0.0` } } });
    expect(report.releaseAge?.pins[0]?.requires).toEqual({ specifiers: ['roundel/chalk'], since: first });
  });

  it('counts a release exactly the age old as installable now', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: registry(7), now, since });
    expect(report.next).toBe(`pnpm add roundel@^${first} && pnpm remove picocolors`);
    expect(report.releaseAge?.note).toContain(`so next pins ^${first}, the newest roundel ${major}.x that exports roundel/picocolors (first in ${first}) old enough`);
  });

  it('with nothing old enough, waits for the release that becomes installable first, whatever order the registry lists them in', async () => {
    const report = await migrate({ dir: svgo(), status: clean, registry: gradedListedFirst, now, since });
    expect(report.releaseAge?.pins[0]).toMatchObject({ version: first, installable: '2026-10-19T12:00:00.000Z' });
  });

  it('leaves a peer that is not a family package out of the release-age pins', async () => {
    const asked: string[] = [];
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { ink: '^8.0.0' } }), 'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n', 'src/a.tsx': "import { render } from 'ink';\n" });
    const report = await migrate({ dir, status: clean, registry: async (name) => (asked.push(name), undefined), now, since: {} });
    expect(asked).toEqual(['controlroom']);
    expect(report.next).toContain(' react-reconciler ');
  });

  it('reads no table and asks no registry when the project sets no release age', async () => {
    const asked: string[] = [];
    const report = await migrate({ dir: svgo('packages:\n  - .\n'), status: clean, registry: async (name) => (asked.push(name), undefined), now, since });
    expect(asked).toEqual([]);
    expect(report.next).toBe(`pnpm add roundel@^${graded} && pnpm remove picocolors`);
  });
});

describe('migrate-pins-carry-the-drop-in — the table ships beside the module', () => {
  it('reads `versions` and `since` from the file the build writes, and the flat file before it', async () => {
    const built = project({ 'dist/family-versions.json': JSON.stringify({ versions: { roundel: '9.9.9' }, since: { roundel: { './picocolors': '9.1.0' } } }) });
    expect(await familyVersions(join(built, 'dist'))).toEqual({ roundel: '9.9.9' });
    expect(await subpathFloors(join(built, 'dist'))).toEqual({ roundel: { './picocolors': '9.1.0' } });
    const flat = project({ 'dist/family-versions.json': JSON.stringify({ roundel: '9.9.9' }) });
    expect(await familyVersions(join(flat, 'dist'))).toEqual({ roundel: '9.9.9' });
    expect(await subpathFloors(join(flat, 'dist')), 'a flat file has no floors').toEqual({});
    expect(await subpathFloors(join(built, 'nowhere')), 'nothing to read is no floors, not a crash').toEqual({});
  });

  it('has no floors from source, where no build has read the tags', async () => {
    expect(await subpathFloors()).toEqual({});
  });
});

/**
 * B-20261027-migrate-pins-match-exact-convention — `next` writes the family packages it adds in
 * the project's own convention. On open-cli-tools/concurrently, whose six runtime dependencies are
 * all exact, `burgee@1.7.2 migrate` printed `pnpm add burgee@^1.7.2`, and the one caret in the
 * manifest was the reviewer's first question. Every case below that expects no caret was red on
 * the code before it: that printed `^` whatever the manifest said.
 */
describe('B-20261027-migrate-pins-match-exact-convention — next pins in the project’s convention', () => {
  const burgee = manifests()['burgee'] as string;
  const roundel = manifests()['roundel'] as string;
  const yargsProgram = "import yargs from 'yargs';\nimport { hideBin } from 'yargs/helpers';\nyargs(hideBin(process.argv)).parseSync();\n";

  it('the concurrently shape: every runtime dependency exact, so the pin is exact, saved exact', async () => {
    const dependencies = { chalk: '5.6.2', rxjs: '7.8.2', 'shell-quote': '1.12.0', 'supports-color': '10.2.2', 'tree-kill': '1.2.2', yargs: '18.0.0' };
    const dir = project({ 'package.json': JSON.stringify({ name: 'concurrently', dependencies, devDependencies: { vitest: '^4.0.0' } }), 'pnpm-lock.yaml': '', 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`pnpm add --save-exact burgee@${burgee} && pnpm remove yargs`);
  });

  it.each([
    ['package-lock.json', 'npm install --save-exact', 'npm uninstall'],
    ['yarn.lock', 'yarn add --exact', 'yarn remove'],
    ['bun.lock', 'bun add --exact', 'bun remove'],
  ])('with %s, the installer’s own flag: without it the installer writes its default caret', async (lock, add, remove) => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { yargs: '18.0.0', 'tree-kill': '1.2.2' } }), [lock]: '', 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`${add} burgee@${burgee} && ${remove} yargs`);
  });

  it('pins exactly when the incumbent it moves is exact, though another runtime dependency is a range', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { yargs: '18.0.0', rxjs: '^7.8.2' } }), 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install --save-exact burgee@${burgee} && npm uninstall yargs`);
  });

  it('keeps the tilde of an incumbent written with one', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { yargs: '~18.0.0', rxjs: '7.8.2', other: '>=1' } }), 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install burgee@~${burgee} && npm uninstall yargs`);
  });

  it('reads an exact incumbent in devDependencies as the convention when there are no runtime dependencies', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', devDependencies: { chalk: '6.0.0' } }), 'scripts/a.ts': "import chalk from 'chalk';\n" });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install --save-exact roundel@${roundel} && npm uninstall chalk`);
  });

  it('counts a prerelease written exactly as exact', async () => {
    // The incumbent is a caret in devDependencies, so only the runtime rule can make this exact.
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies: { next: '15.0.0-canary.3', rxjs: '7.8.2' }, devDependencies: { yargs: '^18.0.0' } }), 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install --save-exact burgee@${burgee} && npm uninstall yargs`);
  });

  it('reads no convention from a manifest with no runtime dependencies: the incumbent’s caret stands', async () => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', devDependencies: { yargs: '^18.0.0' } }), 'bin/index.ts': yargsProgram });
    expect((await migrate({ dir, status: clean })).next).toBe(`npm install burgee@^${burgee} && npm uninstall yargs`);
  });

  it.each([
    ['incumbents written two ways', { chalk: '6.0.0', yargs: '^18.0.0', rxjs: '^7.8.2' }],
    ['an incumbent written as a range of its own', { yargs: '>=18', chalk: '>=6' }],
    ['an incumbent written as a tag', { yargs: 'latest', chalk: '*' }],
    ['a range around a version that is not exact', { yargs: '^18.0', chalk: '~6' }],
  ])('keeps the caret for %s', async (_, dependencies) => {
    const dir = project({ 'package.json': JSON.stringify({ name: 'x', dependencies }), 'bin/index.ts': `${yargsProgram}import chalk from 'chalk';\n` });
    const { next } = await migrate({ dir, status: clean });
    expect(next).toMatch(/^npm install (?:\S+@\^\S+ ?)+ && npm uninstall/);
    expect(next).not.toContain('--save-exact');
  });

  it('writes the release-age note in the same style as the pin', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'svgo', dependencies: { picocolors: '1.1.1' } }),
      'pnpm-lock.yaml': '',
      'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n',
      'lib/svgo-node.js': "import colors from 'picocolors';\nexport const red = colors.red;\n",
    });
    const report = await migrate({ dir, status: clean, registry: registry(8), now, since });
    expect(report.next).toBe(`pnpm add --save-exact roundel@${first} && pnpm remove picocolors`);
    expect(report.releaseAge?.note).toContain(`so next pins ${first}, the newest`);
  });
});
