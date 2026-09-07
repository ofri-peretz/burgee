/**
 * burgee — a command declares itself once; every surface is that declaration
 * read by a different reader.
 *
 * This file is the whole engine so far: parse, validate, run, render, exit.
 * `node:util.parseArgs` does the tokenising and nothing else; the semantics
 * above it are ours. Zero runtime dependencies (K1/Z3), enforced by shape.test.ts.
 */
import { parseArgs } from 'node:util';

import { ExitCode, type ExitCode as ExitCodeType } from './exit-code.js';
import { type OptionSpec } from './manifest.js';

export interface CommandContext<O> {
  options: O;
  positionals: string[];
}

export interface Command<O = Record<string, string | boolean | undefined>> {
  name: string;
  description?: string;
  options?: Record<string, OptionSpec>;
  run: (ctx: CommandContext<O>) => unknown;
}

/** Reserved names a command may not redefine (V5). */
const RESERVED = new Set(['json', 'help']);

export function defineCommand<O = Record<string, string | boolean | undefined>>(
  command: Command<O>,
): Command<O> {
  for (const name of Object.keys(command.options ?? {})) {
    if (RESERVED.has(name)) {
      throw new Error(`burgee: option "${name}" is reserved and cannot be redefined`);
    }
  }
  return command;
}

export interface RunOptions {
  argv?: string[];
  stdout?: { write: (s: string) => unknown };
  stderr?: { write: (s: string) => unknown };
  exit?: (code: number) => never;
}

/** A usage problem the caller can fix, carrying the flag that fixes it (E3). */
class UsageError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

/** Spaces between the widest flag and the description column. */
const HELP_GUTTER = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A leaf renders as itself; anything deeper renders as compact JSON. */
function leaf(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The text surface. One level deep on purpose, and deliberately not recursive:
 * a caller who wants the whole structure asks for `--json`, which is the
 * surface that promises it.
 */
function render(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => leaf(v)).join('\n');
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${leaf(v)}`)
      .join('\n');
  }
  return String(value);
}

function helpText(command: Command<never>): string {
  const rows: [flag: string, text: string][] = [
    ...Object.entries(command.options ?? {}).map(
      ([name, spec]): [string, string] => [
        `--${name}${spec.type === 'string' ? ' <value>' : ''}`,
        `${spec.description ?? ''}${spec.required === true ? ' (required)' : ''}`.trim(),
      ],
    ),
    ['--json', 'machine-readable output'],
    ['--help', 'show this help'],
  ];
  // One column for every flag, sized to the widest (H3: width from the runtime later).
  const width = Math.max(...rows.map(([flag]) => flag.length)) + HELP_GUTTER;
  const lines = [
    ...(command.description === undefined ? [] : [command.description, '']),
    `Usage: ${command.name} [options]`,
    '',
    'Options:',
    ...rows.map(([flag, text]) => `  ${flag.padEnd(width)}${text}`.trimEnd()),
  ];
  return `${lines.join('\n')}\n`;
}

type ParseConfig = Record<string, { type: 'string' | 'boolean'; short?: string }>;
type Values = Record<string, string | boolean | undefined>;

/** `--json` and `--help` are always available and always reserved (V5). */
function toParseConfig(specs: Record<string, OptionSpec>): ParseConfig {
  const config: ParseConfig = { json: { type: 'boolean' }, help: { type: 'boolean' } };
  for (const [name, spec] of Object.entries(specs)) {
    config[name] = { type: spec.type, ...(spec.short === undefined ? {} : { short: spec.short }) };
  }
  return config;
}

/** Fills declared defaults, then fails on anything still missing and required. */
function applyDefaults(values: Values, specs: Record<string, OptionSpec>): void {
  for (const [name, spec] of Object.entries(specs)) {
    if (values[name] === undefined && spec.default !== undefined) values[name] = spec.default;
    if (values[name] === undefined && spec.required === true) {
      throw new UsageError(`missing required option --${name}`, `pass --${name} <value>`);
    }
  }
}

/**
 * parseArgs reports every malformed-argv case with an ERR_PARSE_ARGS_* code.
 * Each one is the caller mistyping something, which is USAGE (2) — never RUNTIME
 * (1), because 1 is the code an agent reads as "the command ran and failed".
 */
function isParseArgsFailure(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const { code } = cause as Error & { code?: unknown };
  return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS_');
}

/** E2/E3 — a usage error never prints a stack, a runtime failure never prints help. */
function describeFailure(cause: unknown): { code: ExitCodeType; message: string; hint?: string } {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (cause instanceof UsageError) {
    return { code: ExitCode.USAGE, message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) };
  }
  if (isParseArgsFailure(cause)) {
    return { code: ExitCode.USAGE, message, hint: 'run --help to see the available options' };
  }
  return { code: ExitCode.RUNTIME, message };
}

function textFailure(failure: { message: string; hint?: string }): string {
  const hint = failure.hint === undefined ? '' : `hint: ${failure.hint}\n`;
  return `error: ${failure.message}\n${hint}`;
}

export async function run<O>(command: Command<O>, opts: RunOptions = {}): Promise<void> {
  const out = opts.stdout ?? process.stdout;
  const err = opts.stderr ?? process.stderr;
  const exit = opts.exit ?? ((code: number) => process.exit(code));
  const specs = command.options ?? {};

  let json = false;
  try {
    const parsed = parseArgs({
      args: opts.argv ?? process.argv.slice(2),
      options: toParseConfig(specs),
      allowPositionals: true,
      strict: true,
    });
    const values = parsed.values as Values;
    json = values.json === true;

    if (values.help === true) {
      out.write(helpText(command as Command<never>));
      return exit(ExitCode.OK);
    }

    applyDefaults(values, specs);
    const data = await command.run({ options: values as O, positionals: parsed.positionals });

    out.write(json ? `${JSON.stringify({ ok: true, data })}\n` : `${render(data)}\n`);
    return exit(ExitCode.OK);
  } catch (cause) {
    const failure = describeFailure(cause);
    err.write(json ? `${JSON.stringify({ ok: false, error: failure })}\n` : textFailure(failure));
    return exit(failure.code);
  }
}

export { ExitCode, isExitCode, type ExitCode as ExitCodeValue } from './exit-code.js';
export { type OptionSpec } from './manifest.js';
