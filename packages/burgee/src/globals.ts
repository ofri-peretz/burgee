/**
 * agent-lint-conformance R1–R3 — the three global options every command takes: `--no-color` /
 * `--color=<when>`, `--quiet` / `-q`, and `--timeout <duration>` — and `agent-headroom` R3's
 * `--max-bytes <n>`, the row budget on a machine format, read the same way.
 *
 * Read off argv before the command's own parse, beside `--json=` and `--format=agent`, and off
 * the startup path for the same reason (U5): `execute.ts` loads `fields.js`, which calls in here,
 * only when its `readsLazily` test spots one of the words, so a run that types none pays that
 * one test and nothing else. The startup bundle had 3 bytes under its ceiling
 * (`benchmarks/axes/weight.ts`); the parse, the checks and the deadline live here.
 *
 * **A command's own option wins.** A command that declares `color`, `quiet` or `timeout` keeps
 * the word, and the global steps aside for it, the way the engine's `schema` alias steps aside
 * for a program's own `schema` command (D-151). `-q` steps aside for a command that declares
 * `quiet` or gives any option the short flag `q`, and `--quiet` is still the global one then.
 */
import { UsageError } from './errors.js';
import { ExitCode } from './exit-code.js';
import { type CommandNode } from './manifest.js';
import { kebab } from './names.js';

export interface Globals {
  /** argv without the globals this command does not declare itself. */
  args: string[];
  quiet: boolean;
  /** The colour instruction as `roundel/policy` reads argv: `['--color=never']`, or none for `auto`. */
  color: string[];
  /** Aborts when `--timeout` passes; present only when one was typed. */
  signal?: AbortSignal;
  /** The handler's result, or the timeout error once the deadline passes. */
  within: <T>(ran: T | Promise<T>) => Promise<T>;
  /** `--max-bytes`: the budget a machine format is written under, when one was typed. */
  max?: number | undefined;
}

/** A word that may be one of the globals; `globalOf` decides whether it is, for this command. */
// Stryker disable next-line Regex: equivalent — a looser test only sends more words to `globalsOf`, which decides each one itself through `globalOf`
export const isGlobal = (arg: string): boolean => /^(-q|--(no-color|quiet|color|timeout|max-bytes)(=.*)?)$/.test(arg);

/** `--color`'s values; `--schema`'s `global_args` publishes them as the flag's `enum` (clispec-conformance R3). */
export const WHEN = ['always', 'never', 'auto'];
const DURATION = /^([1-9]\d*)(ms|s|m)?$/;
const UNIT: Readonly<Record<string, number>> = { ms: 1, s: 1000, m: 60_000 };
/** The flags that take a value, and the ones that are switches. `no-color` is `--color=never`. */
const VALUED = new Set(['color', 'timeout', 'max-bytes']);
const SWITCHES = new Set(['no-color', 'quiet']);

/** `--timeout`'s duration in milliseconds: `500ms`, `5s`, `2m`, or a bare number of milliseconds. */
export function duration(typed: string): number {
  const match = DURATION.exec(typed);
  if (match === null) throw new UsageError(`--timeout takes a duration such as 500ms, 5s or 2m, not "${typed}"`, 'a bare number is milliseconds; it must be above 0');
  return Number(match[1]) * (UNIT[match[2] ?? 'ms'] as number);
}

/**
 * `--max-bytes`'s budget: a whole number of bytes above 0. Not help's row, on purpose: help's
 * `Global options:` and `--schema`'s `global_args` are one table, and `--schema`'s bytes are banded.
 */
function budgetOf(typed: string): number {
  if (!/^[1-9]\d*$/.test(typed)) throw new UsageError(`--max-bytes takes a whole number of bytes, not "${typed}"`, 'pass a number above 0, such as --max-bytes 4096');
  return Number(typed);
}

/** `--color`'s value as the policy reads it: the flag itself, or nothing for `auto`, which is detection. */
function colorOf(typed: string): string[] {
  if (!WHEN.includes(typed)) throw new UsageError(`--color takes always, never or auto, not "${typed}"`, 'pass --no-color to turn colour off');
  return typed === 'auto' ? [] : [`--color=${typed}`];
}

/** The error a passed deadline leaves with: `TIMEOUT` by name, which `failure.js` maps to the code. */
const timedOut = (ms: number): Error => Object.assign(new Error(`timed out after ${String(ms)} ms`), { code: 'TIMEOUT', hint: 'run it again with a larger --timeout' });

/**
 * The deadline. A plain timer, cleared the moment the handler settles, and **not** unref'd as the
 * spec first wrote: a handler awaiting a promise with nothing behind it holds no handle, and an
 * unref'd timer would let the process exit before the deadline it was asked for.
 */
function deadline(ms: number, controller: AbortController): Globals['within'] {
  return async (ran) =>
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = timedOut(ms);
        controller.abort(error);
        reject(error);
      }, ms);
      const settle = (): void => clearTimeout(timer);
      Promise.resolve(ran).then(
        (value) => (settle(), resolve(value)),
        (error: unknown) => (settle(), reject(error)),
      );
    });
}

/** The global a word names, if this command leaves it global: `color`, `no-color`, `quiet` or `timeout`. */
function globalOf(word: string, node: CommandNode): string | undefined {
  const own = Object.keys(node.options).map(kebab);
  if (word === '-q') return own.includes('quiet') || Object.values(node.options).some((s) => s.short === 'q') ? undefined : 'quiet';
  const name = word.startsWith('--') ? (word.split('=')[0] as string).slice(2) : '';
  if (own.includes(name === 'no-color' ? 'color' : name)) return undefined;
  if (VALUED.has(name) || (SWITCHES.has(name) && !word.includes('='))) return name;
  return undefined;
}

/**
 * The globals in `typed`, read and checked, and the words left for the command's own parse.
 * Nothing after `--` is read: that is the handler's (G5). The later of two colour instructions
 * wins, as the later of `--x` and `--no-x` does (`canonical` in `execute.ts`).
 */
export function globalsOf(typed: readonly string[], node: CommandNode): Globals {
  const args: string[] = [];
  const read: Read = { quiet: false, color: [] };
  for (let at = 0; at < typed.length; at++) {
    const word = typed[at] as string;
    if (word === '--') {
      args.push(...typed.slice(at));
      break;
    }
    const name = globalOf(word, node);
    if (name === undefined) {
      args.push(word);
      continue;
    }
    // `--timeout 5s` spans two words and `--timeout=5s` one.
    const eq = word.indexOf('=');
    let value = '';
    if (VALUED.has(name)) value = eq === -1 ? (typed[++at] ?? '') : word.slice(eq + 1);
    take(read, name, value);
  }
  const { quiet, color, ms, max } = read;
  const given = { args, quiet, color, max };
  // Stryker disable next-line ArrowFunction: equivalent — `execute.ts` takes the handler's own result when `within` gives nothing (`within(ran) ?? ran`)
  if (ms === undefined) return { ...given, within: async (ran) => await ran };
  const controller = new AbortController();
  return { ...given, signal: controller.signal, within: deadline(ms, controller) };
}

/** What the globals said, as they are read. */
interface Read {
  quiet: boolean;
  color: string[];
  ms?: number;
  max?: number;
}

/** One global, checked and recorded: the later of two colour instructions or two deadlines wins. */
function take(read: Read, name: string, value: string): void {
  if (name === 'quiet') read.quiet = true;
  else if (name === 'no-color') read.color = ['--no-color'];
  else if (name === 'color') read.color = colorOf(value);
  else if (name === 'timeout') read.ms = duration(value);
  else read.max = budgetOf(value);
}

/**
 * The globals typed *before* the command — `demo --quiet greet ada` — and the words after them.
 * Read by `surfaces.js` when argv resolved no command because a global came first: it runs the
 * same line with them moved behind the command, where the parse takes them (`Again`).
 */
export function leadingGlobals(typed: readonly string[]): { globals: string[]; words: string[] } {
  const root: CommandNode = { path: [], options: {} };
  let at = 0;
  while (at < typed.length && globalOf(typed[at] as string, root) !== undefined) {
    const word = typed[at] as string;
    at += VALUED.has(globalOf(word, root) as string) && !word.includes('=') ? 2 : 1;
  }
  return { globals: typed.slice(0, at), words: typed.slice(at) };
}

/** Help's rows for the globals this command leaves global, under `Global options:` (R1–R3). */
export function globalRows(node: CommandNode): { term: string; text: string }[] {
  const rows = [
    { name: 'color', term: '--color <when>', text: 'always, never or auto (default: auto); NO_COLOR is honoured' },
    { name: 'no-color', term: '--no-color', text: 'the same as --color=never' },
    { name: 'quiet', term: '--quiet', text: 'silence progress and hints; data and errors still print' },
    { name: 'timeout', term: '--timeout <duration>', text: `end the run after this long, exit ${String(ExitCode.TIMEOUT)}: 500ms, 5s, 2m` },
  ];
  return rows
    .filter((row) => globalOf(`--${row.name}`, node) !== undefined)
    .map(({ name, term, text }) => ({ term: name === 'quiet' && globalOf('-q', node) !== undefined ? `-q, ${term}` : term, text }));
}
