/**
 * B1 — what an agent spends to get a task done, on a CLI that meets the floor versus one
 * that does not.
 *
 * **This axis does not run in this repository today, and it says so rather than
 * estimating.** It needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` and the `claude`
 * binary; without either it returns a reason and `run.ts` marks the axis `skipped`, which
 * `emit.ts` turns into a band entry carrying that reason instead of a number. Nothing in
 * this file can produce a plausible-looking figure from a run that did not happen — that
 * is deliberate, and `emit.test.ts` proves it: the roadmap's headline claim ("≥40% fewer
 * tokens and ≥30% fewer turns") has never been measured, and a suite that quietly
 * extrapolated it would be worse than the suite not existing.
 *
 * Everything that does not need the credential is exercised: `parseClaudeJson` is pinned
 * against a canned response, `runOne` **and `run()` itself** are driven end to end against
 * a stub `claude` binary (`agent.test.ts`), and every task's `check` is proved to fail on
 * the un-run state (`tasks.test.ts`). `run()` is on that list deliberately: the honesty
 * rule in `emit.ts` can prove a band value came from a record produced by a measured
 * axis, but not that the axis produced that record by measuring anything — a `run()`
 * returning a table of plausible numbers would pass every other check in the repository.
 * What remains untested is the model's behaviour, which is the thing the credential buys.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { median, p95, round } from '../stats.js';

const BENCH_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = resolve(BENCH_ROOT, '..');
const TASKS_DIR = join(BENCH_ROOT, 'tasks');

export interface Task {
  id: string;
  requirement: string;
  prompt: string;
  setup: string[];
  check: string;
  maxTurns: number;
}

/**
 * The two builds under test. The repo stopped being "a layer over commander" on
 * 2026-09-06 and became the engine, so `LAYER=off` is no longer a build flag: the honest
 * off-state is the same demo program on commander, which has none of the floor — no
 * `--schema`, no `{ ok, data }` envelope, no provenance, help text on a runtime failure.
 * One variable, two bins the repo already builds and the conformance suite already
 * proves behave identically where the floor does not apply.
 */
export interface Variant {
  id: string;
  /** Repo-relative, or absolute when a test supplies its own. */
  bin: string;
  /** Whether this build meets the agent-native floor: the one variable under test. */
  floor: boolean;
}

export const VARIANTS: readonly Variant[] = [
  { id: 'burgee', bin: 'examples/demo-cli-burgee/dist/bin.js', floor: true },
  { id: 'commander', bin: 'examples/demo-cli-commander/dist/bin.js', floor: false },
];

export type VariantId = string;

export interface ClaudeUsage {
  tokensIn: number;
  tokensOut: number;
  turns: number;
  isError: boolean;
  result: string;
}

const NUMBER_FIELDS = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'] as const;

/** A missing usage field reads as zero, never NaN: one NaN poisons a median. */
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/**
 * `claude -p --output-format json` reports usage in its own shape. Cache reads are input
 * tokens the run actually consumed, so they are counted: leaving them out would make a
 * cached run look free, and a benchmark that rewards caching is measuring the cache.
 *
 * "Turns" is `num_turns` as the CLI reports it — the definition is the CLI's, recorded in
 * `results.schema.json`, so nobody has to guess later what the number counted.
 */
export function parseClaudeJson(stdout: string): ClaudeUsage {
  const raw = JSON.parse(stdout) as Record<string, unknown>;
  const usage = (raw['usage'] ?? {}) as Record<string, unknown>;
  const tokensIn = NUMBER_FIELDS.reduce((sum, f) => sum + num(usage[f]), 0);
  return {
    tokensIn,
    tokensOut: num(usage['output_tokens']),
    turns: num(raw['num_turns']),
    isError: raw['is_error'] === true,
    result: typeof raw['result'] === 'string' ? raw['result'] : '',
  };
}

export const readTasks = (): Task[] =>
  readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .toSorted()
    .map((f) => JSON.parse(readFileSync(join(TASKS_DIR, f), 'utf8')) as Task);

/** A scratch PATH holding one executable called `mytool`, so the prompt can name it. */
export function installTool(binPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'bench-tool-'));
  const shim = join(dir, 'mytool');
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${binPath}" "$@"\n`);
  const EXECUTABLE = 0o755;
  chmodSync(shim, EXECUTABLE);
  return dir;
}

export interface RunOne {
  claudeBin: string;
  task: Task;
  toolDir: string;
  workdir: string;
  model: string;
  timeoutMs: number;
}

export interface Attempt extends ClaudeUsage {
  success: boolean;
  transcript: string;
}

const SHELL = '/bin/sh';

/**
 * A task's `check` and its `setup` are POSIX shell one-liners, and the tool is installed
 * as a `#!/bin/sh` shim on `PATH` — so the B1 harness runs on POSIX and says so, rather
 * than half-running on Windows and reporting failures that are the harness's own.
 */
export const POSIX_ONLY = 'the B1 harness runs task checks through /bin/sh; this platform is win32';
export const isPosix = (platform: string = process.platform): boolean => platform !== 'win32';

/**
 * One task, once. The agent sees Bash on `mytool` and nothing else (intent constraint 2):
 * no file reads, so the CLI's own output is the only channel through which it can learn
 * anything — which is the whole hypothesis under test.
 */
export function runOne(opts: RunOne): Attempt {
  const { claudeBin, task, toolDir, workdir, model, timeoutMs } = opts;
  for (const cmd of task.setup) execFileSync(SHELL, ['-c', cmd], { cwd: workdir, stdio: 'ignore' });
  const argv = ['-p', task.prompt, '--allowedTools', 'Bash(mytool:*)', '--max-turns', String(task.maxTurns), '--output-format', 'json', '--model', model];
  const r = spawnSync(claudeBin, argv, {
    cwd: workdir,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, PATH: `${toolDir}:${process.env['PATH'] ?? ''}` },
  });
  const transcript = r.stdout ?? '';
  // A run that timed out or died has no usage to report and is a failed task, not a
  // zero-token success: `success: false` with no numbers is the honest record of it.
  if (r.status !== 0 || transcript === '') {
    return { tokensIn: 0, tokensOut: 0, turns: 0, isError: true, result: '', success: false, transcript };
  }
  const usage = parseClaudeJson(transcript);
  const resultFile = join(workdir, '.bench-result');
  writeFileSync(resultFile, usage.result);
  const check = spawnSync(SHELL, ['-c', task.check], {
    cwd: workdir,
    env: { ...process.env, BENCH_RESULT: resultFile, BENCH_EXIT: String(r.status) },
    stdio: 'ignore',
  });
  return { ...usage, success: !usage.isError && check.status === 0, transcript };
}

/**
 * Every reason this axis cannot run, checked before anything is spawned or spent.
 *
 * The three inputs are parameters rather than globals so that `agent.test.ts` can drive
 * the real `run()` end to end against a stub `claude` and two stub bins — see the note on
 * `run()`. Defaults are the real environment, so nothing about production behaviour
 * changes.
 */
export function blockers(env: NodeJS.ProcessEnv = process.env, claudeBin = 'claude', variants: readonly Variant[] = VARIANTS): string[] {
  const reasons: string[] = [];
  if (!isPosix()) reasons.push(POSIX_ONLY);
  if (env['ANTHROPIC_API_KEY'] === undefined && env['CLAUDE_CODE_OAUTH_TOKEN'] === undefined) {
    reasons.push('no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in the environment');
  }
  if (spawnSync(claudeBin, ['--version'], { stdio: 'ignore' }).status !== 0) reasons.push(`the \`${claudeBin}\` binary is not on PATH`);
  for (const v of variants) {
    if (!existsSync(resolve(REPO_ROOT, v.bin))) reasons.push(`${v.bin} is not built`);
  }
  return reasons;
}

const RUNS_PER_TASK = 5;
const DEFAULT_TIMEOUT_MS = 300_000;
/**
 * Pinned by id in every results file, and a change starts a new band history: the same
 * task costs a different number of tokens on a different model, so a series that mixed
 * two models would be a series of nothing.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-5';

const RATIO_PLACES = 3;
/** See the gate below: a floor on the harness, not on the model. */
const SUCCESS_FLOOR = 0.8;
const tokensOf = (a: Attempt): number => a.tokensIn + a.tokensOut;
const turnsOf = (a: Attempt): number => a.turns;

/**
 * The before/after the article is: the layered build's median against the plain build's,
 * for tokens and for turns. These are the records the roadmap's ≥40% / ≥30% claim is
 * settled against, and they are the reason the two variants are run in one invocation —
 * a ratio between two numbers measured on different days by different model versions
 * would not be a comparison of the CLIs.
 */
function ratioRecords(byVariant: Map<VariantId, Attempt[]>, model: string): BenchRecord[] {
  const ours = byVariant.get('burgee') ?? [];
  const theirs = byVariant.get('commander') ?? [];
  if (ours.length === 0 || theirs.length === 0) return [];
  const ratio = (pick: (a: Attempt) => number): number => round(median(ours.map(pick)) / median(theirs.map(pick)), RATIO_PLACES);
  const common = { axis: 'agent', variant: 'burgee ÷ commander', unit: 'ratio', samples: Math.min(ours.length, theirs.length), detail: { model } } as const;
  return [
    { ...common, metric: 'tokens-per-task-ratio', median: ratio(tokensOf), p95: ratio(tokensOf), note: 'median tokens on the floor-meeting build over median tokens on the plain one; 0.6 or below confirms the ≥40% claim' },
    { ...common, metric: 'turns-per-task-ratio', median: ratio(turnsOf), p95: ratio(turnsOf), note: 'median turns on the floor-meeting build over median turns on the plain one; 0.7 or below confirms the ≥30% claim' },
  ];
}

function variantRecords(variant: VariantId, attempts: Attempt[], model: string): BenchRecord[] {
  const tokens = attempts.map(tokensOf);
  const turns = attempts.map(turnsOf);
  const successes = attempts.filter((a) => a.success).length;
  const rate = round(successes / attempts.length, RATIO_PLACES);
  const common = { axis: 'agent', variant, samples: attempts.length, detail: { model } } as const;
  return [
    // p95 is the 95th percentile, not a second copy of the median. It was the latter, so
    // the field labelled p95 in a banded results document carried the median — and the
    // one thing a tail statistic is for, showing that a median is hiding a long tail,
    // was structurally impossible to see.
    { ...common, metric: 'tokens-per-task', unit: 'tokens', median: median(tokens), p95: p95(tokens), note: `median over ${String(attempts.length)} task-runs on model ${model}` },
    { ...common, metric: 'turns-per-task', unit: 'turns', median: median(turns), p95: p95(turns), note: "`num_turns` as `claude -p --output-format json` reports it" },
    {
      ...common,
      metric: 'success-rate',
      unit: 'ratio',
      median: rate,
      p95: rate,
      // The only gated record on this axis, and it gates the harness rather than the
      // model: a run where a third of the tasks failed still produces tokens and turns
      // medians, and those medians are then medians over whichever runs happened to
      // survive. Without this the document builds cleanly and the band moves for a
      // reason nothing records. The floor is provisional — B1 has never run, so it is
      // set from what the harness must clear to be worth reading, and the first measured
      // run is where it gets set from data.
      gate: { min: SUCCESS_FLOOR, why: 'below this the tokens and turns medians are taken over whichever task-runs happened to survive, which is a different measurement from the one the band is watching' },
      note: `${String(successes)} of ${String(attempts.length)} task-runs passed their own check`,
      detail: { model, failed: attempts.length - successes },
    },
  ];
}

export interface AgentOptions {
  runs?: number;
  model?: string;
  timeoutMs?: number;
  claudeBin?: string;
  /** Injected by `agent.test.ts`; the real run uses the real ones. */
  variants?: readonly Variant[];
  env?: NodeJS.ProcessEnv;
  tasks?: readonly Task[];
}

/**
 * The whole axis, and — because every parameter above has a real default — the same
 * function `agent.test.ts` drives end to end against a stub `claude` and two stub bins.
 *
 * That matters more here than anywhere else in the suite. `emit.ts` can prove a band
 * value came from a record produced by a measured axis; it cannot prove the axis produced
 * that record by measuring anything, and replacing this function's body with a table of
 * plausible numbers would satisfy every other check in the repository. `runOne` was
 * already pinned that way. This is the wiring above it: tasks in, attempts out, medians
 * over the attempts that actually came back.
 */
export function run(options: AgentOptions = {}): { records: BenchRecord[] } | { reason: string } {
  const variants = options.variants ?? VARIANTS;
  const claudeBin = options.claudeBin ?? 'claude';
  const stopped = blockers(options.env ?? process.env, claudeBin, variants);
  if (stopped.length > 0) return { reason: stopped.join('; ') };
  const model = options.model ?? DEFAULT_MODEL;
  const runs = options.runs ?? RUNS_PER_TASK;
  const tasks = options.tasks ?? readTasks();
  const records: BenchRecord[] = [];
  const byVariant = new Map<VariantId, Attempt[]>();
  for (const variant of variants) {
    const toolDir = installTool(resolve(REPO_ROOT, variant.bin));
    const attempts: Attempt[] = [];
    for (const task of tasks) {
      for (let i = 0; i < runs; i++) {
        const workdir = mkdtempSync(join(tmpdir(), `bench-${task.id}-`));
        mkdirSync(workdir, { recursive: true });
        attempts.push(runOne({ claudeBin, task, toolDir, workdir, model, timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }));
      }
    }
    // A `claude` that authenticates and then fails every single run is the one shape this
    // axis could not previously tell apart from a measurement: `runOne` returns zeros on a
    // dead run, so the axis reported `measured` with a tokens median of 0, a turns median
    // of 0, and a ratio of 0/0. `record.ts` requires a reader to be able to tell "we
    // measured nothing" from "we measured and it was zero", and only the accidental NaN
    // stopped the document — as a crash, not as a skip. Nothing came back, so nothing was
    // measured, and the axis says so the same way a missing credential does.
    if (!attempts.some((a) => a.success)) {
      return { reason: `every one of the ${String(attempts.length)} ${variant.id} task-runs failed; \`claude\` answered but nothing it produced passed a task's own check, so this axis measured nothing` };
    }
    byVariant.set(variant.id, attempts);
    records.push(...variantRecords(variant.id, attempts, model));
  }
  records.push(...ratioRecords(byVariant, model));
  return { records };
}

export const method = `For each of the ${String(readTasks().length)} tasks and each of the two builds, \`claude -p <prompt> --allowedTools 'Bash(mytool:*)' --max-turns <n> --output-format json\` is spawned in a scratch directory with the build installed as \`mytool\`, ${String(RUNS_PER_TASK)} times; the task's own \`check\` decides success. Tokens are input + cache + output as the CLI reports them; turns is its \`num_turns\`. The model is pinned per results file and a change starts a new band history.`;
