/**
 * migrate-preflight — what the move costs, read before anything is written (`.sdlc/intents/migrate-preflight/`).
 *
 * The fixtures are field-trial projects (`.sdlc/research/adoption-barriers-2026-10.md`, Part A) cut
 * down to the lines that decide each row, at the pinned SHAs: wait-port `16083537`, svgo
 * `e4cb29be`, tsc-alias `1077308b`, @swc/cli `2cbd4700`. **Every case here failed on `main` at
 * `e91f842423`** first, where the module did not exist and the report had no `preflight`; the PR
 * records each failure line.
 *
 * The module is imported lazily, so on the code before the change each case fails on its own
 * line rather than the whole file failing at its import.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { ExitCode } from './exit-code.js';
import { HOSTS, MAPPING, migrate, type MigrateOptions } from './migrate.js';

const scratch = scratchDirs();
const preflight = async (): Promise<typeof import('./migrate-preflight.js')> => await import('./migrate-preflight.js');

function project(files: Record<string, string>): string {
  const dir = scratch('burgee-migrate-preflight-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
}

const read = (dir: string, file: string): string => readFileSync(join(dir, file), 'utf8');
/** No registry and no release age: nothing here reaches the network. */
const run = async (dir: string, more: Partial<MigrateOptions> = {}): ReturnType<typeof migrate> => await migrate({ dir, status: () => undefined, registry: async () => undefined, since: {}, ...more });

const RAISE = 'npm pkg set "engines.node=^20.19.0 || >=22.13.0"';
const FAMILY = 'bellpull|burgee|caique|closeout|controlroom|flagstaff|linegauge|paratext|roundel|seniority';
const JEST_FIX = `set jest's transformIgnorePatterns to "node_modules/(?!(${FAMILY})/)", or run jest under node --experimental-vm-modules, then re-run burgee migrate`;
const FLOOR_MESSAGE = "the family needs Node ^20.19.0 || >=22.13.0; adopting raises this package's floor, a semver-major for it";

const requireEsm = (range: string, lowest: string, target = 'burgee/commander'): object => ({
  check: 'require-esm',
  blocking: true,
  found: `engines.node "${range}" admits ${lowest}`,
  message: `this package is CommonJS, and require('${target}') throws ERR_REQUIRE_ESM on Node ${lowest}, which engines.node allows; raising the floor is a semver-major for this package`,
  fix: RAISE,
});
const floor = (found: string): object => ({ check: 'floor', blocking: false, found, message: FLOOR_MESSAGE, fix: RAISE });
const jestCjs = (targets: string): object => ({
  check: 'jest-cjs',
  blocking: true,
  found: 'jest is declared, and package.json has no "type": "module"',
  message: `jest loads this CommonJS package through its own module loader, which cannot load the ES-module-only ${targets}`,
  fix: JEST_FIX,
});

/** wait-port `16083537`: CommonJS, `engines.node >=10`, commander 9 and chalk 4 (both off-major), mocha. */
const waitPort = (commander = '^9.3.0'): Record<string, string> => ({
  'package.json': JSON.stringify({ name: 'wait-port', engines: { node: '>=10' }, dependencies: { commander, chalk: '^4.1.2' }, devDependencies: { mocha: '^10.0.0' } }),
  'bin/wait-port.js': "#!/usr/bin/env node\n\nconst chalk = require('chalk');\nconst program = require('commander');\n",
});

/** tsc-alias `1077308b`: CommonJS TypeScript on `moduleResolution: node`, `engines.node >=16.20.2`, commander 9, jest. */
const tscAlias = (): Record<string, string> => ({
  'package.json': JSON.stringify({ name: 'tsc-alias', engines: { node: '>=16.20.2' }, scripts: { test: 'jest' }, dependencies: { commander: '^9.0.0' }, devDependencies: { jest: '^29.0.0', typescript: '^5.0.0' } }),
  'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'commonjs', moduleResolution: 'node' } }),
  'src/bin/index.ts': "#!/usr/bin/env node\nimport { Option, program } from 'commander';\n",
});

/** @swc/cli `2cbd4700`: CommonJS TypeScript, `engines.node ">= 20.19.0"`, commander 8, jest through @swc/jest. */
const swcCli = (): Record<string, string> => ({
  'package.json': JSON.stringify({ name: '@swc/cli', engines: { node: '>= 20.19.0' }, scripts: { test: 'jest' }, dependencies: { commander: '^8.3.0' }, devDependencies: { jest: '^29.0.0', '@swc/jest': '^0.2.0' } }),
  'src/index.ts': "import { program } from 'commander';\n",
});

/** The rows `migrate` reports for a project of this manifest and these files. */
const rows = async (manifest: object, files: Record<string, string> = {}): Promise<unknown> => (await run(project({ 'package.json': JSON.stringify(manifest), ...files }))).preflight;

describe('R2 — the range reader', () => {
  it('R2 — reads every engines range the trial and the frame wrote', async () => {
    const { BELOW_FLOOR, NO_REQUIRE_ESM, lowestIn } = await preflight();
    expect(lowestIn('>=10', NO_REQUIRE_ESM)).toBe('10.0.0');
    expect(lowestIn('>=16', NO_REQUIRE_ESM)).toBe('16.0.0');
    expect(lowestIn('>=16.20.2', NO_REQUIRE_ESM)).toBe('16.20.2');
    expect(lowestIn('>= 20.19.0', NO_REQUIRE_ESM), "@swc/cli's own spelling; 20.19 has require(esm), 21.0 does not").toBe('21.0.0');
    expect(lowestIn('^20.19.0 || >=22.13.0', NO_REQUIRE_ESM), 'the family floor admits no Node without require(esm)').toBeUndefined();
    expect(lowestIn('>=22', NO_REQUIRE_ESM)).toBe('22.0.0');
    expect(lowestIn('>=22', BELOW_FLOOR)).toBeUndefined();
    expect(lowestIn('18 - 22', BELOW_FLOOR)).toBe('18.0.0');
    expect(lowestIn('~20.18', BELOW_FLOOR)).toBe('20.18.0');
    expect(lowestIn('20.x', BELOW_FLOOR)).toBe('20.0.0');
    expect(lowestIn('*', BELOW_FLOOR)).toBe('0.0.0');
    expect(lowestIn('>=v18', BELOW_FLOOR)).toBe('18.0.0');
    expect(lowestIn('not-a-range', BELOW_FLOOR)).toBeUndefined();
  });

  it('reads each operator up to the edge of what it admits', async () => {
    const { between, lowestIn } = await preflight();
    const from = (v: string): ReturnType<typeof between>[] => [between(v)];
    // `>` steps past everything the partial names.
    expect(lowestIn('>10', from('0.0.0'))).toBe('11.0.0');
    expect(lowestIn('>10.1', from('0.0.0'))).toBe('10.2.0');
    expect(lowestIn('>10.1.2', from('0.0.0'))).toBe('10.1.3');
    // `<` stops before the partial's first version; `<=` after its last.
    expect(lowestIn('<10', from('0.0.0'))).toBe('0.0.0');
    expect(lowestIn('<10', from('9.9.9'))).toBe('9.9.9');
    expect(lowestIn('<10', from('10.0.0'))).toBeUndefined();
    expect(lowestIn('<=10', from('10.5.0'))).toBe('10.5.0');
    expect(lowestIn('<=10', from('11.0.0'))).toBeUndefined();
    // A bare version or `=` is every version the partial names.
    expect(lowestIn('16', from('16.9.9'))).toBe('16.9.9');
    expect(lowestIn('16', from('17.0.0'))).toBeUndefined();
    expect(lowestIn('=16.2', from('16.2.7'))).toBe('16.2.7');
    expect(lowestIn('=16.2', from('16.3.0'))).toBeUndefined();
    expect(lowestIn('16.2.3', from('16.2.4'))).toBeUndefined();
    // `^` holds the leftmost non-zero part.
    expect(lowestIn('^20.19.0', from('20.99.0'))).toBe('20.99.0');
    expect(lowestIn('^20.19.0', from('21.0.0'))).toBeUndefined();
    expect(lowestIn('^0.2.3', from('0.2.9'))).toBe('0.2.9');
    expect(lowestIn('^0.2.3', from('0.3.0'))).toBeUndefined();
    expect(lowestIn('^0.0.3', from('0.0.4'))).toBeUndefined();
    expect(lowestIn('^0', from('0.9.0'))).toBe('0.9.0');
    expect(lowestIn('^0', from('1.0.0'))).toBeUndefined();
    expect(lowestIn('^0.0', from('0.1.0'))).toBeUndefined();
    expect(lowestIn('^*', from('99.0.0'))).toBe('99.0.0');
    // `~` holds the minor when there is one, the major when there is not.
    expect(lowestIn('~20.18', from('20.18.9'))).toBe('20.18.9');
    expect(lowestIn('~20.18', from('20.19.0'))).toBeUndefined();
    expect(lowestIn('~20', from('20.99.0'))).toBe('20.99.0');
    expect(lowestIn('~20', from('21.0.0'))).toBeUndefined();
    expect(lowestIn('~1.2.3', from('1.2.2'))).toBe('1.2.3');
    expect(lowestIn('~1.2.3', from('1.3.0'))).toBeUndefined();
    expect(lowestIn('~1.2.3', from('1.2.9')), 'a full version under ~ holds the minor, not the patch').toBe('1.2.9');
    // x-ranges, in every spelling, and the empty range.
    expect(lowestIn('20.X', from('21.0.0'))).toBeUndefined();
    expect(lowestIn('20.*', from('20.5.0'))).toBe('20.5.0');
    expect(lowestIn('20.1.x', from('20.2.0'))).toBeUndefined();
    expect(lowestIn('20.1.x', from('20.1.9'))).toBe('20.1.9');
    expect(lowestIn('x', from('99.0.0'))).toBe('99.0.0');
    expect(lowestIn('', from('3.0.0'))).toBe('3.0.0');
    expect(lowestIn('<*', from('0.0.0')), 'below every version is nothing').toBeUndefined();
    // A hyphen range is inclusive at both ends, and a partial upper end admits all it names.
    expect(lowestIn('18 - 22', from('22.9.9'))).toBe('22.9.9');
    expect(lowestIn('18 - 22', from('23.0.0'))).toBeUndefined();
    expect(lowestIn('18 - 22.1.0', from('22.1.0'))).toBe('22.1.0');
    expect(lowestIn('18 - 22.1.0', from('22.1.1'))).toBeUndefined();
    expect(lowestIn('18  -  22', from('0.0.0')), 'any run of spaces around the hyphen').toBe('18.0.0');
    expect(lowestIn('>=1.2.34', from('0.0.0')), 'a part of more than one digit').toBe('1.2.34');
  });

  it('intersects a set, unions the branches, and drops prereleases', async () => {
    const { between, lowestIn, NO_REQUIRE_ESM } = await preflight();
    expect(lowestIn('>=18 <21', [between('20.0.0')])).toBe('20.0.0');
    expect(lowestIn('>=18 <21', [between('21.0.0')])).toBeUndefined();
    expect(lowestIn('>=18  <21', [between('0.0.0')]), 'any run of spaces separates comparators').toBe('18.0.0');
    expect(lowestIn('>=22 <20', [between('0.0.0')]), 'a contradiction admits nothing').toBeUndefined();
    expect(lowestIn('>=22 || >=18', [between('0.0.0')]), 'the lowest of every branch').toBe('18.0.0');
    expect(lowestIn('  >=  10  ', [between('0.0.0')])).toBe('10.0.0');
    expect(lowestIn('>=  10', [between('11.0.0')]), 'the operator binds across every space after it').toBe('11.0.0');
    expect(lowestIn('>=10 ||', [between('3.0.0')]), 'an empty branch admits every version').toBe('3.0.0');
    expect(lowestIn('>=20.19.0 <21', NO_REQUIRE_ESM), 'inside the floor has require(esm)').toBeUndefined();
    expect(lowestIn('>=20.19.0-rc.1', [between('0.0.0')])).toBe('20.19.0');
    expect(lowestIn('>=20.19.0+build.5', [between('0.0.0')])).toBe('20.19.0');
    expect(lowestIn('>=v1-beta', [between('0.0.0')])).toBe('1.0.0');
  });

  it('reads nothing it cannot parse, and says so instead of guessing', async () => {
    const { admitted, between, lowestIn } = await preflight();
    for (const range of ['not-a-range', '>=1.2.3.4', '~>1', '>=18 || lts', '18 - ', '>=1.a', 'v', '>=18 <x1', '>=', '>=1 18 - 22', '18 - 22 <30']) {
      expect(admitted(range), range).toBeUndefined();
      expect(lowestIn(range, [between('0.0.0')]), range).toBeUndefined();
    }
    expect(admitted('>=22 <20')).toEqual([]);
    expect(admitted('<0.0.0'), 'a span that ends where it starts admits nothing').toEqual([]);
    expect(admitted('*')).toEqual([between('0.0.0')]);
    expect(between('20.19.0', '21.0.0').lo).toBeLessThan(between('21.0.0').lo);
  });

  it('holds the floor to the one every family package declares', async () => {
    const { FLOOR } = await preflight();
    const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { engines: { node: string } };
    expect(FLOOR).toBe(own.engines.node);
  });
});

describe('R1, R3 — require-esm', () => {
  it('R3 — the wait-port shape gets a blocking require-esm row naming Node 10.0.0', async () => {
    const report = await run(project(waitPort()));
    expect(report.preflight).toEqual([requireEsm('>=10', '10.0.0')]);
  });

  it('names the first target the run considers, whatever the order of the manifest', async () => {
    const dir = project({ 'package.json': JSON.stringify({ engines: { node: '>=18' }, dependencies: { ora: '^9.0.0', chalk: '^6.0.0' } }), 'a.js': "const ora = require('ora');\n" });
    expect((await run(dir, { dryRun: true })).preflight).toEqual([requireEsm('>=18', '18.0.0', 'roundel/chalk')]);
  });

  it('considers only what --only names, and nothing --skip leaves out', async () => {
    const dir = project({ 'package.json': JSON.stringify({ engines: { node: '>=18' }, dependencies: { chalk: '^6.0.0', ora: '^9.0.0' } }) });
    expect((await run(dir, { only: ['ora'] })).preflight).toEqual([requireEsm('>=18', '18.0.0', 'flagstaff/ora')]);
    expect((await run(dir, { skip: ['chalk'] })).preflight).toEqual([requireEsm('>=18', '18.0.0', 'flagstaff/ora')]);
    expect((await run(dir, { skip: ['chalk', 'ora'] })).preflight, 'no targets, no rows').toEqual([]);
  });

  it('is a floor warning, never require-esm, when nothing names a Node', async () => {
    const dir = project({ 'package.json': JSON.stringify({ dependencies: { chalk: '^6.0.0' } }) });
    expect((await run(dir)).preflight).toEqual([floor('no engines.node')]);
    const numeric = project({ 'package.json': JSON.stringify({ engines: { node: 20 }, dependencies: { chalk: '^6.0.0' } }) });
    expect((await run(numeric)).preflight, 'a range that is not a string is no range').toEqual([floor('no engines.node')]);
    const nulled = project({ 'package.json': JSON.stringify({ engines: null, scripts: null, dependencies: { chalk: '^6.0.0' } }) });
    expect((await run(nulled)).preflight).toEqual([floor('no engines.node')]);
    // A manifest of `null` reads as an empty one, as it always has; --only still names a target.
    expect((await run(project({ 'package.json': 'null' }), { only: ['chalk'] })).preflight).toEqual([floor('no engines.node')]);
  });

  it('every incumbent migrate moves is its own key in the mapping, so each has a target', () => {
    expect(HOSTS.filter((host) => MAPPING[host] === undefined)).toEqual([]);
  });
});

describe('R4 — floor', () => {
  it('R4 — the svgo shape gets a floor warning, and its picocolors still moves', async () => {
    const dir = project({
      'package.json': JSON.stringify({ name: 'svgo', type: 'module', engines: { node: '>=16' }, dependencies: { commander: '^11.1.0', picocolors: '^1.1.1' } }),
      'lib/svgo.js': "import pc from 'picocolors';\n",
    });
    const report = await run(dir);
    expect(report.preflight).toEqual([floor('engines.node ">=16" admits 16.0.0')]);
    expect(report.exitCode).toBe(ExitCode.OK);
    expect(report.summary).toBe('complete: 1 file rewritten');
    expect(read(dir, 'lib/svgo.js')).toBe("import pc from 'roundel/picocolors';\n");
  });

  it('R4 — an ES-module project on engines.node >=22 gets no rows', async () => {
    const dir = project({ 'package.json': JSON.stringify({ type: 'module', engines: { node: '>=22' }, dependencies: { commander: '^15.0.0' }, devDependencies: { jest: '^29.0.0' } }), 'a.js': "import { Command } from 'commander';\n" });
    const report = await run(dir);
    expect(report.preflight).toEqual([]);
    expect(report.changed).toBe(true);
  });

  it('reports a range it cannot read, rather than guessing what it admits', async () => {
    const dir = project({ 'package.json': JSON.stringify({ type: 'module', engines: { node: 'lts/*' }, dependencies: { chalk: '^6.0.0' } }) });
    expect((await run(dir)).preflight).toEqual([floor('engines.node "lts/*" could not be read')]);
  });

  it('a CommonJS project on the family floor gets no row', async () => {
    const dir = project({ 'package.json': JSON.stringify({ engines: { node: '^20.19.0 || >=22.13.0' }, dependencies: { chalk: '^6.0.0' } }) });
    expect((await run(dir)).preflight).toEqual([]);
  });
});

describe('R5 — jest-cjs', () => {
  it('R5 — the @swc/cli shape under --force gets jest-cjs, require-esm from 21.0.0, and untracked', async () => {
    const report = await run(project(swcCli()), { force: true, status: () => [' M src/other.ts', '?? node-compile-cache/'] });
    expect(report.preflight).toEqual([
      requireEsm('>= 20.19.0', '21.0.0'),
      jestCjs('burgee/commander'),
      {
        check: 'untracked',
        blocking: false,
        found: 'git status: ?? node-compile-cache/',
        message: '--force skipped the git-tree check, and these untracked paths are not part of the rewrite',
        fix: 'add node-compile-cache/ to .gitignore',
      },
    ]);
    expect(report.exitCode, 'commander 8 is off-major: nothing would be written, so nothing is blocked').toBe(ExitCode.OK);
  });

  it('R5 — transformIgnorePatterns or --experimental-vm-modules clears the jest row', async () => {
    const base = { engines: { node: '^20.19.0 || >=22.13.0' }, dependencies: { chalk: '^6.0.0' } };
    expect(await rows({ ...base, devDependencies: { jest: '^29.0.0' } })).toEqual([jestCjs('roundel/chalk')]);
    expect(await rows({ ...base, jest: { testEnvironment: 'node' } }), 'a jest key declares jest').toEqual([jestCjs('roundel/chalk')]);
    expect(await rows(base, { 'jest.config.json': '{}' }), 'a config file declares jest').toEqual([jestCjs('roundel/chalk')]);
    const byExtension = await Promise.all(['js', 'cjs', 'mjs', 'ts'].map(async (ext) => await rows(base, { [`jest.config.${ext}`]: 'module.exports = {};\n' })));
    expect(byExtension, 'every config name jest reads').toEqual(Array.from({ length: 4 }, () => [jestCjs('roundel/chalk')]));
    expect(await rows({ ...base, devDependencies: { jest: '^29.0.0' }, jest: { transformIgnorePatterns: [] } })).toEqual([]);
    expect(await rows(base, { 'jest.config.js': 'module.exports = { transformIgnorePatterns: [] };\n' })).toEqual([]);
    expect(await rows({ ...base, devDependencies: { jest: '^29.0.0' }, scripts: { test: 'node --experimental-vm-modules node_modules/.bin/jest' } })).toEqual([]);
    expect(await rows({ ...base, type: 'module', devDependencies: { jest: '^29.0.0' } }), 'an ES-module package loads the family as ES modules').toEqual([]);
    expect(await rows({ ...base, devDependencies: { mocha: '^10.0.0' } }), 'mocha loads through Node, which R3 covers').toEqual([]);
  });

  it('names every target in the jest row', async () => {
    const dir = project({ 'package.json': JSON.stringify({ engines: { node: '>=22.13.0' }, dependencies: { commander: '^15.0.0', chalk: '^6.0.0' }, devDependencies: { jest: '^29.0.0' } }) });
    expect((await run(dir)).preflight).toEqual([jestCjs('burgee/commander, roundel/chalk')]);
  });
});

describe('R6 — a blocking row stops the write, and --force does not lift it', () => {
  it('R6 — a blocking row on a claimed major writes nothing, even under --force', async () => {
    const dir = project(waitPort('^15.0.0'));
    const before = read(dir, 'bin/wait-port.js');
    const report = await run(dir, { force: true, status: () => [' M bin/wait-port.js'] });
    expect(report.preflight).toEqual([requireEsm('>=10', '10.0.0')]);
    expect(report.exitCode).toBe(ExitCode.RUNTIME);
    expect(report.changed).toBe(false);
    expect(report.summary).toBe('blocked: 1 preflight check; nothing written (1 file would be rewritten)');
    expect(read(dir, 'bin/wait-port.js')).toBe(before);
  });

  it('gives a dry run the same report and exit code', async () => {
    const dir = project({ ...waitPort('^15.0.0'), 'lib/b.js': "const { Command } = require('commander');\n", 'package.json': JSON.stringify({ engines: { node: '>=10' }, dependencies: { commander: '^15.0.0' }, devDependencies: { jest: '^29.0.0' } }) });
    const report = await run(dir, { dryRun: true });
    expect(report.summary).toBe('blocked: 2 preflight checks; nothing written (2 files would be rewritten)');
    expect(report.exitCode).toBe(ExitCode.RUNTIME);
    expect(report.changed).toBe(false);
    expect(report.dryRun).toBe(true);
  });

  it('a warning alone never blocks', async () => {
    const dir = project({ 'package.json': JSON.stringify({ type: 'module', engines: { node: '>=18' }, dependencies: { commander: '^15.0.0' } }), 'a.js': "import { Command } from 'commander';\n" });
    const report = await run(dir);
    expect(report.preflight.map((r) => r.check)).toEqual(['floor']);
    expect(report.exitCode).toBe(ExitCode.OK);
    expect(read(dir, 'a.js')).toBe("import { Command } from 'burgee/commander';\n");
  });

  it('R6 — rows on a project with nothing to rewrite leave the exit code alone', async () => {
    const reports = await Promise.all([waitPort(), tscAlias()].map(async (files) => await run(project(files))));
    for (const report of reports) {
      expect(report.exitCode).toBe(ExitCode.OK);
      expect(report.summary).toBe('nothing to rewrite');
      expect(report.changed).toBe(false);
      expect(report.preflight.length).toBeGreaterThan(0);
    }
  });

  it('a refusal beside a block still exits RUNTIME, and the block is what the summary says', async () => {
    // The refusal holds ora only; commander still has a file to move, so the block is what stops it.
    const dir = project({ 'package.json': JSON.stringify({ engines: { node: '>=10' }, dependencies: { commander: '^15.0.0', ora: '^9.0.0' } }), 'a.js': "require('commander');\n", 'b.js': "require('ora/lib/x.js');\n" });
    const report = await run(dir);
    expect(report.summary).toBe('blocked: 1 preflight check; nothing written (1 file would be rewritten)');
    expect(report.exitCode).toBe(ExitCode.RUNTIME);
    expect(read(dir, 'a.js')).toBe("require('commander');\n");
  });
});

describe('R7 — what --force let through is on the record', () => {
  it('lists ten untracked entries, then how many more', async () => {
    const entries = Array.from({ length: 12 }, (_, i) => `?? f${i}`);
    const report = await run(project({ 'package.json': '{}' }), { force: true, status: () => entries });
    expect(report.preflight).toEqual([
      {
        check: 'untracked',
        blocking: false,
        found: `git status: ${entries.slice(0, 10).join(', ')} … and 2 more`,
        message: '--force skipped the git-tree check, and these untracked paths are not part of the rewrite',
        fix: `add ${entries.map((e) => e.slice(3)).join(' ')} to .gitignore`,
      },
    ]);
  });

  it('records nothing when --force was not what let the entries through', async () => {
    expect((await run(project({ 'package.json': '{}' }), { dryRun: true, status: () => ['?? x/'] })).preflight).toEqual([]);
    expect((await run(project({ 'package.json': '{}' }), { force: true, status: () => [' M a.js'] })).preflight).toEqual([]);
  });
});

describe('R-N10 — no node10 row', () => {
  it('the tsc-alias shape gets no node10 row: types-under-node10 shipped typesVersions', async () => {
    const report = await run(project(tscAlias()));
    expect(report.preflight).toEqual([requireEsm('>=16.20.2', '16.20.2'), jestCjs('burgee/commander')]);
    const own = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { typesVersions: Record<string, Record<string, string[]>> };
    expect(own.typesVersions['*']?.['commander']).toEqual(['./dist/commander.d.ts']);
  });
});
