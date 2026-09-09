/**
 * B1's deterministic half — what an agent can *act on*, measured without a model.
 *
 * **This is not B1 and does not stand in for it.** `agent.ts` measures tokens and turns,
 * costs money, needs a credential, and skips loudly when it has none; nothing here
 * estimates either number, and the headline claim it defers stays deferred. What this
 * measures is the other thing an agent's success turns on, which happens to need no model
 * at all — whether the CLI's answer is *legible*:
 *
 *   - **hangs** — a CLI that waits for a human under a pipe is a failed task, every time;
 *   - **exit-code discipline** — `2` means *rewrite the command*, any other non-zero means
 *     *the command was fine and the world was not*. A CLI that answers `1` to both has told
 *     the agent nothing, and the agent retries a malformed command until it gives up;
 *   - **structured output** — whether `--json` yields an addressable envelope, on whichever
 *     stream carries it, rather than help text to scrape;
 *   - **recovery bytes** — how much output an agent must read to learn what happened.
 *
 * Every run is non-TTY with stdin closed, because that is the only environment an agent
 * gets. Three variants, one task set: the same demo CLI on burgee, on commander, on yargs.
 *
 * The bytes figure is reported against us and is not gated. burgee reads more than
 * commander because its errors carry a `hint` naming the fix — a trade of bytes per failure
 * against failed turns, which only B1 proper can settle.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type BenchRecord } from '../record.js';
import { median, round } from '../stats.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), '..');

export interface Variant {
  id: string;
  bin: string;
}

/** The same program on three engines. One variable: which engine parsed the argv. */
export const VARIANTS: readonly Variant[] = [
  { id: 'burgee', bin: 'examples/demo-cli-burgee/dist/bin.js' },
  { id: 'commander', bin: 'examples/demo-cli-commander/dist/bin.js' },
  { id: 'yargs', bin: 'examples/demo-cli-yargs/dist/bin.js' },
];

export interface Task {
  id: string;
  args: string[];
  /** The *class* of outcome, never an exact string: three CLIs need not print alike. */
  expect: 'ok' | 'usage-error' | 'runtime-error';
  json: boolean;
}

export const TASKS: readonly Task[] = [
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
const EXIT = { ok: 0, usage: 2 } as const;
const PER_100 = 100;

export interface RunOutcome {
  hung: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

/** One non-TTY run. `stdin: 'ignore'` is the point: no terminal, no input, as for an agent. */
export function runOnce(bin: string, args: readonly string[]): RunOutcome {
  const result = spawnSync(process.execPath, [resolve(REPO_ROOT, bin), ...args], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', CI: '1' },
  });
  return {
    hung: result.error !== undefined && String(result.error.message).includes('ETIMEDOUT'),
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export interface Judgement {
  hung: boolean;
  exitCorrect: boolean;
  /** `null` when the task never asked for JSON, so it cannot dilute the rate. */
  jsonParsed: boolean | null;
  bytes: number;
}

/**
 * An *envelope*, not merely valid JSON. `JSON.parse('42')` succeeds, and a CLI printing a
 * bare number would otherwise score as machine-readable; an agent needs a shape it can
 * address by key.
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

/**
 * Judge one run against the class of outcome its task expected.
 *
 * The exit-code rule is load-bearing: an agent's next move is decided by it. A hang is
 * never a pass, whatever status the killed process left behind.
 */
/** Whether the exit code told the agent the right *class* of thing. */
function exitTellsTheTruth(expect: Task['expect'], status: number | null): boolean {
  if (expect === 'ok') return status === EXIT.ok;
  if (expect === 'usage-error') return status === EXIT.usage;
  return status !== null && status !== EXIT.ok && status !== EXIT.usage;
}

export function judge(task: Task, run: RunOutcome): Judgement {
  // A hang is never a pass, whatever status the killed process left behind.
  const exitCorrect = run.hung ? false : exitTellsTheTruth(task.expect, run.status);

  // stdout when it worked, stderr when it did not: a machine-readable *error* belongs on
  // stderr, and burgee puts it there. Reading stdout alone scored a correctly placed
  // envelope as a failure — which it did, and read as burgee managing 25% on its own
  // headline feature, until this read both.
  return {
    hung: run.hung,
    exitCorrect,
    jsonParsed: task.json ? parses(run.stdout) || parses(run.stderr) : null,
    bytes: run.stdout.length + run.stderr.length,
  };
}

/**
 * R7 for `agent-headroom` R1 — the bytes an agent pays to *discover* a CLI, as opposed to
 * the bytes it pays to recover from one failure.
 *
 * Measured off `--schema` rather than asserted, because a serialisation choice is exactly
 * the kind of thing that gets reverted by a well-meaning "make the output readable" commit
 * and fails no test. Compact serialisation took the large reference demo from 39,512 to
 * 22,964 bytes for a byte-identical parse; a band over this number is what keeps it there.
 *
 * `undefined` for a variant with no machine-readable schema at all — which is both
 * incumbents. That is not a zero and must never be rendered as one: an agent that cannot
 * ask a CLI what commands it has must scrape help text, and the difference between "cheap
 * to discover" and "not discoverable" is not a quantity.
 */
function schemaBytes(bin: string): number | undefined {
  const run = runOnce(bin, ['--schema']);
  if (run.hung || run.status !== 0) return undefined;
  return parses(run.stdout) ? run.stdout.length : undefined;
}

/** Four places: a rate over ten tasks is exact well inside that, and rounding hides drift. */
const RATE_PLACES = 4;
const rate = (hits: number, of: number): number => (of === 0 ? 1 : round(hits / of, RATE_PLACES));

export function measure(variant: Variant, tasks: readonly Task[] = TASKS): BenchRecord[] {
  const verdicts = tasks.map((task) => judge(task, runOnce(variant.bin, task.args)));
  const schema = schemaBytes(variant.bin);
  const asked = verdicts.filter((v) => v.jsonParsed !== null);
  const shared = { axis: 'reliability', variant: variant.id, samples: tasks.length } as const;
  const one = ({ metric, unit, value, note, gate }: { metric: string; unit: string; value: number; note: string; gate?: BenchRecord['gate'] }): BenchRecord => ({
    ...shared,
    metric,
    unit,
    median: value,
    // A deterministic measurement over one task set: p95 of one observation is that
    // observation, stated rather than hidden.
    p95: value,
    note,
    ...(gate === undefined ? {} : { gate }),
  });

  return [
    one({
      metric: 'hangs-per-100',
      unit: 'runs',
      value: round((verdicts.filter((v) => v.hung).length / tasks.length) * PER_100, RATE_PLACES),
      note: 'non-TTY runs, stdin closed, that never exited',
      // The only gate on this axis, and only on ours: a band watches our number, not the
      // field's. A CLI that hangs under a pipe has failed the task and nothing compensates.
      ...(variant.id === 'burgee' ? { gate: { max: 0, why: 'a CLI that waits for a human under a pipe fails an agent task every time' } } : {}),
    }),
    one({ metric: 'exit-code-accuracy', unit: 'ratio', value: rate(verdicts.filter((v) => v.exitCorrect).length, tasks.length), note: '0 ok, 2 usage error, any other non-zero runtime — the class an agent acts on' }),
    one({ metric: 'structured-output-rate', unit: 'ratio', value: rate(asked.filter((v) => v.jsonParsed === true).length, asked.length), note: 'of the tasks that asked for --json, those that produced an addressable envelope' }),
    one({ metric: 'recovery-bytes', unit: 'bytes', value: median(verdicts.map((v) => v.bytes)), note: 'median bytes an agent reads per task; reported, never gated — a hint costs bytes and may save turns' }),
    // Emitted only where there is a schema to measure. A variant without one contributes no
    // record rather than a zero: see `schemaBytes`.
    ...(schema === undefined ? [] : [one({ metric: 'schema-bytes', unit: 'bytes', value: schema, note: 'bytes of `--schema`, the whole surface an agent reads to discover the CLI; compact by default since agent-headroom R1, `--format=json-pretty` for a person' })]),
  ];
}

export const method =
  'Ten tasks per variant, one spawn each, non-TTY with stdin closed. The same demo program built on burgee, commander and yargs. Exit codes are judged by class (0 ok, 2 usage, other runtime), not by value; `--json` is judged by whether an addressable envelope parses off whichever stream carried it. This is not B1: it measures what an agent can act on, never what it spends. `schema-bytes` is emitted only for a variant that answers `--schema` with a parseable document — neither incumbent has one, and no record is written rather than a zero.';

export function run(): { records: BenchRecord[] } | { reason: string } {
  const missing = VARIANTS.filter((v) => !existsSync(resolve(REPO_ROOT, v.bin)));
  if (missing.length > 0) return { reason: `demo builds missing: ${missing.map((v) => v.id).join(', ')} — run \`npm run build\` first` };
  return { records: VARIANTS.flatMap((v) => measure(v)) };
}
