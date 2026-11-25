import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import type { Candidate, Machine } from './budget.js';
import TruepassBudget from './vitest-reporter.js';

const CWD = process.cwd();
const scratch = scratchDirs();

/** A module of cases, each `[fullName, duration]`; `undefined` is a case that did not run. */
const mod = (file: string, cases: [string, number | undefined][]) => ({
  moduleId: join(CWD, file),
  children: { allTests: () => cases.map(([fullName, d]) => ({ fullName, name: fullName.split(' > ').pop() ?? '', diagnostic: () => (d === undefined ? undefined : { duration: d }) })) },
});

function machine(env: NodeJS.ProcessEnv = {}, alone: number | undefined = 9000): Machine & { out: string[]; measured: Candidate[] } {
  const out: string[] = [];
  const measured: Candidate[] = [];
  return {
    env: { CI: 'true', ...env },
    measure: async (c) => {
      measured.push(c);
      return alone;
    },
    overloaded: () => false,
    now: () => 1.5,
    write: (t) => out.push(t),
    cores: 2,
    out,
    measured,
  };
}

const init = { config: { coverage: { enabled: false } }, vite: { config: { configFile: '/r/vitest.config.ts' } } };

describe('the truepass vitest reporter', () => {
  const exitCode = process.exitCode;
  afterEach(() => {
    process.exitCode = exitCode;
  });

  it('fails the run on a case over the budget alone, measured with its file, title, cwd, config and budget', async () => {
    const m = machine();
    const r = new TruepassBudget({}, m);
    r.onInit(init);
    await r.onTestRunEnd([mod('src/a.test.ts', [['s > slow', 6000], ['s > fast', 10], ['s > skipped', undefined]])]);
    expect(process.exitCode).toBe(1);
    const slow = { file: 'src/a.test.ts', path: join(CWD, 'src/a.test.ts'), name: 's > slow', title: 'slow', duration: 6000, cwd: CWD, config: '/r/vitest.config.ts', budget: 5000 };
    // Two alone readings: the first was over the budget too.
    expect(m.measured).toEqual([slow, slow]);
    expect(m.out.join('')).toContain('6000 ms, 9000 ms alone  src/a.test.ts > s > slow');
  });

  it('passes a case that is fast alone, and keeps the exit code', async () => {
    const r = new TruepassBudget({}, machine({}, 100));
    r.onInit({ config: {}, vite: {} });
    await r.onTestRunEnd([mod('src/a.test.ts', [['s > slow', 6000]])]);
    expect(process.exitCode).toBe(exitCode);
  });

  it('holds cases to the configured budget and prints the configured hint', async () => {
    const m = machine();
    await new TruepassBudget({ budgetMs: 1000, hint: 'Ask the owner.' }, m).onTestRunEnd([mod('src/a.test.ts', [['s > medium', 1500]])]);
    expect(process.exitCode).toBe(1);
    expect(m.out.join('')).toContain('over the 1000 ms per-case budget');
    expect(m.out.join('')).toContain('Ask the owner.');
  });

  it('lets TRUEPASS_BUDGET_MS override the option', async () => {
    const m = machine({ TRUEPASS_BUDGET_MS: '10000' });
    await new TruepassBudget({ budgetMs: 1000 }, m).onTestRunEnd([mod('src/a.test.ts', [['s > medium', 6000]])]);
    expect(m.measured).toEqual([]);
  });

  it('skips a case its exemption names, keyed from the root', async () => {
    const m = machine();
    await new TruepassBudget({ root: join(CWD, 'src'), exempt: { 'a.test.ts > s > slow': 'boots a browser' } }, m).onTestRunEnd([mod('src/a.test.ts', [['s > slow', 6000]])]);
    expect(m.measured).toEqual([]);
    expect(process.exitCode).toBe(exitCode);
  });

  it('judges nothing with the gate off or coverage on', async () => {
    const off = machine({ TRUEPASS_BUDGET_MS: '0' });
    await new TruepassBudget({}, off).onTestRunEnd([mod('src/a.test.ts', [['s > slow', 60000]])]);
    expect(off.measured).toEqual([]);
    const m = machine();
    const r = new TruepassBudget({}, m);
    r.onInit({ config: { coverage: { enabled: true } } });
    await r.onTestRunEnd([mod('src/a.test.ts', [['s > slow', 60000]])]);
    expect(m.measured).toEqual([]);
    expect(process.exitCode).toBe(exitCode);
  });

  it('inside a battery leaves its candidates in the defer directory for `truepass budget`', async () => {
    const defer = join(scratch('truepass-defer-'), 'a', 'b');
    const m = machine({ TRUEPASS_BUDGET_DEFER: defer });
    await new TruepassBudget({}, m).onTestRunEnd([mod('src/a.test.ts', [['s > slow', 6000]])]);
    expect(m.measured).toEqual([]);
    expect(process.exitCode).toBe(exitCode);
    const files = readdirSync(defer);
    expect(files).toEqual([`${String(process.pid)}-1_5.json`]);
    expect((JSON.parse(readFileSync(join(defer, files[0] ?? ''), 'utf8')) as Candidate[]).map((c) => c.name)).toEqual(['s > slow']);
    expect(m.out).toEqual([`\n1 case(s) over the 5000 ms budget in this run; \`truepass budget ${defer}\` judges them alone after the battery.\n`]);
  });

  it('writes nothing to the defer directory when every case was within the budget', async () => {
    const defer = join(scratch('truepass-defer-'), 'none');
    const m = machine({ TRUEPASS_BUDGET_DEFER: defer });
    await new TruepassBudget({}, m).onTestRunEnd([mod('src/a.test.ts', [['s > fast', 10]])]);
    expect(existsSync(defer)).toBe(false);
    expect(m.out).toEqual([]);
  });

  it('judges in place when the defer variable is empty', async () => {
    const m = machine({ TRUEPASS_BUDGET_DEFER: '' });
    await new TruepassBudget({}, m).onTestRunEnd([mod('src/a.test.ts', [['s > slow', 6000]])]);
    expect(m.measured).toHaveLength(2);
  });

  it('constructs with the real machine by default', () => {
    expect(() => new TruepassBudget()).not.toThrow();
  });
});
