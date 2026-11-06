/**
 * B1's oxmutate arm (D-20261101-b1-oxmutate-arm), first-adopter A5: the agent axis run against
 * oxmutate, the real CLI, with its own tasks and a shim named `oxmutate`, on the owner's machine
 * only.
 *
 * Driven against a stub `claude` and a stub oxmutate, as `agent.test.ts` drives the demo arms. What
 * this cannot test is the model, which is what the three local readings measure.
 */
import { chmodSync, existsSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ARM_READINGS_FOR_GRADE, ARMS, armReadings, installTool, isPosix, run, runOne, type Task, toolArgs, VARIANTS, variantsFor } from './axes/agent.js';
import { SUITE } from './bands.js';
import { buildDocument } from './emit.js';
import { type BenchRecord } from './record.js';
import { parseArgs, resultsName } from './run.js';
import { scratchDirs } from './scratch-dir.js';

const scratchDir = scratchDirs();
const EXECUTABLE = 0o755;
const REPO = join(import.meta.dirname, '..');
const CREDENTIAL = { CLAUDE_CODE_OAUTH_TOKEN: 'stub' };

/** A `claude` that answers with the argv it was given, and leaves a mark each time it runs a task. */
function argvClaude(cost = 0.25): { bin: string; marks: string } {
  const dir = scratchDir('stub-claude-ox-');
  const bin = join(dir, 'claude');
  const marks = join(dir, 'runs');
  writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$1" = --version ]; then echo '9.9.9 (Claude Code)'; exit 0; fi\necho run >> "${marks}"\nprintf '{"type":"result","is_error":false,"num_turns":2,"total_cost_usd":${String(cost)},"usage":{"input_tokens":500,"output_tokens":100},"result":"%s"}' "$*"\n`,
  );
  chmodSync(bin, EXECUTABLE);
  return { bin, marks };
}

/** A built oxmutate as far as the harness can tell: the shim runs it with node, and it exits `code`. */
function stubOxmutate(code = 0): string {
  const bin = join(scratchDir('stub-oxmutate-'), 'bin.js');
  writeFileSync(bin, `process.stdout.write('oxmutate stub\\n'); process.exit(${String(code)});\n`);
  return bin;
}

const task: Task = { id: 'ox-stub', requirement: 'D1', prompt: 'use `oxmutate`', setup: [], check: 'grep -q "Bash(oxmutate:\\*)" "$BENCH_RESULT"', maxTurns: 4, modalities: ['cli'] };

const armOptions = (claudeBin: string, extra: Record<string, unknown> = {}): Parameters<typeof run>[0] => ({
  arm: 'oxmutate',
  variants: [{ ...ARMS.oxmutate.variant, bin: stubOxmutate() }],
  tasks: [task],
  env: { ...process.env, ...CREDENTIAL, CI: '', GITHUB_ACTIONS: '' },
  runs: 1,
  model: 'test-model',
  timeoutMs: 30_000,
  claudeBin,
  readingsDir: scratchDir('arm-readings-'),
  ...extra,
});

const recordsOf = (out: ReturnType<typeof run>): BenchRecord[] => {
  if (!('records' in out)) throw new Error(`expected records, got: ${out.reason}`);
  return out.records;
};

describe('the arm is declared beside the demo arms, and changes none of them', () => {
  it('runs the workspace build of oxmutate, under the name its help prints, on its own task set', () => {
    expect(ARMS.oxmutate.variant).toMatchObject({ id: 'oxmutate', bin: 'packages/oxmutate/dist/bin.js', tool: 'oxmutate' });
    expect(ARMS.oxmutate.tasksDir).toBe(join(REPO, 'benchmarks', 'tasks', 'oxmutate'));
  });

  it('is in no default variant list, whatever the environment opts into', () => {
    expect(VARIANTS.map((v) => v.id)).not.toContain('oxmutate');
    expect(variantsFor({ BENCH_AGENT_MCP: '1', BENCH_AGENT_OXMUTATE: '1' }).map((v) => v.id)).not.toContain('oxmutate');
  });

  it('installs the shim as `oxmutate` and allows Bash on it alone; the demo keeps `demo`', () => {
    expect(readdirSync(installTool('/bin/echo', 'oxmutate'))).toEqual(['oxmutate']);
    expect(readdirSync(installTool('/bin/echo'))).toEqual(['demo']);
    expect(toolArgs('cli', undefined, 'oxmutate')).toEqual(['--tools', 'Bash', '--allowedTools', 'Bash(oxmutate:*)', '--settings', expect.any(String)]);
    expect(toolArgs('cli')).toEqual(['--tools', 'Bash', '--allowedTools', 'Bash(demo:*)', '--settings', expect.any(String)]);
  });
});

describe.skipIf(!isPosix())('a task\'s setup', () => {
  it('runs with the tool on PATH and the fixtures and repository named, so a task can copy its project', () => {
    const { bin } = argvClaude();
    const t: Task = {
      ...task,
      setup: ['command -v oxmutate > .found', 'printf %s "$BENCH_FIXTURES" > .fixtures', 'printf %s "$BENCH_REPO" > .repo'],
      check: 'grep -q /oxmutate .found && test -f "$(cat .fixtures)/oxmutate/adult/oxmutate.config.json" && test -d "$(cat .repo)/benchmarks"',
    };
    const r = runOne({ claudeBin: bin, task: t, toolDir: installTool(stubOxmutate(), 'oxmutate'), workdir: scratchDir('ox-work-'), model: 'm', timeoutMs: 30_000, tool: 'oxmutate' });
    expect(r.failure).toBeUndefined();
    expect(r.success).toBe(true);
  });
});

describe.skipIf(!isPosix())('run({ arm: "oxmutate" })', () => {
  /**
   * Reading 1 (2026-11-01, b8057bc) lost 4 of 5 `oxmutate-score` runs to 17 permission denials:
   * in a project with `node_modules` the agent ran `npx oxmutate`, which reaches the same
   * workspace build through `node_modules/.bin`, and only `Bash(oxmutate:*)` was allowed. That
   * measured the sandbox, not the CLI.
   */
  it('allows `npx oxmutate` beside the shim: in a project, that is how an agent runs it, and it is the same build', () => {
    expect(ARMS.oxmutate.variant.allow).toEqual(['Bash(npx oxmutate:*)']);
    expect(readlinkSync(join(REPO, 'node_modules', 'oxmutate'))).toBe('../packages/oxmutate');
    expect(toolArgs('cli', undefined, 'oxmutate', ['Bash(npx oxmutate:*)'])).toEqual(['--tools', 'Bash', '--allowedTools', 'Bash(oxmutate:*)', 'Bash(npx oxmutate:*)', '--settings', expect.any(String)]);
  });

  it('spawns claude with Bash on `oxmutate` only, and records the arm alone, with no ratio', () => {
    const { bin } = argvClaude();
    const records = recordsOf(run(armOptions(bin, { variants: [{ ...ARMS.oxmutate.variant, bin: stubOxmutate() }], tasks: [{ ...task, check: 'grep -q -- "--tools Bash --allowedTools Bash(oxmutate:\\*) Bash(npx oxmutate:\\*) --settings " "$BENCH_RESULT"' }] })));
    expect(records.filter((r) => r.variant.includes('÷'))).toEqual([]);
    expect(new Set(records.map((r) => r.variant))).toEqual(new Set(['oxmutate']));
    const rate = records.find((r) => r.metric === 'success-rate');
    expect(rate?.median).toBe(1);
    expect(rate?.gate?.min).toBe(0.8);
    expect(records.find((r) => r.metric === 'tokens-per-task')?.median).toBe(600);
  });

  it('records what the runs cost, as `claude` reported it, summed over the task-runs', () => {
    const { bin } = argvClaude(0.25);
    const records = recordsOf(run(armOptions(bin, { runs: 2 })));
    expect(records.find((r) => r.metric === 'cost-usd-total')).toMatchObject({ median: 0.5, unit: 'usd', samples: 2 });
  });

  it('refuses to run in GitHub Actions, before any agent run is spent', () => {
    for (const ci of [{ GITHUB_ACTIONS: 'true' }, { CI: 'true' }]) {
      const { bin, marks } = argvClaude();
      const out = run(armOptions(bin, { env: { ...process.env, ...CREDENTIAL, CI: '', GITHUB_ACTIONS: '', ...ci } }));
      expect('reason' in out ? out.reason : '').toMatch(/GitHub Actions/u);
      expect(existsSync(marks)).toBe(false);
    }
  });

  it('spends no run when oxmutate cannot run its own fixture', () => {
    const { bin, marks } = argvClaude();
    const out = run(armOptions(bin, { variants: [{ ...ARMS.oxmutate.variant, bin: stubOxmutate(3) }] }));
    expect('reason' in out ? out.reason : '').toMatch(/did not run its own fixture/u);
    expect(existsSync(marks)).toBe(false);
  });

  it('rejects an arm it does not know', () => {
    expect(() => run(armOptions(argvClaude().bin, { arm: 'nope' }))).toThrow(/unknown arm/u);
  });
});

/** One earlier reading, as the arm's results directory holds it. */
function reading(dir: string, name: string, successRate: number, tokens: number): void {
  const records = [
    { axis: 'agent', variant: 'oxmutate', metric: 'success-rate', unit: 'ratio', samples: 20, median: successRate, p95: successRate },
    { axis: 'agent', variant: 'oxmutate', metric: 'tokens-per-task', unit: 'tokens', samples: 20, median: tokens, p95: tokens },
  ];
  writeFileSync(join(dir, name), `${JSON.stringify({ arm: 'oxmutate', records })}\n`);
}

describe.skipIf(!isPosix())('never one reading (D-20261009-b1-totals-and-explain)', () => {
  it('reads every earlier reading of the arm, and nothing else in the directory', () => {
    const dir = scratchDir('arm-readings-');
    reading(dir, '2026-11-01-aaaaaaa-100000-local.json', 0.9, 1000);
    writeFileSync(join(dir, 'notes.txt'), 'not a reading\n');
    expect(armReadings(dir, 'oxmutate')).toEqual([{ file: '2026-11-01-aaaaaaa-100000-local.json', successRate: 0.9, tokensPerTask: 1000 }]);
    expect(armReadings(join(dir, 'absent'), 'oxmutate')).toEqual([]);
  });

  it(`grades on the median of ${String(ARM_READINGS_FOR_GRADE)} readings with their range, gated where a reading is`, () => {
    const dir = scratchDir('arm-readings-');
    reading(dir, '2026-11-01-aaaaaaa-100000-local.json', 0.7, 3000);
    reading(dir, '2026-11-01-aaaaaaa-110000-local.json', 0.9, 1000);
    const records = recordsOf(run(armOptions(argvClaude().bin, { readingsDir: dir })));
    const graded = records.find((r) => r.metric === 'success-rate-readings-median');
    expect(graded).toMatchObject({ median: 0.9, samples: 3, gate: { min: 0.8 } });
    expect(graded?.detail).toMatchObject({ min: 0.7, max: 1 });
    const tokens = records.find((r) => r.metric === 'tokens-per-task-readings-median');
    expect(tokens).toMatchObject({ median: 1000, samples: 3 });
    expect(tokens?.detail).toMatchObject({ min: 600, max: 3000 });
  });

  it('grades nothing below that many readings', () => {
    const dir = scratchDir('arm-readings-');
    reading(dir, '2026-11-01-aaaaaaa-100000-local.json', 0.9, 1000);
    const records = recordsOf(run(armOptions(argvClaude().bin, { readingsDir: dir })));
    expect(records.map((r) => r.metric)).not.toContain('success-rate-readings-median');
  });
});

describe('`npm run bench -- --axis agent --arm oxmutate`', () => {
  it('parses the arm, and runs it only as the agent axis alone', () => {
    expect(parseArgs(['--axis', 'agent', '--arm', 'oxmutate'])).toMatchObject({ axes: ['agent'], arm: 'oxmutate' });
    expect(parseArgs(['--axis', 'agent'])).not.toHaveProperty('arm');
    expect(() => parseArgs(['--arm', 'oxmutate'])).toThrow(/--axis agent/u);
    expect(() => parseArgs(['--axis', 'agent', '--axis', 'perf', '--arm', 'oxmutate'])).toThrow(/--axis agent/u);
  });

  it('builds a document with no band and no claim: those read the demo\'s variants', () => {
    const records: BenchRecord[] = [{ axis: 'agent', variant: 'oxmutate', metric: 'success-rate', unit: 'ratio', samples: 20, median: 1, p95: 1 }];
    const input = { suite: SUITE.agent, commit: 'abcdef1234', machine: { ci: false }, measured: '2026-11-01T14:22:33.000Z', axes: { agent: { status: 'measured' as const } }, records };
    const doc = buildDocument({ ...input, arm: 'oxmutate' });
    expect(doc).toMatchObject({ arm: 'oxmutate', bands: {}, claims: {} });
    // Without the arm, the same records are refused: the demo's bands still demand their records.
    expect(() => buildDocument(input)).toThrow(/burgee/u);
    // One name per reading, so three readings of one commit on one day are three files; never the published name.
    expect(resultsName(doc, true)).toBe('2026-11-01-abcdef1-142233-local.json');
  });
});

/** A workflow line that would run the arm: `--arm`, in any spelling a shell passes it. */
const RUNS_AN_ARM = /--arm(?:[\s=]|$)/mu;

/** Every file under `dir`, recursively. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * The owner, 2026-11-01: "No oxmutate in GHA" (PR #1421). The axis refuses the arm under
 * `GITHUB_ACTIONS` (above); this holds that no workflow or action asks for it in the first place.
 */
describe('no GitHub Actions workflow runs the oxmutate arm', () => {
  it('no file under .github/ passes --arm to the bench', () => {
    const offenders = filesUnder(join(REPO, '.github')).filter((f) => !f.includes('node_modules') && RUNS_AN_ARM.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('is not blind: it catches the command that runs the arm, and passes the B1 job as it is', () => {
    for (const line of ['npm run bench -- --axis agent --arm oxmutate', 'npm run bench -- --axis agent --arm=oxmutate --check', 'npx tsx benchmarks/run.ts --axis agent --arm "$ARM"']) {
      expect(RUNS_AN_ARM.test(line), line).toBe(true);
    }
    for (const line of ['npm run bench -- --axis agent --check 2>&1 | tee agent.log', 'BENCH_AGENT_MCP: 1', '--armed']) {
      expect(RUNS_AN_ARM.test(line), line).toBe(false);
    }
  });
});
