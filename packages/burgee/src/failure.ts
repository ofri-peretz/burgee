/**
 * What a failed run says, and with which exit code — kept off the entry point that runs it (U5).
 *
 * `execute.ts` reaches this module through `await import()` from its `catch` and nowhere else,
 * so a run that succeeds never loads a byte of it: the classification table, the refusal
 * lookup, the envelope and the prose all sit in their own chunk, fetched on the path that
 * prints them. The failure path was already asynchronous — `describeFailure` awaited
 * `unknown-option.js` — so moving it here costs a microtask on a run that is about to exit
 * non-zero and nothing on one that is not.
 */
import { ConfigError } from 'seniority/precedence';

import { AuthError, UsageError } from './errors.js';
import { ExitCode, isExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type ActionRequiredSpec, type CommandNode, type Manifest } from './manifest.js';
import { kebab } from './names.js';

/**
 * parseArgs reports every malformed-argv case with an ERR_PARSE_ARGS_* code. Each one is
 * the caller mistyping something, which is USAGE (2) — never RUNTIME (1), because 1 is
 * the code an agent reads as "the command ran and failed".
 */
function isParseArgsFailure(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const { code } = cause as Error & { code?: unknown };
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
}

/** `ctx.exit(code)` or a harness exit: an E1 code to honour, with nothing to print. */
function exitSignal(cause: unknown): ExitCodeType | undefined {
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'number' && isExitCode(code) ? code : undefined;
}

export interface Failure {
  code: ExitCodeType;
  message: string;
  hint?: string;
  /** E3 — the exact command or flag to run next, where one exists. Never a guess. */
  fix?: string;
  /** An exit signal: honour the code, print nothing. */
  silent?: boolean;
  /** N11: the caller must act; carried into the envelope with the runnable `next[]`. */
  action?: ActionRequiredSpec;
}

/**
 * The error classes that name their own exit code — a table rather than a chain of
 * `instanceof`, which is the shape E7 asks for: an author classifies an error and the
 * framework maps it to a stable code.
 *
 * Order is the answer when a class extends another; none of these do today, and `find` takes
 * the first match so the list is the precedence if one ever does. **`AuthError` sits apart from
 * `ConfigError` on purpose**: a missing credential is not a broken config file. `CONFIG` says
 * *fix the runner* and `AUTH` says *get a credential*, which are different actions, and
 * collapsing them is what having one code for everything looks like.
 */
const CLASSIFIED: readonly (readonly [new (...args: never[]) => Error, ExitCodeType])[] = [
  [UsageError, ExitCode.USAGE],
  [AuthError, ExitCode.AUTH],
  [ConfigError, ExitCode.CONFIG],
];

/** The refusals a thrown value may name by string; `RUNTIME` is the default, never a claim. */
// A Map, not an object: `'toString' in {…}` is true, and a thrown `{ code: 'toString' }` must not claim anything.
const NAMED: ReadonlyMap<unknown, ExitCodeType> = new Map([
  ['USAGE', ExitCode.USAGE],
  ['CONFIG', ExitCode.CONFIG],
  ['CANCELLED', ExitCode.CANCELLED],
  ['AUTH', ExitCode.AUTH],
]);

function namedCode(cause: unknown): ExitCodeType | undefined {
  return NAMED.get((cause as { code?: unknown } | null | undefined)?.code);
}

/** What went wrong, in words: an Error's message, a refusal object's `message`, or the value itself. */
function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  const said = (cause as { message?: unknown } | null | undefined)?.message;
  return typeof said === 'string' ? said : String(cause);
}

/** `hint` and `fix` off an error that carries them, and nothing when it does not (E3). */
function carried(cause: unknown): { hint?: string; fix?: string } {
  const { hint, fix } = (cause ?? {}) as { hint?: unknown; fix?: unknown };
  return {
    ...(typeof hint === 'string' ? { hint } : {}),
    ...(typeof fix === 'string' ? { fix } : {}),
  };
}

/**
 * E2/E3 — a usage error never prints a stack, a runtime failure never prints help.
 *
 * `action` is the spec of a `ctx.actionRequired(…)` unwind, which the engine recognises by its
 * own class and hands over; the class stays in `execute.ts` because a handler throws it on the
 * startup path.
 */
export async function describeFailure(cause: unknown, argv: string[], node: CommandNode | undefined, action: ActionRequiredSpec | undefined): Promise<Failure> {
  const signal = exitSignal(cause);
  if (signal !== undefined) return { code: signal, message: '', silent: true };
  const message = messageOf(cause);
  if (action !== undefined) return { code: ExitCode.CANCELLED, message, action, ...(action.hint === undefined ? {} : { hint: action.hint }) };
  const named = CLASSIFIED.find(([Class]) => cause instanceof Class);
  if (named !== undefined) return { code: named[1], message, ...carried(cause) };
  // E7 — an author's own class, from `defineError`: its declared code, read off
  // `Symbol.for('burgee.exitCode')` on the instance's class (or a parent — statics inherit), and
  // rendered like the built-in ones. By symbol, not by import: the engine never loads
  // `define-error.js`, so a program that defines no error pays for this read and nothing else.
  const own = (cause as { constructor?: Record<symbol, unknown> } | null | undefined)?.constructor?.[Symbol.for('burgee.exitCode')];
  if (typeof own === 'number') return { code: own as ExitCodeType, message, ...carried(cause) };
  // P2 / P3 / D-120 — a refusal that names its contract code by string (`code: 'USAGE'`,
  // `'CANCELLED'`, …) leaves with that code. It is how caique's prompt verdicts reach an exit
  // status with no dependency edge between the two packages: caique returns
  // `{ code, message, fix }`, the handler throws it, and nothing here imports caique.
  const byName = namedCode(cause);
  if (byName !== undefined) return { code: byName, message, ...carried(cause) };
  if (isParseArgsFailure(cause)) {
    // Loaded only here: see unknown-option.ts for why none of this is imported.
    const explain = await import('./unknown-option.js');
    const dash = explain.singleDashHint(argv);
    if (dash !== undefined) return { code: ExitCode.USAGE, message, hint: dash };
    // The flags as typed, not the canonical keys: `fix` is run verbatim, and `--dryRun` is refused.
    const better = explain.unknownOption(cause, Object.keys(node?.options ?? {}).map(kebab));
    return { code: ExitCode.USAGE, message, hint: 'run --help to see the available options', ...better };
  }
  return { code: ExitCode.RUNTIME, message };
}

function textFailure(failure: Failure): string {
  const hint = failure.hint === undefined ? '' : `hint: ${failure.hint}\n`;
  const fix = failure.fix === undefined ? '' : `fix: ${failure.fix}\n`;
  if (failure.action !== undefined) {
    const next = (failure.action.next ?? []).map((n) => `  ${n.command}    ${n.when}\n`).join('');
    return `action required (${failure.action.reason}): ${failure.message}\n${next === '' ? '' : `next:\n${next}`}${hint}`;
  }
  return `error: ${failure.message}\n${hint}${fix}`;
}

/** The `next[]` commands as the caller can run them: the program in front, the caller's own `--json` carried (N11). */
function runnableNext(manifest: Manifest, spec: ActionRequiredSpec, json: boolean): { command: string; when: string }[] {
  const program = manifest.rootPath.join(' ');
  return (spec.next ?? []).map((n) => ({ command: `${program} ${n.command}${json && !n.command.includes('--json') ? ' --json' : ''}`, when: n.when }));
}

/**
 * What a described failure prints: under `--json` the envelope, for stdout; otherwise the prose,
 * for stderr. The caller picks the stream by the same `json` it passes here (O1, D-140).
 */
export function failureText(failure: Failure, manifest: Manifest, json: boolean): string {
  if (failure.action !== undefined) {
    const next = runnableNext(manifest, failure.action, json);
    const rendered: Failure = { ...failure, action: { ...failure.action, next } };
    const body = { ok: false, status: 'action_required', reason: failure.action.reason, message: failure.message, next, hint: failure.hint, error: { code: failure.code, message: failure.message } };
    return json ? `${JSON.stringify(body)}\n` : textFailure(rendered);
  }
  // E3 — `fix` beside `hint`: the exact flag or command, omitted rather than guessed.
  const body = { code: failure.code, message: failure.message, hint: failure.hint, ...(failure.fix === undefined ? {} : { fix: failure.fix }) };
  return json ? `${JSON.stringify({ ok: false, error: body })}\n` : textFailure(failure);
}
