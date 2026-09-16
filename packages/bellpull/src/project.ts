/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One {@link Result}, three renderings — design R5, PRINCIPLES rule 6 (static projections)
 * and rule 5 (every caller first-class).
 *
 * The three callers of a CLI subprocess are a person reading a terminal, a script reading
 * `--json`, and an agent reading an event stream. Today each of them is served by a
 * different `console.log` somewhere in the program, which is why a `--json` flag so often
 * reports something subtly different from what the human output said: the two were
 * assembled separately from the same facts.
 *
 * Here all three are **derived from one value**. Nothing formats twice, so nothing can
 * disagree — and an agent reading `toEvent` is reading the same record the human saw, not a
 * summary of it.
 */
import { type Result } from './run.js';

/**
 * The outcome as one word — the branch a caller actually writes.
 *
 * Derived once, here, and used by both {@link format} and {@link toEvent}. Deriving it twice
 * is how the precedence between `timedOut` and `signal` ends up different in the human output
 * and the agent stream, which is the exact disagreement this module exists to prevent.
 */
export type Outcome = 'ok' | 'failed' | 'timedOut' | 'signalled';

export function outcomeOf(result: Result): Outcome {
  if (result.timedOut) return 'timedOut';
  if (result.ok) return 'ok';
  return result.signal === null ? 'failed' : 'signalled';
}

/** The first line, per outcome. */
function headline(result: Result): string {
  switch (outcomeOf(result)) {
    case 'ok': {
      return `ok  ${result.command} (${result.duration} ms)`;
    }
    case 'timedOut': {
      return `timed out  ${result.command} after ${result.duration} ms`;
    }
    case 'signalled': {
      return `killed  ${result.command} by ${String(result.signal)} after ${result.duration} ms`;
    }
    default: {
      return `failed  ${result.command} exited ${String(result.code)} after ${result.duration} ms`;
    }
  }
}

/** Where the executable came from, when it is known — the half that ends investigations. */
function provenance(result: Result): string {
  const found = result.executable;
  if (found === undefined) return '';
  const from = found.from === '' ? '' : ` (from ${found.from})`;
  return `\n     ${found.path}${from}`;
}

/** How a result reads to a person: one line, and the failure's output when there is one. */
export function format(result: Result): string {
  const head = headline(result);
  // The path is the half of the line that ends investigations, so it is on the human form
  // and not only in the JSON: "which node ran" is the question, and it now has an answer.
  const where = provenance(result);
  // stderr when there is any, stdout otherwise: a program that reports its failure on stdout
  // is common enough that showing an empty stderr instead would hide the reason.
  const said = result.stderr === '' ? result.stdout : result.stderr;
  const trailing = result.ok ? '' : tail(said);
  return `${head}${where}${trailing}`;
}

/** The last few lines of the output, which is the part that says what went wrong. */
const TAIL_LINES = 10;
function tail(text: string): string {
  const lines = text.trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') return '';
  const shown = lines.slice(-TAIL_LINES);
  return `\n${shown.map((l) => `     ${l}`).join('\n')}`;
}

/** The `--json` envelope: the record, flat, with nothing computed that is not in it. */
export function toJson(result: Result): Record<string, unknown> {
  return {
    ok: result.ok,
    code: result.code,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.duration,
    command: result.command,
    args: [...result.args],
    executable: result.executable === undefined ? null : { path: result.executable.path, from: result.executable.from },
    timedOut: result.timedOut,
  };
}

/** One event on an agent stream. `type` is what a consumer switches on. */
export interface RunEvent {
  type: 'run';
  outcome: Outcome;
  command: string;
  args: readonly string[];
  code: number | null;
  signal: string | null;
  durationMs: number;
  executable: string | null;
  /** Where the executable came from, so an agent can report a `PATH` surprise itself. */
  from: string | null;
}

/** The agent form: {@link outcomeOf}'s one word, plus the record's own fields. */
export function toEvent(result: Result): RunEvent {
  return {
    type: 'run',
    outcome: outcomeOf(result),
    command: result.command,
    args: result.args,
    code: result.code,
    signal: result.signal,
    durationMs: result.duration,
    executable: result.executable?.path ?? null,
    from: result.executable?.from ?? null,
  };
}
