/**
 * C5 — the ratchet. Proven red first (rule 4): a grade one test below the recorded
 * baseline must count as a regression; at or above it must not. A gate that has never
 * been shown to fail is not a gate.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type Host, HOSTS } from './hosts.js';
import { type Baseline, cjsLoad, type Grade, hoistJestMocks, internalShimBody, jestGlobals, mochaCli, internalShimFrom, parseFlatTap, parseNodeTest, regressed, summarize, tsLoaderArgs, unsatisfiedPins } from './run.js';

const grade = (passed: number): Grade => ({
  host: 'commander',
  target: 'burgee/commander',
  files: 105,
  tests: 878,
  passed,
  failed: 878 - passed,
  skipped: 0,
  reference: 1307,
  rate: passed / 1307,
});

const baseline: Baseline = { commander: { reference: 1307, passed: 17, rate: 0.013 } };

describe('the compatibility ratchet', () => {
  it('flags one test below the baseline as a regression', () => {
    expect(regressed(grade(16), baseline)).toBe(true);
  });

  it('accepts the baseline itself, and anything above it', () => {
    expect(regressed(grade(17), baseline)).toBe(false);
    expect(regressed(grade(1307), baseline)).toBe(false);
  });

  it('never regresses a host with no baseline yet', () => {
    expect(regressed({ ...grade(0), host: 'yargs' }, baseline)).toBe(false);
  });
});

describe('parsing node:test TAP summaries', () => {
  it('reads the three counts that matter', () => {
    const tap = 'TAP version 13\n# tests 878\n# suites 190\n# pass 17\n# fail 861\n# cancelled 0\n';
    expect(parseNodeTest(tap)).toEqual({ tests: 878, passed: 17, failed: 861, skipped: 0, exceeded: 0 });
  });

  it('reads zero from output with no summary, so a truncated run cannot look like a score', () => {
    expect(parseNodeTest('TAP version 13\nok 1 - something\n')).toEqual({ tests: 0, passed: 0, failed: 0, skipped: 0, exceeded: 0 });
  });

  /**
   * Captured from mocha 11 (`--reporter tap`) on a suite of two passing tests and one
   * `it.skip`. It prints the skip as an `ok` line but leaves it out of BOTH totals, so
   * subtracting it again took it off a count that never held it — yargs then reported 804
   * passing out of 803 run, which cannot happen and flatters the score.
   */
  it('does not subtract a skip the runner already left out — mocha, which prints no skip summary', () => {
    const tap = ['ok 1 probe runs', 'ok 2 probe also runs', 'ok 3 probe is pending # SKIP -', '# tests 2', '# pass 2', '# fail 0', '1..3', ''].join('\n');
    const r = parseNodeTest(tap);
    expect(r).toEqual({ tests: 2, passed: 2, failed: 0, skipped: 1, exceeded: 0 });
    expect(r.passed).toBeLessThanOrEqual(r.tests);
  });

  /**
   * Captured from node:test 24.18.0 on the same shape. Here the skip IS in `# tests` and is
   * not in `# pass`, so it is subtracted from the denominator only.
   */
  it('does subtract a skip the runner counted — node:test, which prints `# skipped`', () => {
    const tap = ['ok 1 - runs', 'ok 2 - also runs', 'ok 3 - skips itself # SKIP windows only', '# tests 3', '# pass 2', '# fail 0', '# skipped 1', ''].join('\n');
    const r = parseNodeTest(tap);
    expect(r).toEqual({ tests: 2, passed: 2, failed: 0, skipped: 1, exceeded: 0 });
    expect(r.passed).toBeLessThanOrEqual(r.tests);
  });
});

describe("parsing vitest's tap-flat", () => {
  // The dialect verbatim, from `vitest run --reporter=tap-flat`: a plan, then one line per
  // test with the file and the describe path in the name. No `# tests / # pass / # fail`.
  const flat = ['TAP version 13', '1..3', 'ok 1 - a.test.js > g > passes # time=0.67ms', 'not ok 2 - a.test.js > g > fails # time=2.62ms', 'ok 3 - a.test.js > g > later # time=0.30ms'].join('\n');

  it('counts the ok and not ok lines, because there is no summary to read', () => {
    expect(parseFlatTap(flat)).toEqual({ tests: 3, passed: 2, failed: 1, skipped: 0 });
  });

  it('reports a skipped test and never counts it, as the other dialect does', () => {
    expect(parseFlatTap('1..2\nok 1 - a # SKIP\nok 2 - b\n')).toEqual({ tests: 1, passed: 1, failed: 0, skipped: 1 });
  });

  it('ignores the indented ok lines of a nested body, which is the other reporter', () => {
    // `--reporter=tap` wraps each test in its file's subtest; counting those would count
    // files, not tests. The patterns are anchored at column zero for exactly this.
    const nested = ['TAP version 13', '1..1', 'not ok 1 - a.test.js {', '    1..2', '    ok 1 - passes', '    not ok 2 - fails', '}'].join('\n');
    expect(parseFlatTap(nested)).toEqual({ tests: 1, passed: 0, failed: 1, skipped: 0 });
  });

  it('summarises a flat run off its plan, with no summary line present', () => {
    const s = summarize(flat, 1, 3);
    expect(s).toMatchObject({ tests: 3, passed: 2, failed: 1, rate: 2 / 3 });
    expect(s.error).toBeUndefined();
  });

  it('will not read a killed run as a flat one, however many ok lines it left behind', () => {
    // A suite that died mid-run has `ok` lines and no plan. Counting them is how "0 / 0"
    // once looked like a grade — with the flat dialect it would look like 72 passing.
    const killed = ['TAP version 13', ...Array.from({ length: 72 }, (_, i) => `ok ${i + 1} - a`)].join('\n');
    const s = summarize(killed, 1, 816);
    expect(s.error).toContain('exited before its summary');
    expect(s.passed).toBe(0);
    expect(s.tests).toBe(0);
  });

  it('prefers the summary lines where a runner prints both', () => {
    // node:test prints a plan *and* a summary; the summary is its own count rather than
    // one inferred from lines, so it wins.
    const both = ['TAP version 13', '1..2', 'ok 1 - a', 'ok 2 - b', '# tests 2', '# pass 1', '# fail 1'].join('\n');
    expect(summarize(both, 1, 2)).toMatchObject({ passed: 1, failed: 1 });
  });
});

describe('summarising a run', () => {
  const withSummary = 'TAP version 13\nok 1 - a\nnot ok 2 - b\n# tests 878\n# pass 17\n# fail 861\n';

  it('output with no summary is an error, never a score of zero', () => {
    // The yargs control died at test 72 when a test called process.exit(); before this,
    // that read as "0 / 0" and looked like a grade.
    const s = summarize('TAP version 13\nok 1 - a\nok 2 - b\n', 10, 816);
    expect(s.error).toMatch(/before its summary/);
    expect(s.passed).toBe(0);
  });

  it('measures against the reference total when one is known', () => {
    const s = summarize(withSummary, 10, 1307);
    expect(s.error).toBeUndefined();
    expect(s.passed).toBe(17);
    expect(s.rate).toBeCloseTo(17 / 1307);
  });

  it('leaves a skipped test out of the denominator: it ran on no one', () => {
    // commander's ".ts subcommand" test skips itself off Windows, so node:test counts 1362
    // registered and 1361 passed with 0 failed; the honest score is 1361 / 1361.
    const s = summarize('# tests 1362\n# pass 1361\n# fail 0\n# skipped 1\n', 105, 1361);
    expect(s).toMatchObject({ tests: 1361, skipped: 1, passed: 1361, rate: 1 });
  });

  it('reads a mocha pending test the same way, from its # SKIP directive', () => {
    // mocha's own totals already exclude the pending case — measured, `ok … # SKIP` with
    // `# tests 1 / # pass 1` for one passing test and one `it.skip`.
    const s = summarize('ok 1 - a # SKIP\nok 2 - b\n# tests 1\n# pass 1\n# fail 0\n', 1, 0);
    expect(s).toMatchObject({ tests: 1, skipped: 1, passed: 1, rate: 1 });
  });

  it("reads ava's summary, whose skip line is `# skip` and sits between pass and fail", () => {
    // ava --tap (supertap): `# tests` counts passed + failed + skipped, `# skip` only when > 0.
    const s = summarize('ok 1 - a # SKIP\nok 2 - b\nnot ok 3 - c\n1..3\n# tests 3\n# pass 1\n# skip 1\n# fail 1\n', 1, 0);
    expect(s).toMatchObject({ tests: 2, skipped: 1, passed: 1, failed: 1, rate: 0.5 });
  });

  it('takes the registered count over a smaller reference, so a rate can never exceed 1', () => {
    const s = summarize('# tests 827\n# pass 823\n# fail 4\n', 14, 804);
    expect(s.rate).toBeCloseTo(823 / 827, 5);
  });

  it('falls back to the registered count when there is no reference yet', () => {
    expect(summarize(withSummary, 10, 0).rate).toBeCloseTo(17 / 878);
  });
});

/**
 * Where a control run's internal shim points, proven red first.
 *
 * A control gets the installed host's own file where the package ships it, and the package
 * by name where it does not — `@clack/prompts` publishes only `dist`, and re-exporting
 * `<installed>/src/common.js` failed two whole files to load.
 *
 * The catch is that "does it ship it" cannot be `existsSync`: the suite writes these
 * specifiers the CommonJS way, so cli-table3 imports `../src/cell` and the file is
 * `src/cell.js`. An existence check on the literal path answered "no" for four files that
 * are shipped, sent every one of cli-table3's 104 internal cases to the package root, and
 * took that informational line from 103 / 104 to 0 / 104 — a published number, moved by a
 * missing extension.
 */
describe('a control run’s internal shim', () => {
  const cliTable3 = HOSTS.find((h) => h.name === 'cli-table3') as Host;
  const clack = HOSTS.find((h) => h.name === 'clack') as Host;

  const installed = mkdtempSync(join(tmpdir(), 'internal-shim-'));
  mkdirSync(join(installed, 'src'), { recursive: true });
  writeFileSync(join(installed, 'package.json'), '{"name":"fake","version":"0.0.0"}\n');
  writeFileSync(join(installed, 'src', 'cell.js'), 'module.exports = {};\n');

  it('points at the host’s own file when the package ships it, extension or not', () => {
    expect(internalShimFrom(cliTable3, { target: 'cli-table3', installed, rel: 'src/cell' })).toBe(join(installed, 'src', 'cell'));
  });

  it('falls back to the package by name when the package does not ship it', () => {
    expect(internalShimFrom(clack, { target: '@clack/prompts', installed, rel: 'src/common.js' })).toBe('@clack/prompts');
  });

  it('points a target run at the target, never at an installed path', () => {
    expect(internalShimFrom(clack, { target: 'caique', installed: undefined, rel: 'src/common.js' })).toBe('caique');
  });
});

/**
 * A test that asks `require('../src/cell')` for one class gets one class.
 *
 * The default shim re-exports the target's whole main entry at every internal path, which
 * is right for a namespace of free functions and wrong for a class. cli-table3's
 * `table-layout-test.js` does `new Cell(opts)` and `expect(cell).toBeInstanceOf(Cell)`;
 * handed the namespace it constructed a `Table` and compared against one, and thirteen
 * cases read as divergences when nothing had diverged — the row's own note called them a
 * ceiling `internalShimFrom` could not reach. It could not; the shim *body* could.
 *
 * The evaluation order matters and is asserted: `.default` first, because a target whose
 * names hang off its default export is the shape that motivated this, then the namespace,
 * so a target that publishes the name flat is not required to publish it twice.
 */
/**
 * Written to a file and `require`d, the way the oracle's own shim is: a `new Function`
 * would run the text without proving that Node loads it, and CWE-95 refuses it anyway.
 * The fake target ships `Cell` in both of the shapes the body has to handle.
 */
const shimFor = (named: string | undefined, shape: 'default' | 'flat'): unknown => {
  const dir = mkdtempSync(join(tmpdir(), 'named-shim-'));
  const pkg = join(dir, 'node_modules', 'faketarget');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"faketarget","version":"0.0.0","main":"index.cjs"}\n');
  const body = shape === 'default' ? 'module.exports = { default: { Cell } };' : 'module.exports = { Cell };';
  writeFileSync(join(pkg, 'index.cjs'), `class Cell {}\n${body}\n`);
  const at = join(dir, 'shim.cjs');
  writeFileSync(at, internalShimBody('faketarget', 'commonjs', named));
  return createRequire(join(dir, 'anchor.cjs'))(at);
};


describe('an internal shim for one named export', () => {
  const cliTable3 = HOSTS.find((h) => h.name === 'cli-table3') as Host;

  it('takes the name off the default export when the target hangs it there', () => {
    expect((shimFor('Cell', 'default') as { name?: string }).name).toBe('Cell');
  });

  it('takes it off the namespace when there is no default', () => {
    expect((shimFor('Cell', 'flat') as { name?: string }).name).toBe('Cell');
  });

  it('without a name it hands over the whole namespace, which is the Cell-shaped bug', () => {
    // The default shim's answer at `../src/cell` is the module, not the class — so
    // `new Cell(opts)` built the wrong object and `toBeInstanceOf(Cell)` compared against it.
    expect(typeof shimFor(undefined, 'flat')).toBe('object');
  });

  it('is unchanged without a name, for the hosts whose internals are namespaces', () => {
    expect(internalShimBody('target', 'commonjs')).toBe(internalShimBody('target', 'commonjs', undefined));
    expect(internalShimBody('target', 'module')).toContain("export * from 'target'");
  });

  it('cli-table3 declares the one path that needs it, and only that one', () => {
    expect(cliTable3.internalExports).toEqual({ 'src/cell': 'Cell' });
  });
});

describe('a case the incumbent expects to fail, and we pass', () => {
  /**
   * `slice-ansi`'s suite marks `slice links` as `test.failing()` — the incumbent cannot
   * round-trip an `OSC 8` hyperlink and says so. linegauge can, so the assertion passes, and
   * ava reports a passing `test.failing` as **`not ok`** with its own diagnostic.
   *
   * That `not ok` is bookkeeping about the *incumbent's* expectation, not a statement about
   * our implementation: the assertion in the case ran and succeeded. Counting it as a failure
   * put a permanent 14/15 ceiling on a row where the only remaining case is one we do better.
   *
   * It is reclassified only on that exact diagnostic, and only ever in the target run — in the
   * control the incumbent fails the case, the `test.failing` succeeds, and ava prints `ok`.
   */
  const avaOutput = [
    'ok 13 - can create empty slices',
    'not ok 15 - slice links',
    '  ---',
    '    message: >',
    '      Test was expected to fail, but succeeded, you should stop marking the test as failing',
    '  ...',
    '# tests 15',
    '# pass 14',
    '# fail 1',
  ].join('\n');

  it('counts it as passing, because the assertion passed', () => {
    expect(parseNodeTest(avaOutput)).toMatchObject({ tests: 15, passed: 15, failed: 0 });
  });

  it('reports how many were reclassified, so it is never silent', () => {
    expect(parseNodeTest(avaOutput).exceeded).toBe(1);
  });

  it('leaves an ordinary failure alone', () => {
    const ordinary = ['not ok 2 - slices a string', '# tests 3', '# pass 2', '# fail 1'].join('\n');
    expect(parseNodeTest(ordinary)).toMatchObject({ passed: 2, failed: 1, exceeded: 0 });
  });
});

/**
 * The `tap` dialect, whose whole shape is that **one grade is several files' output joined**.
 *
 * node-tap needs no runner binary: `node tests/test-parse.js` prints its own TAP and exits.
 * So the arm spawns once per file and concatenates, which makes the counts a property of the
 * *lines* rather than of any one file's summary — and that has to be true across restarting
 * `ok 1` sequences, repeated `TAP version` banners, and tap's own `# { total, pass }` footer,
 * which is a comment and not one of the three summary lines `parseNodeTest` reads.
 *
 * Taken verbatim from dotenv 17.4.2's real output at the shapes that matter, because the
 * failure this guards against is the one `summarize` already names: an output with `ok` lines
 * and no readable plan must not be counted, or a suite that died halfway reports what it
 * managed as a score.
 */
/** A package on disk at `<root>/node_modules/<name>`, at a version. */
const install = (root: string, name: string, version: string): void => {
  const at = join(root, 'node_modules', name);
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, 'package.json'), `{"name":"${name}","version":"${version}","main":"index.js"}\n`);
  writeFileSync(join(at, 'index.js'), 'module.exports = {};\n');
};

/** One node-tap file's output, at the shapes dotenv 17.4.2 really prints. */
const tapFile = (n: number, failAt?: number): string =>
  ['TAP version 14', ...Array.from({ length: n }, (_, i) => `${failAt === i + 1 ? 'not ok' : 'ok'} ${i + 1} - should be equal`), `1..${n}`, `# { total: ${n}, pass: ${n} }`, '# time=6.633ms'].join('\n');

describe('concatenated node-tap output', () => {
  it('adds up across files whose case numbers restart', () => {
    expect(parseFlatTap([tapFile(3), tapFile(26), tapFile(12)].join('\n'))).toMatchObject({ tests: 41, passed: 41, failed: 0 });
  });

  it('reads the dialect as flat TAP, not as a summary — tap prints no `# tests` line', () => {
    expect(summarize([tapFile(3), tapFile(26, 2)].join('\n'), 2, 29)).toMatchObject({ tests: 29, passed: 28, failed: 1, reference: 29 });
  });

  it('refuses output with cases and no plan at all, so a half-run is never a score', () => {
    expect(summarize('ok 1 - should be equal\nok 2 - should be equal\n', 1, 47).error).toBeDefined();
  });
});

/**
 * The install check, and the two wrong answers that reached a published rate through it.
 *
 * `installSuiteDeps` used to skip a package the moment its name *resolved* from the vendored
 * directory — and Node's resolver walks up, out of `vendor/<host>/` and out of the repository
 * altogether. Both exits were taken in practice:
 *
 *   - the workspace's own `node_modules` hoists `cosmiconfig` at 9.0.2 against the 10.0.1 that
 *     suite pins, so the install never ran and the control read 234 / 241 against an allowance
 *     of one;
 *   - a home-directory store outside the repo supplied `rc@1.2.8` — exactly the pinned
 *     version — and `rc`'s control graded 1 / 1 on a checkout where `rc` was in no manifest,
 *     no lockfile and no `node_modules` under the repo at all.
 *
 * Each case below is that shape, and each is red against the resolve-by-name check: it
 * answered "satisfied" for all four.
 */
describe('a pinned suite dependency is satisfied only beside the suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'suite-deps-'));
  const outside = mkdtempSync(join(tmpdir(), 'elsewhere-'));

  // `dir` sits inside `outside`, so resolution from `dir` reaches `outside`'s node_modules
  // the way a vendored directory reaches the workspace's — and the way anything in this
  // repository reaches a store in a home directory.
  const nested = join(outside, 'vendor', 'host');
  mkdirSync(nested, { recursive: true });

  it('accepts a pin installed beside the suite at that exact version', () => {
    install(dir, 'pinned', '10.0.1');
    expect(unsatisfiedPins({ pinned: '10.0.1' }, dir)).toEqual([]);
  });

  it('refuses a pin that is absent', () => {
    expect(unsatisfiedPins({ missing: '1.0.0' }, dir)).toEqual(['missing@1.0.0']);
  });

  it('refuses a pin present beside the suite at a different version — the cosmiconfig 9.0.2 case', () => {
    install(dir, 'drifted', '9.0.2');
    expect(unsatisfiedPins({ drifted: '10.0.1' }, dir)).toEqual(['drifted@10.0.1']);
  });

  it('refuses a pin that only resolves from outside the vendored directory — the stray-store case', () => {
    install(outside, 'strayed', '1.2.8');
    // The version is exactly right, which is what makes this the dangerous one: a check on
    // the version alone says yes, and the copy is on one machine and no other.
    expect(unsatisfiedPins({ strayed: '1.2.8' }, nested)).toEqual(['strayed@1.2.8']);
  });

  it('leaves a range alone wherever it resolves, because that half is the hoist by design', () => {
    install(outside, 'ranged', '0.5.6');
    expect(unsatisfiedPins({ ranged: '^0.5.1' }, nested)).toEqual([]);
  });
});

/**
 * The TypeScript preload for a `tap` host whose suite is half `.ts`.
 *
 * Two properties, and the first one is the one that protects every other row: a host that
 * declares no loader must spawn exactly what it spawned before, or `dotenv`'s 141 / 141
 * quietly becomes a measurement of something else.
 */
describe('the TypeScript loader a tap host may declare', () => {
  it('preloads nothing for a host that declares none, so every existing spawn is unchanged', () => {
    for (const host of HOSTS.filter((h) => h.tsLoader === undefined)) {
      expect(tsLoaderArgs(host), `${host.name} declares no tsLoader and must spawn a bare node`).toEqual([]);
    }
  });

  it('resolves the loader through the module system rather than by path', () => {
    const declared = HOSTS.filter((h) => h.tsLoader !== undefined);
    // Not `toBeGreaterThan(0)`: the field is allowed to have no user, and a lock that
    // demanded one would have to be deleted the day the last host stops needing it.
    for (const host of declared) {
      const args = tsLoaderArgs(host);
      expect(args.slice(0, 2)).toEqual(['--no-warnings', '--import']);
      // A `file://` URL, which is what `--import` takes — and proof the loader is on disk
      // here rather than a name that happens to type-check. A literal
      // `node_modules/tsx/dist/loader.mjs` would be a guess about a hoist free to move.
      expect(args[2]).toMatch(/^file:\/\/.+\.mjs$/);
    }
  });
});

describe('jest.mock is hoisted as jest hoists it (A12)', () => {
  it('moves a top-level jest.mock above the requires it has to precede', () => {
    const source = ["const lib = require('lib');", "jest.mock('fs', () => {", "  const fs = jest.requireActual('fs');", "  return { ...fs, readFileSync: jest.fn(fs.readFileSync) };", '});', 'test();', ''].join('\n');
    const out = hoistJestMocks(source);
    expect(out.indexOf("jest.mock('fs'")).toBeLessThan(out.indexOf("require('lib')"));
    expect(out.match(/jest\.mock\(/g)).toHaveLength(1);
    expect(out).toContain('return { ...fs, readFileSync: jest.fn(fs.readFileSync) };\n});');
  });

  it('reads past a parenthesis inside a string, and leaves vi.mock and indented calls alone', () => {
    const source = "require('x');\njest.mock('a', () => ({ label: ')(' }));\nvi.mock('b');\n  jest.mock('c');\n";
    expect(hoistJestMocks(source)).toBe("jest.mock('a', () => ({ label: ')(' }));\nrequire('x');\n\nvi.mock('b');\n  jest.mock('c');\n");
  });

  it('returns a file with no jest.mock unchanged', () => {
    expect(hoistJestMocks("require('x');\n")).toBe("require('x');\n");
  });
});

describe("a jest suite sees jest's execArgv, not vitest's (C1)", () => {
  it('empties process.execArgv before the suite loads, so a spawn does not inherit the runner flags', () => {
    // Written inside this package so the setup's own `import { vi } from 'vitest'` resolves,
    // and run under one of the flags vitest adds to its workers. commander hands
    // `process.execArgv` to an executable subcommand, and commander 14's suite asserts that
    // argv exactly: ten of its cases failed against commander 14 itself before this.
    const dir = mkdtempSync(join(resolve(fileURLToPath(new URL('..', import.meta.url))), '.setup-probe-'));
    try {
      const setup = join(dir, 'vitest.setup.mjs');
      writeFileSync(setup, jestGlobals());
      // `--import` takes a URL: a bare `D:\\…` path fails on Windows as an unsupported URL scheme.
      // eslint-disable-next-line node-security/detect-child-process -- already the form the rule's own fix names: `execFileSync` with an argument array and `shell: false`. Node's own execPath, literal flags, a literal `-e` program, and `setup`, a path this test just wrote inside its own mkdtemp.
      const seen = execFileSync(process.execPath, ['--conditions', 'development', '--import', pathToFileURL(setup).href, '-e', 'process.stdout.write(JSON.stringify(process.execArgv))'], { encoding: 'utf8', shell: false });
      expect(JSON.parse(seen)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("mocha's entry across its majors (C1)", () => {
  it('finds bin/mocha.js where it exists and bin/mocha where it does not', () => {
    const at = mkdtempSync(join(tmpdir(), 'mocha-cli-'));
    try {
      mkdirSync(join(at, 'bin'));
      writeFileSync(join(at, 'bin', 'mocha'), '');
      expect(mochaCli(at)).toBe(join(at, 'bin', 'mocha'));
      writeFileSync(join(at, 'bin', 'mocha.js'), '');
      expect(mochaCli(at)).toBe(join(at, 'bin', 'mocha.js'));
    } finally {
      rmSync(at, { recursive: true, force: true });
    }
  });
});

describe('a CommonJS shim busts the incumbent only when the suite busted the shim (C1)', () => {
  it('hands out the cached instance on a first load, and a fresh one after the suite deletes the shim', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cjs-shim-'));
    try {
      writeFileSync(join(dir, 'impl.cjs'), 'module.exports = { at: Symbol() };\n');
      writeFileSync(join(dir, 'shim.cjs'), `${cjsLoad(join(dir, 'impl.cjs'))}\nmodule.exports = loaded;\n`);
      // One process per probe, as one per suite: the shim's record is process-wide.
      const probe = [
        "const held = require('./impl.cjs');",
        "const first = require('./shim.cjs');",
        "delete require.cache[require.resolve('./shim.cjs')];",
        "const second = require('./shim.cjs');",
        'process.stdout.write(JSON.stringify([first === held, second === held]));',
      ].join('\n');
      // eslint-disable-next-line node-security/detect-child-process -- `execFileSync` with an argument array and `shell: false`: Node's own execPath and `probe`, a program assembled above from literal lines. Nothing reaches a command line.
      const seen = execFileSync(process.execPath, ['-e', probe], { cwd: dir, encoding: 'utf8', shell: false });
      // yargs 17's `parser.cjs` needs the first; signal-exit's `process-gone.js` the second.
      expect(JSON.parse(seen)).toEqual([true, false]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
