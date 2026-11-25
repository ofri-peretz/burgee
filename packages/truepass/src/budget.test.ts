import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import {
  aloneArgs,
  aloneEnv,
  fastest,
  within,
  budgetFrom,
  type Candidate,
  caseKey,
  DEFAULT_BUDGET_MS,
  DEFAULT_HINT,
  durationIn,
  judge,
  literal,
  LOCAL_ALONE_BUDGET_MS,
  type Machine,
  measureAlone,
  overBudget,
  overloadedBy,
  readCandidates,
  realMachine,
  repoPath,
  skipAlone,
  strict,
  withoutGitEnv,
} from './budget.js';
import { env, writeErr } from './runtime.js';

const scratch = scratchDirs();

const cand = (name: string, duration: number): Candidate => ({ file: 'src/a.test.ts', path: '/r/src/a.test.ts', name, title: name, duration, cwd: '/r', config: undefined });

/** A machine whose alone readings come from `readings`, in order, per case name, counting each. */
function machine(readings: Record<string, (number | undefined)[]>, opts: { ci?: boolean; overloaded?: boolean; clock?: number[] } = {}): Machine & { out: string[]; calls: string[] } {
  const out: string[] = [];
  const calls: string[] = [];
  const clock = [...(opts.clock ?? [])];
  return {
    env: opts.ci === true ? { CI: 'true' } : {},
    measure: async (c) => {
      calls.push(c.name);
      return readings[c.name]?.shift();
    },
    overloaded: () => opts.overloaded === true,
    now: () => clock.shift() ?? 0,
    write: (t) => out.push(t),
    cores: 4,
    out,
    calls,
  };
}

describe('overBudget', () => {
  it('keeps the cases over the budget that no exemption names, slowest first, ties by key', () => {
    const cases = [cand('a', 6000), cand('b', 5000), cand('c', 9000), cand('d', 6000), cand('e', 7000)];
    const slow = overBudget(cases, 5000, { [caseKey(cand('e', 0))]: 'needs a browser' });
    expect(slow.map((c) => c.name)).toEqual(['c', 'a', 'd']);
  });

  it('exempts nothing by default', () => {
    expect(overBudget([cand('a', 5001)], 5000)).toHaveLength(1);
  });
});

describe('budgetFrom', () => {
  it('falls back to 5000 ms, or the given default, when the variable is unset or blank', () => {
    expect(budgetFrom({})).toBe(DEFAULT_BUDGET_MS);
    expect(DEFAULT_BUDGET_MS).toBe(5000);
    expect(budgetFrom({ TRUEPASS_BUDGET_MS: '  ' }, 2000)).toBe(2000);
    expect(budgetFrom({}, undefined)).toBe(DEFAULT_BUDGET_MS);
  });

  it('reads the variable, 0 included', () => {
    expect(budgetFrom({ TRUEPASS_BUDGET_MS: '1500' })).toBe(1500);
    expect(budgetFrom({ TRUEPASS_BUDGET_MS: '0' })).toBe(0);
  });

  it('refuses a value that is not a number of milliseconds', () => {
    expect(() => budgetFrom({ TRUEPASS_BUDGET_MS: 'fast' })).toThrow('TRUEPASS_BUDGET_MS=fast: not a number of milliseconds');
    expect(() => budgetFrom({ TRUEPASS_BUDGET_MS: '-1' })).toThrow('not a number');
    expect(() => budgetFrom({ TRUEPASS_BUDGET_MS: 'Infinity' })).toThrow('not a number');
  });
});

describe('the small parts', () => {
  it('is strict on CI, as roundel reads it', async () => {
    expect(await strict({ CI: 'true' })).toBe(true);
    expect(await strict({ CI: '1' })).toBe(true);
    expect(await strict({ CI: '' })).toBe(false);
    expect(await strict({})).toBe(false);
  });

  it('loads with nothing built: the reporter and budget import only node and their own package at load time', () => {
    const outside = ['budget.ts', 'vitest-reporter.ts', 'runtime.ts'].flatMap((file) =>
      [...readFileSync(join(import.meta.dirname, file), 'utf8').matchAll(/^import\s[^;]*?from\s+'([^']+)'/gmu)]
        .map((m) => m[1] ?? '')
        .filter((spec) => !spec.startsWith('node:') && !spec.startsWith('./'))
        .map((spec) => `${file}: ${spec}`),
    );
    expect(outside).toEqual([]);
  });

  it('skips an alone reading off CI under load or out of time, never on CI', () => {
    expect(LOCAL_ALONE_BUDGET_MS).toBe(120_000);
    expect(skipAlone(true, 120_001, true)).toBe(false);
    expect(skipAlone(false, 0, true)).toBe(true);
    expect(skipAlone(false, 120_001, false)).toBe(true);
    expect(skipAlone(false, 120_000, false)).toBe(false);
  });

  it('calls a machine overloaded only above one runnable process per core', () => {
    expect(overloadedBy(4.5, 4)).toBe(true);
    expect(overloadedBy(4, 4)).toBe(false);
    expect(overloadedBy(1, 4)).toBe(false);
  });

  it('drops every GIT_ variable and keeps the rest', () => {
    expect(withoutGitEnv({ GIT_DIR: '/x', GIT_INDEX_FILE: 'i', PATH: '/bin', MYGIT_X: 'y' })).toEqual({ PATH: '/bin', MYGIT_X: 'y' });
  });

  it('escapes a title into a pattern that matches only it', () => {
    const title = 'a (b) [c] {d} + e? f* ^g$ h|i \\ j.k';
    expect(new RegExp(`^${literal(title)}$`, 'u').test(title)).toBe(true);
    expect(new RegExp(`^${literal('a.b')}$`, 'u').test('axb')).toBe(false);
  });

  it('writes a file key relative to the root with forward slashes', () => {
    expect(repoPath('/r', '/r/src/a.test.ts')).toBe('src/a.test.ts');
    expect(repoPath('/r', '/r/src\\win\\a.test.ts')).toBe('src/win/a.test.ts');
  });

  it('finds the named case in a JSON report', () => {
    const report = { testResults: [{ assertionResults: [{ ancestorTitles: ['s'], title: 'x', duration: null }] }, {}, { assertionResults: [{ ancestorTitles: ['s'], title: 'y', duration: 12 }] }] };
    expect(durationIn(report, 's > y')).toBe(12);
    expect(durationIn(report, 's > x')).toBeUndefined();
    expect(durationIn({}, 's > y')).toBeUndefined();
  });

  it('runs the file alone, with -t naming the case and the JSON report where it asks', () => {
    expect(aloneArgs({ ...cand('s > a (1)', 6000), title: 'a (1)', config: '/r/vitest.config.ts' }, '/v/vitest.mjs', '/o/report.json')).toEqual([
      '/v/vitest.mjs',
      'run',
      '/r/src/a.test.ts',
      '--config',
      '/r/vitest.config.ts',
      '-t',
      'a \\(1\\)',
      '--reporter=json',
      '--outputFile=/o/report.json',
    ]);
    expect(aloneArgs(cand('a', 6000), 'v', 'r')).toEqual(['v', 'run', '/r/src/a.test.ts', '-t', 'a', '--reporter=json', '--outputFile=r']);
  });

  it('runs an alone reading with the gate off and without git variables', () => {
    expect(aloneEnv({ GIT_DIR: '/x', PATH: '/bin', TRUEPASS_BUDGET_MS: '5000' })).toEqual({ PATH: '/bin', TRUEPASS_BUDGET_MS: '0' });
  });

  it('keeps the fastest reported reading, and counts a reading at the budget as within it', () => {
    expect(fastest([])).toBeUndefined();
    expect(fastest([undefined])).toBeUndefined();
    expect(fastest([7000, undefined, 4000])).toBe(4000);
    expect(within(5000, 5000)).toBe(true);
    expect(within(5001, 5000)).toBe(false);
    expect(within(undefined, 5000)).toBe(false);
  });

  it('names the advice it prints by default', () => {
    expect(DEFAULT_HINT).toBe('Make each case fast without weakening it (share a spawn in beforeAll, import instead of spawning, shrink the fixture), or exempt it with the reason.');
  });
});

describe('measureAlone', () => {
  const pkg = join(import.meta.dirname, '..');

  it('spawns the vitest this project resolves, in its directory, and reads the case from the report', async () => {
    const seen: { args: readonly string[]; cwd: string }[] = [];
    const ms = await measureAlone({ ...cand('s > a', 6000), cwd: pkg }, async (args, cwd) => {
      seen.push({ args, cwd });
      const report = String(args.at(-1)).replace('--outputFile=', '');
      writeFileSync(report, JSON.stringify({ testResults: [{ assertionResults: [{ ancestorTitles: ['s'], title: 'a', duration: 42 }] }] }));
    });
    expect(ms).toBe(42);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.cwd).toBe(pkg);
    expect(seen[0]?.args[0]).toMatch(/[\\/]vitest[\\/]vitest\.mjs$/u);
    expect(seen[0]?.args.at(-1)).toMatch(/[\\/]truepass-budget-[^\\/]+[\\/]report\.json$/u);
  });

  it('removes its report directory when it is done', async () => {
    let report = '';
    await measureAlone({ ...cand('s > a', 6000), cwd: pkg }, async (args) => {
      report = String(args.at(-1)).replace('--outputFile=', '');
      writeFileSync(report, '{}');
      writeFileSync(join(dirname(report), 'extra.txt'), 'x');
    });
    expect(report).not.toBe('');
    expect(existsSync(dirname(report))).toBe(false);
  });

  it('reads nothing when the run wrote no report, or the project has no vitest', async () => {
    expect(await measureAlone({ ...cand('s > a', 6000), cwd: pkg }, async () => undefined)).toBeUndefined();
    let spawned = false;
    const none = await measureAlone({ ...cand('s > a', 6000), cwd: join(tmpdir(), 'truepass-no-project') }, async () => {
      spawned = true;
    });
    expect(none).toBeUndefined();
    expect(spawned).toBe(false);
  });
});

describe('judge', () => {
  it('passes with nothing to judge, and measures nothing', async () => {
    const m = machine({});
    expect(await judge([], 5000, undefined, m)).toBe(true);
    expect(m.out).toEqual([]);
  });

  it('passes cases under the budget alone, and lists them as slow only in the run', async () => {
    const m = machine({ a: [100], b: [5000] });
    expect(await judge([cand('a', 6000), cand('b', 7000)], 5000, undefined, m)).toBe(true);
    expect(m.out).toEqual(["\n2 case(s) read over the 5000 ms budget in a full run and under it alone; not failing on the machine's load:\n  6000 ms, 100 ms alone  src/a.test.ts > a\n  7000 ms, 5000 ms alone  src/a.test.ts > b\n"]);
    expect(m.calls).toEqual(['a', 'b']);
  });

  it('lists a single case under the budget alone', async () => {
    const m = machine({ a: [100] });
    expect(await judge([cand('a', 6000)], 5000, undefined, m)).toBe(true);
    expect(m.out).toEqual(["\n1 case(s) read over the 5000 ms budget in a full run and under it alone; not failing on the machine's load:\n  6000 ms, 100 ms alone  src/a.test.ts > a\n"]);
  });

  it('takes a second reading only when the first is over, and keeps the faster', async () => {
    const m = machine({ a: [7000, 4000], b: [3000, 9999] }, { ci: true });
    expect(await judge([cand('a', 6000), cand('b', 6000)], 5000, undefined, m)).toBe(true);
    expect(m.calls).toEqual(['a', 'a', 'b']);
    expect(m.out.join('')).toContain('6000 ms, 4000 ms alone  src/a.test.ts > a');
    expect(m.out.join('')).toContain('6000 ms, 3000 ms alone  src/a.test.ts > b');
  });

  it('fails a case over the budget both times alone on CI, naming its faster reading and the hint', async () => {
    const m = machine({ a: [7000, 8000] }, { ci: true, overloaded: true });
    expect(await judge([cand('a', 6000)], 5000, 'Move it to the nightly run.', m)).toBe(false);
    expect(m.out.join('')).toBe('\n✗ 1 test case(s) over the 5000 ms per-case budget:\n  6000 ms, 7000 ms alone  src/a.test.ts > a\n  Move it to the nightly run.\n');
  });

  it('fails a case whose alone runs never reported it, with the default hint', async () => {
    const m = machine({ a: [undefined, undefined] });
    expect(await judge([cand('a', 6000)], 5000, undefined, m)).toBe(false);
    expect(m.out.join('')).toContain(`  6000 ms  src/a.test.ts > a\n  ${DEFAULT_HINT}\n`);
  });

  it('leaves cases unjudged off CI when the machine is overloaded, and passes', async () => {
    const m = machine({ a: [7000, 8000], b: [9000, 9000] }, { overloaded: true });
    expect(await judge([cand('a', 6000), cand('b', 6000)], 5000, undefined, m)).toBe(true);
    expect(m.out).toEqual(['\n2 case(s) over the 5000 ms budget alone, read with the load average above 4 cores; unjudged here, judged on CI:\n  6000 ms  src/a.test.ts > a\n  6000 ms  src/a.test.ts > b\n']);
  });

  it('leaves a case unjudged off CI when every alone reading was taken under load', async () => {
    let calls = 0;
    const m = machine({ a: [7000, 8000] });
    // The skip check sees a quiet machine; both readings a loaded one.
    m.overloaded = () => ++calls > 1;
    expect(await judge([cand('a', 6000)], 5000, undefined, m)).toBe(true);
    expect(m.calls).toEqual(['a', 'a']);
    expect(m.out.join('')).toContain('unjudged here, judged on CI:\n  6000 ms, 7000 ms alone  src/a.test.ts > a');
  });

  it('fails off CI when a reading was taken on a quiet machine', async () => {
    let calls = 0;
    const m = machine({ a: [7000, 8000] });
    // The skip check and the first reading see a quiet machine; the second reading a loaded one.
    m.overloaded = () => ++calls > 2;
    expect(await judge([cand('a', 6000)], 5000, undefined, m)).toBe(false);
  });

  it('stops measuring off CI once the alone readings took two minutes, counted from the start', async () => {
    const start = LOCAL_ALONE_BUDGET_MS;
    const m = machine({ a: [100], b: [100] }, { clock: [start, start, start + LOCAL_ALONE_BUDGET_MS + 1] });
    expect(await judge([cand('a', 6000), cand('b', 6000)], 5000, undefined, m)).toBe(true);
    expect(m.calls).toEqual(['a']);
    expect(m.out.join('')).toContain('unjudged here, judged on CI:\n  6000 ms  src/a.test.ts > b');
  });
});

describe('readCandidates', () => {
  it('reads nothing from a directory that is not there', () => {
    expect(readCandidates(join(tmpdir(), 'truepass-budget-none-here'))).toEqual([]);
  });

  it('reads every .json file, and ignores the rest', () => {
    const dir = scratch('truepass-budget-test-');
    writeFileSync(join(dir, '2.json'), JSON.stringify([cand('b', 6000)]));
    writeFileSync(join(dir, '1.json'), JSON.stringify([cand('a', 6000)]));
    writeFileSync(join(dir, 'notes.txt'), 'x');
    mkdirSync(join(dir, 'sub'));
    expect(readCandidates(dir).map((c) => c.name).sort()).toEqual(['a', 'b']);
  });
});

describe('realMachine', () => {
  it('reads this process through the runtime seam', () => {
    const m = realMachine();
    expect(m.env).toBe(env());
    expect(m.write).toBe(writeErr);
    expect(m.cores).toBeGreaterThan(0);
    expect(typeof m.overloaded()).toBe('boolean');
    expect(m.now()).toBeGreaterThan(0);
  });
});
