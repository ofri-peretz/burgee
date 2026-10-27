/**
 * The `twist` runner (`colour-facades` R2): a failing twist run is failures, never a pass.
 *
 * twist exits 0 whatever its assertions say, so the one property that matters is that the oracle
 * reads the counts twist prints and not the exit code it returns. Proven red first (rule 4): with
 * no `twist` arm, a host declaring it fell through to mocha's invocation and graded nothing it
 * could count — and an arm that read the exit code, as `exit-code` does, would grade every run
 * below a pass.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Host } from './hosts.js';
import { grade, installSuiteDeps, summarize, unsatisfiedPins } from './run.js';
import { type TwistRun, twistCounts, twistTap } from './twist.js';

/** The tail of what twist 0.0.5 printed for colorette 2.0.20's suite off a terminal, `CI=true`: it exited 0. */
const FAILING = [
  ' FAIL  tests/index.test.js (58 failed, 2 passed)',
  ' PASS  tests/createColors.test.js (3 passed)',
  ' PASS  tests/environment.test.js (4 passed)',
  '',
  'Suites: 1 failed, 2 passed, 3 total',
  'Tests:  58 failed, 9 passed, 67 total',
  'Time:   0.120s',
  '',
].join('\n');

/** The same suite with `FORCE_COLOR=` set, as upstream's workflow runs it: twist's view in colour. */
const PASSING = [
  '\u001B[1mSuites:\u001B[22m \u001B[32m\u001B[1m3\u001B[22m passed\u001B[39m, \u001B[1m3\u001B[22m total',
  '\u001B[1mTests:\u001B[22m  \u001B[32m\u001B[1m67\u001B[22m passed\u001B[39m, \u001B[1m67\u001B[22m total',
  'Time:   0.23s',
  '',
].join('\n');

/** The `Suites:` line of a finished view: nothing running. */
const DONE = 'Suites: 1 passed, 1 total\n';

/** twist's clear-screen, which opens every frame it draws when `CI` is unset. */
const CLS = '\u001B[2J\u001B[3J\u001B[H';

const run = (stderr: string, status: number | null = 0, file = 'tests/a.test.js'): TwistRun => ({ file, status, stderr });

/** One frame of twist's view as it redraws it with `CI` unset: a clear-screen, then the counts so far. */
const frame = (failed: number, passed: number, running = 0): string =>
  `${CLS}Suites: ${running > 0 ? `${String(running)} running, ` : ''}1 total\nTests:  ${String(failed)} failed, ${String(passed)} passed, ${String(failed + passed)} total\n`;

describe("reading twist's counts", () => {
  it('reads the failures off a run that exited 0', () => {
    expect(twistCounts(FAILING)).toEqual({ passed: 9, failed: 58, skipped: 0 });
  });

  it('reads through the colour twist draws its view in', () => {
    expect(twistCounts(PASSING)).toEqual({ passed: 67, failed: 0, skipped: 0 });
  });

  it('reads the last frame of a run that redrew its view, which is the finished one', () => {
    expect(twistCounts(frame(0, 1, 1) + frame(1, 1, 1) + frame(2, 3))).toEqual({ passed: 3, failed: 2, skipped: 0 });
  });

  it('reads no counts off a frame drawn while a file was still running, however whole they look', () => {
    expect(twistCounts(frame(0, 1) + frame(0, 2, 1))).toBeUndefined();
    expect(twistCounts('Tests:  2 passed, 2 total\n')).toBeUndefined();
  });

  it('counts a skip, and nothing that does not add up to twist’s own total', () => {
    expect(twistCounts(`${DONE}Tests:  1 failed, 2 passed, 3 skipped, 6 total\n`)).toEqual({ passed: 2, failed: 1, skipped: 3 });
    expect(twistCounts(`${DONE}Tests:  1 failed, 2 passed, 4 total\n`)).toBeUndefined();
    expect(twistCounts(`${DONE}Tests:  1 failed, 2 passed\n`)).toBeUndefined();
  });

  it('reads an empty file as zero cases, and output with no summary as nothing', () => {
    expect(twistCounts(`${DONE}Tests:  0 total\n`)).toEqual({ passed: 0, failed: 0, skipped: 0 });
    expect(twistCounts('Suites: 3 total\nTime:   0.1s\n')).toBeUndefined();
    expect(twistCounts('')).toBeUndefined();
  });
});

describe('a twist run as the summary the oracle grades', () => {
  it('grades a run of failures that exited 0 as those failures, never as a pass', () => {
    const tap = twistTap([run(FAILING)]);
    expect(tap).toEqual({ output: expect.stringContaining('# tests 67\n# pass 9\n# fail 58\n') });
    expect(summarize((tap as { output: string }).output, 1, 67)).toMatchObject({ tests: 67, passed: 9, failed: 58, rate: 9 / 67 });
  });

  it('adds up across files, and takes a skip out of the cases as node:test’s summary does', () => {
    const tap = twistTap([run(PASSING, 0, 'tests/a.test.js'), run(`${DONE}Tests:  1 failed, 2 passed, 1 skipped, 4 total\n`, 0, 'tests/b.test.js')]);
    expect(tap).toEqual({ output: expect.stringContaining('# tests 71\n# pass 69\n# fail 1\n# skipped 1\n') });
    expect(summarize((tap as { output: string }).output, 2, 70)).toMatchObject({ tests: 70, passed: 69, failed: 1, skipped: 1 });
  });

  it('prints no skip line for a run with none, and says what each file counted, and nothing else', () => {
    expect(twistTap([run(PASSING)])).toEqual({ output: '# tests/a.test.js: 67 passed, 0 failed, 0 skipped\n# tests 67\n# pass 67\n# fail 0\n' });
  });

  it('names the first line of a dead file’s stderr that is not blank or a stack frame, trimmed', () => {
    const { output } = twistTap([run('\n    at node:internal/modules\n   TypeError: boom   \n', 1)]) as { output: string };
    expect(output).toContain('counted as one failure: TypeError: boom\n');
  });

  it('counts a file twist could not load as one failure, and names why', () => {
    const { output } = twistTap([run(PASSING), run("\nSyntaxError: The requested module '../shim.js' does not provide an export named 'createColors'\n    at x\n", 1, 'tests/b.test.js')]) as { output: string };
    expect(output).toContain("# tests/b.test.js: twist exited 1 before its summary, counted as one failure: SyntaxError: The requested module '../shim.js' does not provide an export named 'createColors'\n");
    expect(summarize(output, 2, 70)).toMatchObject({ tests: 68, passed: 67, failed: 1, rate: 67 / 70 });
  });

  it('counts a file that died after drawing a frame as one failure, not as the passes it had drawn', () => {
    const { output } = twistTap([run(`${CLS}${DONE}Tests:  5 passed, 5 total\n`, 1)]) as { output: string };
    expect(summarize(output, 1, 9)).toMatchObject({ tests: 1, passed: 0, failed: 1 });
  });

  it('names a file that died silently, as one does under `CI`', () => {
    expect((twistTap([run('', 1)]) as { output: string }).output).toContain('counted as one failure: nothing on stderr');
  });

  it('is an error, not a score, when twist was killed or exited 0 with no summary', () => {
    expect(twistTap([run(PASSING), run(FAILING, null, 'tests/b.test.js')])).toEqual({ error: 'tests/b.test.js: twist was killed before it finished' });
    expect(twistTap([run('Error: something odd\n')])).toEqual({ error: 'tests/a.test.js: twist exited 0 with no finished summary: Error: something odd' });
  });
});

/**
 * The arm end to end, against the real twist pinned beside a scratch suite, as `grade()` runs
 * colorette's. On Windows too, since `installSuiteDeps` spawns `npm` through bellpull (`spawn.ts`),
 * which starts `npm.cmd` without a shell: under `execFileSync` it could not, and this was skipped.
 */
describe('the twist runner, end to end', () => {
  const TWIST_DEPS = { twist: '0.0.5', colorette: '2.0.20' };
  /** When the pins resolve as of: colorette's vendoring day, after both were published. */
  const TWIST_AS_OF = '2026-10-20T00:00:00.000Z';
  const PKG = resolve(fileURLToPath(new URL('..', import.meta.url)));
  /** Installed once per checkout and linked beside each scratch suite, as the tsd runner's is. */
  const TWIST_CACHE = join(PKG, 'node_modules', '.cache', 'compat-oracle-twist-runner');
  let vendorDir = '';
  const twisted = (over: Partial<Host> = {}): Host => ({
    name: 'twisted',
    // The control: nothing to resolve but the name, because the scratch files import twist alone.
    npmName: 'colorette',
    repo: 'file:///nowhere',
    testDir: 'tests',
    testGlob: '*.test.js',
    imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }],
    runner: 'twist',
    suiteDeps: Object.entries(TWIST_DEPS).map(([name, version]) => `${name}@${version}`),
    target: 'roundel/colorette',
    status: 'active',
    ...over,
  });
  const hostDir = (): string => join(vendorDir, 'twisted');
  const suite = (files: Record<string, string>): void => {
    rmSync(join(hostDir(), 'tests'), { recursive: true, force: true });
    mkdirSync(join(hostDir(), 'tests'), { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(hostDir(), 'tests', name), body);
  };
  const HEADER = 'import { t, equal } from "twist"\n';
  /**
   * A file in upstream's shape, one assertion a line. twist's view quotes the lines around a
   * failure and throws on a file with fewer of them (measured: a one-line file exits 1 from
   * `stripIndent`), which `twistTap` would count as one failure of the whole file.
   */
  const file = (name: string, assertions: string[]): string => `${HEADER}\nexport default [\n  t("${name}", [\n${assertions.map((a) => `    ${a},\n`).join('')}  ]),\n]\n`;

  beforeAll(() => {
    mkdirSync(TWIST_CACHE, { recursive: true });
    writeFileSync(join(TWIST_CACHE, 'package.json'), JSON.stringify({ name: '@vendored/twist-runner-deps', private: true, devDependencies: TWIST_DEPS }));
    writeFileSync(join(TWIST_CACHE, '.source.json'), JSON.stringify({ depsBefore: TWIST_AS_OF }));
    installSuiteDeps(twisted({ name: 'twist-runner-deps' }), TWIST_CACHE);
    vendorDir = mkdtempSync(join(PKG, '.grade-twist-'));
    mkdirSync(hostDir(), { recursive: true });
    writeFileSync(join(hostDir(), 'package.json'), JSON.stringify({ name: '@vendored/twisted-suite', private: true, type: 'module', main: './shim.js', devDependencies: TWIST_DEPS }));
    writeFileSync(join(hostDir(), '.source.json'), JSON.stringify({ depsBefore: TWIST_AS_OF }));
    symlinkSync(join(TWIST_CACHE, 'node_modules'), join(hostDir(), 'node_modules'), 'dir');
    expect(unsatisfiedPins(TWIST_DEPS, hostDir()), 'the linked install satisfies the suite’s pins').toEqual([]);
  }, 300_000);

  afterAll(() => {
    if (vendorDir !== '' && process.platform !== 'win32') spawn('rm', ['-rf', vendorDir], { detached: true, stdio: 'ignore' }).unref();
  });

  it('grades two passes and a failure as exactly that, where twist itself exits 0', () => {
    suite({ 'a.test.js': file('a', ['equal(1, 1)', 'equal(1, 2)', 't("b", [equal("x", "x")])']) });
    // The premise, measured: twist's own CLI calls this run a success.
    const direct = spawnSync(process.execPath, [join(hostDir(), 'node_modules', 'twist', 'bin', 'twist.js'), 'tests/a.test.js'], { cwd: hostDir(), env: { ...process.env, CI: 'true' }, encoding: 'utf8' });
    expect(direct.status).toBe(0);
    expect(twistCounts(direct.stderr)).toEqual({ passed: 2, failed: 1, skipped: 0 });
    const graded = grade(twisted(), vendorDir, 'colorette', 3);
    expect(graded.error).toBeUndefined();
    expect(graded).toMatchObject({ files: 1, tests: 3, passed: 2, failed: 1, rate: 2 / 3 });
  });

  it('grades a suite of failures at zero, and a file that cannot load as one failure beside the rest', () => {
    suite({
      'a.test.js': file('a', ['equal(1, 2)', 'equal(3, 4)']),
      'b.test.js': `import { nothing } from "twist"\n${file('b', ['equal(nothing, 1)'])}`,
      'c.test.js': file('c', ['equal(5, 5)']),
    });
    expect(grade(twisted(), vendorDir, 'colorette', 4)).toMatchObject({ files: 3, tests: 4, passed: 1, failed: 3, rate: 1 / 4 });
  });

  it('refuses a suite that does not pin its own twist, or pins nothing', () => {
    suite({ 'a.test.js': file('a', ['equal(1, 1)']) });
    expect(grade(twisted({ suiteDeps: ['colorette@2.0.20'] }), vendorDir, 'colorette').error).toMatch(/pins its own twist in `suiteDeps`/);
    const unpinned = twisted();
    delete unpinned.suiteDeps;
    expect(grade(unpinned, vendorDir, 'colorette').error).toMatch(/pins its own twist in `suiteDeps`/);
  });

  it('grades a case that never settles as an error, not as the passes drawn before it', () => {
    // Nothing keeps Node alive, so twist exits 0 with a frame still reading `1 running`.
    suite({ 'a.test.js': file('a', ['equal(1, 1)', '() => {}']) });
    expect(grade(twisted(), vendorDir, 'colorette').error).toMatch(/^a\.test\.js: twist exited 0 with no finished summary/);
  });

  it('holds each file to the host’s suite timeout, and reports a file it cut short as an error', () => {
    // A case that keeps Node alive and never settles: only the timeout ends it.
    suite({ 'a.test.js': file('a', ['() => { setInterval(() => {}, 1000) }']) });
    expect(grade(twisted({ suiteTimeoutMs: 3_000 }), vendorDir, 'colorette').error).toBe('a.test.js: twist was killed before it finished');
  });
});
