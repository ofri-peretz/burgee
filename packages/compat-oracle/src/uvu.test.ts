/**
 * The `uvu` runner (`colour-facades` R1): kleur's suite, graded by the counts uvu prints.
 *
 * kleur's `npm test` is `uvu -r esm -i utils -i xyz`, and `-r esm` does not start on Node 24
 * (`Cannot use import statement outside a module`, the spec's re-grounding 3). Two things are
 * tested here: that a uvu run is read as the cases it counted, a file it could not load as one
 * failure, and a run with no summary as an error; and that tsx, standing where `-r esm` stood,
 * loads the suite as `esm` did — ES module syntax in its `.js` files, `./utils` resolved to
 * `./utils.js`, and `uvu` resolved to the build uvu's own CLI queues on.
 * Proven red first (rule 4): with no `uvu` arm, a host declaring it fell through to mocha's
 * invocation and graded nothing.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Host } from './hosts.js';
import { grade, installSuiteDeps, summarize, unsatisfiedPins } from './run.js';
import { uvuCounts, type UvuRun, uvuTap } from './uvu.js';

/** What uvu 0.3.3 printed for kleur 4.1.5's `test/index.js` against kleur itself: `FORCE_COLOR=1`, which uvu sets. */
const PASSING = [
  '\u001B[1m\u001B[4m\u001B[37mindex.js\u001B[22m\u001B[24m\u001B[39m',
  '\u001B[90m• \u001B[39m\u001B[90m• \u001B[39m\u001B[32m  (8 / 8)',
  '\u001B[39m',
  '  Total:     8\u001B[32m',
  '  Passed:    8\u001B[39m',
  '  Skipped:   0',
  '  Duration:  0.84ms',
  '',
].join('\n');

/** The same file with two cases failing and one skipped, uncoloured: uvu exited 1. */
const FAILING = ['index.js', '• ✘ ✘ • (2 / 4)', '', '  FAIL  "codes"', '    Expected values to be strictly equal:', '', '  Total:     4', '  Passed:    2', '  Skipped:   1', '  Duration:  1.20ms', ''].join('\n');

const run = (stdout: string, status: number | null = 0, file = 'index.js', stderr = ''): UvuRun => ({ file, status, stdout, stderr });

describe("reading uvu's counts", () => {
  it('reads through the colour uvu prints its summary in', () => {
    expect(uvuCounts(PASSING)).toEqual({ total: 8, passed: 8, skipped: 0 });
  });

  it('reads a run with failures and a skip', () => {
    expect(uvuCounts(FAILING)).toEqual({ total: 4, passed: 2, skipped: 1 });
  });

  it('reads no counts off output with no summary, or one with a line missing, or one that passes more than it ran', () => {
    expect(uvuCounts('')).toBeUndefined();
    expect(uvuCounts('index.js\n• • (2 / 2)\n')).toBeUndefined();
    expect(uvuCounts('  Total:     2\n  Skipped:   0\n')).toBeUndefined();
    expect(uvuCounts('  Total:     2\n  Passed:    2\n')).toBeUndefined();
    expect(uvuCounts('  Total:     2\n  Passed:    3\n  Skipped:   0\n')).toBeUndefined();
  });

  it('reads counts of more than one digit, and a summary line with trailing space', () => {
    expect(uvuCounts('  Total:     15  \n  Passed:    12 \n  Skipped:   10 \n')).toEqual({ total: 15, passed: 12, skipped: 10 });
  });

  it('reads the summary lines, never a line of a failure’s report that mentions one', () => {
    const decoys = '    Expected: Total:     99\n  Total:     98 of them\n    Expected: Passed:    99\n  Passed:    97 of them\n    Expected: Skipped:   99\n  Skipped:   96 of them\n';
    expect(uvuCounts(`${decoys}${FAILING}`)).toEqual({ total: 4, passed: 2, skipped: 1 });
  });

  it('reads no counts when the `Total` line is missing', () => {
    expect(uvuCounts('  Passed:    2\n  Skipped:   0\n')).toBeUndefined();
  });

  it('reads an empty file as zero cases', () => {
    expect(uvuCounts('  Total:     0\n  Passed:    0\n  Skipped:   0\n')).toEqual({ total: 0, passed: 0, skipped: 0 });
  });
});

describe('a uvu run as the summary the oracle grades', () => {
  it('grades a run with failures as those failures, and takes a skip out of the cases as node:test’s summary does', () => {
    const tap = uvuTap([run(FAILING, 1)]);
    expect(tap).toEqual({ output: '# index.js: 2 passed, 2 failed, 1 skipped\n# tests 5\n# pass 2\n# fail 2\n# skipped 1\n' });
    expect(summarize((tap as { output: string }).output, 1, 4)).toMatchObject({ tests: 4, passed: 2, failed: 2, skipped: 1, rate: 2 / 4 });
  });

  it('adds up across files, and prints no skip line for a run with none', () => {
    const tap = uvuTap([run(PASSING, 0, 'colors.js'), run(PASSING)]);
    expect(tap).toEqual({ output: '# colors.js: 8 passed, 0 failed, 0 skipped\n# index.js: 8 passed, 0 failed, 0 skipped\n# tests 16\n# pass 16\n# fail 0\n' });
  });

  it('counts a file uvu could not load as one failure, and names why from stderr', () => {
    const dead = run('', 1, 'colors.js', "\n    at x\n  SyntaxError: The requested module '../shim-1.mjs' does not provide an export named '$'  \n");
    const { output } = uvuTap([run(PASSING), dead]) as { output: string };
    expect(output).toContain("# colors.js: uvu exited 1 before its summary, counted as one failure: SyntaxError: The requested module '../shim-1.mjs' does not provide an export named '$'\n");
    expect(summarize(output, 2, 15)).toMatchObject({ tests: 9, passed: 8, failed: 1, rate: 8 / 15 });
  });

  it('names a file that died silently', () => {
    expect((uvuTap([run('', 1)]) as { output: string }).output).toContain('counted as one failure: nothing on stderr');
  });

  it('is an error, not a score, when uvu was killed or exited 0 with no summary', () => {
    expect(uvuTap([run(PASSING), run(PASSING, null, 'colors.js')])).toEqual({ error: 'colors.js: uvu was killed before it finished' });
    expect(uvuTap([run('index.js\n• ', 0, 'index.js', 'Error: odd\n')])).toEqual({ error: 'index.js: uvu exited 0 with no summary: Error: odd' });
  });

  it('reads the counts of a run that exited 1 with its summary printed, never one failure for the file', () => {
    expect(summarize((uvuTap([run(FAILING, 1)]) as { output: string }).output, 1, 4)).toMatchObject({ passed: 2, failed: 2 });
  });
});

/**
 * The arm end to end, against the real uvu pinned beside a scratch suite, as `grade()` runs
 * kleur's. Not on Windows, for the reason the twist and tsd runners give: `installSuiteDeps`
 * spawns `npm`, which `execFileSync` cannot start there, and no `suiteDeps` host is graded there.
 */
describe.skipIf(process.platform === 'win32')('the uvu runner, end to end', () => {
  const UVU_DEPS = { uvu: '0.3.3', kleur: '4.1.5' };
  /** When the pins resolve as of: an hour past kleur 4.1.5, the newer of the two. */
  const UVU_AS_OF = '2022-06-26T19:51:46.000Z';
  const PKG = resolve(fileURLToPath(new URL('..', import.meta.url)));
  /** Installed once per checkout and linked beside each scratch suite, as the twist runner's is. */
  const UVU_CACHE = join(PKG, 'node_modules', '.cache', 'compat-oracle-uvu-runner');
  let vendorDir = '';
  const uvu = (over: Partial<Host> = {}): Host => ({
    name: 'uvued',
    npmName: 'kleur',
    repo: 'file:///nowhere',
    testDir: 'test',
    testGlob: '*.test.js',
    imports: [{ upstream: '../index.mjs', subpath: '/kleur', reexportDefault: true, control: 'kleur' }],
    runner: 'uvu',
    tsLoader: 'tsx',
    suiteDeps: Object.entries(UVU_DEPS).map(([name, version]) => `${name}@${version}`),
    target: 'roundel',
    status: 'active',
    ...over,
  });
  const hostDir = (): string => join(vendorDir, 'uvued');
  const suite = (files: Record<string, string>): void => {
    rmSync(join(hostDir(), 'test'), { recursive: true, force: true });
    mkdirSync(join(hostDir(), 'test'), { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(hostDir(), 'test', name), body);
  };
  /** A file in kleur's shape: ES module syntax under a CommonJS root, a helper named with no extension. */
  const HEADER = "import { test } from 'uvu';\nimport * as assert from 'uvu/assert';\nimport { ONE } from './helper';\n";
  const file = (cases: string[]): string => `${HEADER}${cases.map((body, i) => `test('case ${String(i)}', () => { ${body} });\n`).join('')}test.run();\n`;

  beforeAll(() => {
    mkdirSync(UVU_CACHE, { recursive: true });
    writeFileSync(join(UVU_CACHE, 'package.json'), JSON.stringify({ name: '@vendored/uvu-runner-deps', private: true, devDependencies: UVU_DEPS }));
    writeFileSync(join(UVU_CACHE, '.source.json'), JSON.stringify({ depsBefore: UVU_AS_OF }));
    installSuiteDeps(uvu({ name: 'uvu-runner-deps' }), UVU_CACHE);
    vendorDir = mkdtempSync(join(PKG, '.grade-uvu-'));
    mkdirSync(hostDir(), { recursive: true });
    writeFileSync(join(hostDir(), 'package.json'), JSON.stringify({ name: '@vendored/uvued-suite', private: true, type: 'commonjs', main: './shim.mjs', devDependencies: UVU_DEPS }));
    writeFileSync(join(hostDir(), '.source.json'), JSON.stringify({ depsBefore: UVU_AS_OF }));
    symlinkSync(join(UVU_CACHE, 'node_modules'), join(hostDir(), 'node_modules'), 'dir');
    expect(unsatisfiedPins(UVU_DEPS, hostDir()), 'the linked install satisfies the suite’s pins').toEqual([]);
  }, 300_000);

  afterAll(() => {
    if (vendorDir !== '' && process.platform !== 'win32') spawn('rm', ['-rf', vendorDir], { detached: true, stdio: 'ignore' }).unref();
  });

  it('grades two passes and a failure as exactly that, where uvu under `-r esm` cannot start at all', () => {
    suite({ 'a.test.js': file(['assert.is(ONE, 1)', 'assert.is(ONE, 2)', 'assert.ok(true)']), 'helper.js': 'export const ONE = 1;\n' });
    // The premise, measured: without the substitution the CommonJS root refuses the suite's syntax.
    const bare = spawnSync(process.execPath, [join(hostDir(), 'node_modules', 'uvu', 'bin.js'), 'test', '^a\\.test\\.js$'], { cwd: hostDir(), encoding: 'utf8' });
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain('Cannot use import statement outside a module');
    const graded = grade(uvu(), vendorDir, 'kleur', 3);
    expect(graded.error).toBeUndefined();
    expect(graded).toMatchObject({ files: 1, tests: 3, passed: 2, failed: 1, rate: 2 / 3 });
  });

  it('hands the suite the uvu build its CLI queues on, so `test.run()` registers with the runner', () => {
    // `import { test } from 'uvu'` resolved through the `import` condition is a second uvu,
    // whose queue the CLI never reads: `test.run()` throws on it (measured, `QUEUE[…] is undefined`).
    suite({ 'a.test.js': file(['assert.ok(true)']), 'helper.js': 'export const ONE = 1;\n' });
    expect(grade(uvu(), vendorDir, 'kleur', 1)).toMatchObject({ tests: 1, passed: 1, failed: 0 });
  });

  it('grades the shim through the import condition, so the control is the incumbent’s ES build', () => {
    suite({ 'a.test.js': `${HEADER}import kleur from '../shim.mjs';\ntest('enabled', () => { assert.ok(kleur.enabled); assert.is(kleur.red('x'), '\\u001B[31mx\\u001B[39m'); });\ntest.run();\n`, 'helper.js': 'export const ONE = 1;\n' });
    expect(grade(uvu(), vendorDir, 'kleur', 1)).toMatchObject({ tests: 1, passed: 1 });
  });

  it('grades a file that cannot load as one failure beside the rest', () => {
    suite({ 'a.test.js': file(['assert.ok(true)', 'assert.ok(false)']), 'b.test.js': `import { nothing } from './helper';\n${file(['assert.ok(nothing)'])}`, 'helper.js': 'export const ONE = 1;\n' });
    expect(grade(uvu(), vendorDir, 'kleur', 3)).toMatchObject({ files: 2, tests: 3, passed: 1, failed: 2 });
  });

  it('refuses a suite that does not pin its own uvu, and runs a host that declares no loader without one', () => {
    suite({ 'a.test.js': file(['assert.ok(true)']), 'helper.js': 'export const ONE = 1;\n' });
    expect(grade(uvu({ suiteDeps: ['kleur@4.1.5'] }), vendorDir, 'kleur').error).toMatch(/pins its own uvu in `suiteDeps`/);
    const unpinned = uvu();
    delete unpinned.suiteDeps;
    expect(grade(unpinned, vendorDir, 'kleur').error).toMatch(/pins its own uvu in `suiteDeps`/);
    const bare = uvu();
    delete bare.tsLoader;
    // Without `esm` the CommonJS root refuses the file: one failure, never a pass.
    expect(grade(bare, vendorDir, 'kleur', 1)).toMatchObject({ tests: 1, passed: 0, failed: 1 });
  });

  it('holds each file to the host’s suite timeout, and reports a file it cut short as an error', () => {
    suite({ 'a.test.js': file(['return new Promise(() => { setInterval(() => {}, 1000); })']), 'helper.js': 'export const ONE = 1;\n' });
    expect(grade(uvu({ suiteTimeoutMs: 3_000 }), vendorDir, 'kleur').error).toBe('a.test.js: uvu was killed before it finished');
  });
});
