#!/usr/bin/env tsx
/**
 * B1, the half that needs no model — `cli-benchmarks` R2's honest fallback, built first.
 *
 * The full B1 spawns `claude -p` against each demo and counts tokens and turns. That needs
 * a model, credentials and a weekly workflow, and until it exists the family's agent claim
 * has **no number at all** — which is worse than a partial one. Everything an agent's
 * success actually turns on can be measured without a model, deterministically, in seconds:
 *
 *   - **hangs** — a CLI that waits for a human under a pipe is a failed task, every time;
 *   - **exit-code discipline** — 2 for "your command is wrong, fix it" against 1 for
 *     "it ran and failed, maybe retry". An agent that cannot tell them apart retries a
 *     usage error until it gives up;
 *   - **structured output** — whether `--json` produces something `JSON.parse` accepts,
 *     rather than help text an agent has to scrape;
 *   - **recovery bytes** — how much output an agent must read to learn what to do next.
 *     This is the token proxy the design names, and it is measured rather than modelled.
 *
 * Every run is non-TTY with stdin closed, because that is the only environment an agent
 * ever gets. Variants are the three reference demos: the same CLI on burgee, on commander
 * and on yargs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** A CLI under test: the same demo, built on each engine. */
export interface Variant {
  id: string;
  /** The layer this variant is built on, which is what the comparison is *of*. */
  layer: string;
  bin: string;
}

export const VARIANTS: Variant[] = [
  { id: 'demo-burgee', layer: 'burgee', bin: 'examples/demo-cli-burgee/dist/bin.js' },
  { id: 'demo-commander', layer: 'commander', bin: 'examples/demo-cli-commander/dist/bin.js' },
  { id: 'demo-yargs', layer: 'yargs', bin: 'examples/demo-cli-yargs/dist/bin.js' },
];

/**
 * What an agent is asked to do, and what "it worked" means.
 *
 * `expect` is the *class* of outcome, not an exact string: the point is never that three
 * CLIs print the same words, it is whether an agent can tell what happened.
 */
export interface Task {
  id: string;
  args: string[];
  expect: 'ok' | 'usage-error' | 'runtime-error';
  /** Whether the run asks for machine-readable output, so its stdout must parse. */
  json: boolean;
}

export const TASKS: Task[] = [
  { id: 'greet-ok', args: ['greet', 'ada'], expect: 'ok', json: false },
  { id: 'greet-ok-json', args: ['greet', 'ada', '--json'], expect: 'ok', json: true },
  { id: 'greet-missing-arg', args: ['greet'], expect: 'usage-error', json: false },
  { id: 'greet-missing-arg-json', args: ['greet', '--json'], expect: 'usage-error', json: true },
  { id: 'unknown-command', args: ['frobnicate'], expect: 'usage-error', json: false },
  { id: 'unknown-flag', args: ['greet', 'ada', '--nope'], expect: 'usage-error', json: false },
  { id: 'config-get-ok-json', args: ['config', 'get', 'greeting', '--json'], expect: 'ok', json: true },
  { id: 'config-get-missing-key', args: ['config', 'get'], expect: 'usage-error', json: false },
  { id: 'runtime-failure', args: ['fail'], expect: 'runtime-error', json: false },
  { id: 'runtime-failure-json', args: ['fail', '--json'], expect: 'runtime-error', json: true },
];

/** Long enough that a slow machine is not a hang; short enough that a hang is not a wait. */
const TIMEOUT_MS = 5_000;
/** Exit codes an agent can act on: 0 worked, 2 is yours to fix, anything else is theirs. */
const EXIT = { ok: 0, usage: 2 } as const;

export interface RunOutcome {
  hung: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * One non-TTY run. `stdin: 'ignore'` is the whole point — a CLI that would have prompted
 * gets no terminal and no input, which is exactly what happens inside an agent.
 */
export function runOnce(bin: string, args: string[]): RunOutcome {
  const result = spawnSync(process.execPath, [resolve(ROOT, bin), ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  });
  return {
    // A timeout kills with a signal and leaves no status; that is a hang.
    hung: result.error?.name === 'Error' && String(result.error.message).includes('ETIMEDOUT'),
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export interface Judgement {
  hung: boolean;
  /** The exit code told the agent the right *kind* of thing. */
  exitCorrect: boolean;
  /** `--json` was asked for and the envelope parsed. `null` when the task did not ask. */
  jsonParsed: boolean | null;
  /** Bytes an agent must read to learn what happened. */
  bytes: number;
}

/**
 * Judge one run against what the task expected.
 *
 * The exit-code rule is the load-bearing one: an agent's next move is decided by it. `0`
 * means it worked; `2` means the command was wrong and the agent should rewrite it; any
 * other non-zero means the command was right and the world was not, so a retry might help.
 * A CLI that answers `1` to both has told the agent nothing.
 */
/**
 * An *envelope*, not merely valid JSON. `JSON.parse('42')` succeeds, and a CLI that printed
 * a bare number would otherwise score as machine-readable; an agent needs a shape it can
 * address by key. Nothing in the current task set hits that case — this is here so a future
 * one cannot pass by accident.
 */
const parses = (text: string): boolean => {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
};

export function judge(task: Task, run: RunOutcome): Judgement {
  const output = run.stdout + run.stderr;
  const exitCorrect =
    run.hung ? false
    : task.expect === 'ok' ? run.status === EXIT.ok
    : task.expect === 'usage-error' ? run.status === EXIT.usage
    : run.status !== null && run.status !== EXIT.ok && run.status !== EXIT.usage;

  // stdout when it worked, stderr when it did not: a machine-readable *error* belongs on
  // stderr, and burgee puts it there. Parsing only stdout would have scored a correctly
  // placed envelope as a failure — which it did, until this read both.
  let jsonParsed: boolean | null = null;
  if (task.json) jsonParsed = parses(run.stdout) || parses(run.stderr);
  return { hung: run.hung, exitCorrect, jsonParsed, bytes: output.length };
}

export interface VariantResult {
  variant: string;
  layer: string;
  runs: number;
  /** The headline: a hang is a failed task every time, so this is the number to beat. */
  hangsPer100: number;
  exitCodeAccuracy: number;
  /** Of the tasks that asked for `--json`, the share whose stdout parsed. */
  structuredOutputRate: number;
  /** Median bytes an agent reads per task. Lower is cheaper, in tokens and in attention. */
  medianBytes: number;
  perTask: { task: string; hung: boolean; exitCorrect: boolean; jsonParsed: boolean | null; bytes: number }[];
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
};

const rate = (hits: number, of: number): number => (of === 0 ? 1 : Number((hits / of).toFixed(4)));

export function measure(variant: Variant, tasks: Task[] = TASKS): VariantResult {
  const perTask = tasks.map((task) => ({ task: task.id, ...judge(task, runOnce(variant.bin, task.args)) }));
  const jsonTasks = perTask.filter((r) => r.jsonParsed !== null);
  const PER_100 = 100;
  return {
    variant: variant.id,
    layer: variant.layer,
    runs: perTask.length,
    hangsPer100: Number(((perTask.filter((r) => r.hung).length / perTask.length) * PER_100).toFixed(2)),
    exitCodeAccuracy: rate(perTask.filter((r) => r.exitCorrect).length, perTask.length),
    structuredOutputRate: rate(jsonTasks.filter((r) => r.jsonParsed === true).length, jsonTasks.length),
    medianBytes: median(perTask.map((r) => r.bytes)),
    perTask,
  };
}

export function run(): { axis: string; measured: string; variants: VariantResult[]; median: Record<string, number> } {
  const built = VARIANTS.filter((v) => existsSync(resolve(ROOT, v.bin)));
  if (built.length !== VARIANTS.length) {
    const missing = VARIANTS.filter((v) => !existsSync(resolve(ROOT, v.bin))).map((v) => v.id);
    throw new Error(`build the demos first — missing: ${missing.join(', ')}`);
  }
  const variants = built.map((v) => measure(v));
  const ours = variants.find((v) => v.layer === 'burgee');
  return {
    axis: 'agent-reliability',
    measured: new Date().toISOString().slice(0, 'YYYY-MM-DD'.length),
    variants,
    // What the control bands read. Ours, not the field's: a band watches *our* number.
    median: {
      hangsPer100: ours?.hangsPer100 ?? 0,
      exitCodeAccuracy: ours?.exitCodeAccuracy ?? 0,
      structuredOutputRate: ours?.structuredOutputRate ?? 0,
      bytes: ours?.medianBytes ?? 0,
    },
  };
}
