/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * clispec-conformance — the keys The CLI Spec v0.3 (https://clispec.dev) defines, added to the
 * one `--schema` document beside burgee's own (`schemaVersion` stays 1: every key is new, none
 * changes meaning). Each is read from what the program already declares, never typed twice.
 *
 * Read by `schema-surface.js` only, which `--schema` alone loads (M2): no run that does not ask
 * for the schema loads a byte of this. The commander and yargs façades build their document in
 * `schema.ts` synchronously, and `./yargs` and `./schema` had 21 and 34 bytes of their weight
 * budgets to spare (`weight.test.ts`), so their documents do not carry these keys.
 */
import { type ErrorRow, definedErrors, kindOf } from './error-kinds.js';
import { ExitCode } from './exit-code.js';
import { globalRows, WHEN } from './globals.js';
import { ROOT_GLOBAL } from './help.js';
import { type CommandNode, type Manifest, type OutputSchema } from './manifest.js';
import { adviceOf, producibleExits } from './root-help.js';

/** The version of The CLI Spec this document conforms to (R1). */
export const CLISPEC = '0.3';

/**
 * R2 — `errors`: every kind the program can fail with and the exit code it leaves with. The
 * contract's rows are the codes this program can produce (`producibleExits`, agent-lint-conformance
 * R8: the list root help prints under `Exit codes:`), all but `OK`, described by the same advice;
 * the program's own follow, from the classes `defineError` registered. `retryable` is true for
 * `timeout` (run it again with more time) and for a class that says so.
 */
export function errorsOf(manifest: Manifest): ErrorRow[] {
  const contract = producibleExits(manifest)
    .filter((name) => name !== 'OK')
    .map((name) => ({ kind: kindOf(ExitCode[name]) as string, exit_code: ExitCode[name], retryable: name === 'TIMEOUT', description: adviceOf(name, manifest) }));
  return [...contract, ...definedErrors()];
}

/** One of clispec's `global_args`: `$defs.arg`. */
export interface GlobalArg {
  name: string;
  type: 'boolean' | 'string';
  description: string;
  short?: string;
  enum?: readonly string[];
  default?: string;
}

/** `-q, --quiet` or `--timeout <duration>`: the short flag, the name, and whether it takes a value. */
const TERM = /^(?:(-\w), )?--([\w-]+)(?: <\w+>)?$/u;

/**
 * R3 — `global_args`: exactly the rows root help prints under `Global options:`, read from the
 * same two tables (`ROOT_GLOBAL` in `help.ts`, `globalRows` in `globals.ts`) under the same
 * condition `surfaces.ts` renders them on, so the two cannot disagree. A row with a `<value>`
 * takes a string; `--color` publishes its three values and its default.
 */
export function globalArgsOf(manifest: Manifest): GlobalArg[] {
  const root = manifest.find(manifest.rootPath);
  const rows = [...ROOT_GLOBAL, ...(root === undefined ? [] : globalRows(root))];
  return rows.map(({ term, text }) => {
    // Every row is a flag help renders, so every term matches; `globalArgsOf` is held name for name against help.
    const [, short, name] = TERM.exec(term) as RegExpExecArray;
    const arg: GlobalArg = { name: name as string, type: term.includes('<') ? 'string' : 'boolean', description: text };
    if (short !== undefined) arg.short = short;
    if (name === 'color') Object.assign(arg, { enum: WHEN, default: 'auto' });
    return arg;
  });
}

/**
 * R7 — what a run prints when no format is asked for: text, at a terminal and under a pipe
 * alike. clispec lets a tool keep a human default as long as it says so; `formats` are the ones
 * `--format` and `--json` select: the two surfaces, burgee's registered `agent` and `tsv`, then
 * each plugin's in registration order (`agent-headroom` RF) — the names `--format` lists. Names
 * only: a plugin's formats are checked where `--format` first uses them (`formats.ts`), and
 * `--schema` is not the place a broken one is refused.
 */
export function outputOf(manifest: Manifest): { tty: 'text'; piped: 'text'; formats: string[] } {
  // A key that is not a map of formats names none: `--format` is where it is refused, with the reason.
  const registered = manifest.plugins.flatMap(({ formats }) => {
    const map = formats as unknown;
    return typeof map === 'object' && map !== null && !Array.isArray(map) ? Object.keys(map) : [];
  });
  return { tty: 'text', piped: 'text', formats: ['text', 'json', 'agent', 'tsv', ...registered] };
}

/**
 * The document as printed: `explain` just ahead of `commands`, so a reader that stops partway
 * through the list has seen it, and every other key keeps its place (without the native keys
 * the bytes are the façades', `machine-json.test`). clispec's keys go beside it: `errors` (R2),
 * and for the whole document `global_args` (R3) and `output` (R7) ahead of `commands`, and
 * `clispec` (R1) after `schemaVersion`. The summary over budget (`manifest` undefined) gets
 * `errors` and no claim of conformance; `program` is the manifest either way, which `errors` reads.
 */
export function documentOf(doc: object, manifest: Manifest | undefined, explain: string, program: Manifest): Record<string, unknown> {
  const whole = manifest === undefined ? [] : [['global_args', globalArgsOf(manifest)], ['output', outputOf(manifest)]];
  return Object.fromEntries(
    Object.entries(doc).flatMap((entry) => {
      if (entry[0] === 'schemaVersion' && manifest !== undefined) return [entry, ['clispec', CLISPEC]];
      return entry[0] === 'commands' ? [['explain', explain], ['errors', errorsOf(program)], ...whole, entry] : [entry];
    }),
  );
}

/** A command line's words, quotes honoured: `demo greet "Ada L"` is three. */
const WORDS = /"([^"]*)"|'([^']*)'|(\S+)/gu;

/**
 * R4 — the command's first example as the argument vector clispec's probe runs (`example.args`),
 * without the program's name in front. clispec's `example` is an object, not the invocation
 * string the design first wrote: its schema refuses a string there.
 */
export function exampleOf(node: CommandNode, root: readonly string[]): { args: string[] } | undefined {
  const first = node.examples?.[0];
  if (first === undefined) return undefined;
  const words = [...first.command.matchAll(WORDS)].map((m) => (m[1] ?? m[2] ?? m[3]) as string);
  const named = root.every((word, i) => words[i] === word);
  return { args: words.slice(named ? root.length : 0) };
}

/** What `--json` prints on success: the envelope, with the declared result as its `data`. */
const envelope = (data: OutputSchema): OutputSchema => ({ type: 'object', properties: { ok: { const: true }, data, meta: { type: 'object' } }, required: ['ok', 'data'] });

/**
 * The result's shape from `fields` alone (N14): an object with those keys, or a list of them
 * when the command returns more than one. The keys' types are not declared, so none is claimed.
 */
function fieldsShape(node: CommandNode): OutputSchema | undefined {
  if (node.fields === undefined) return undefined;
  const row = { type: 'object', properties: Object.fromEntries(node.fields.map((field) => [field, {}])) };
  return node.output?.cardinality === 'single' || node.output?.cardinality === undefined ? row : { type: 'array', items: row };
}

/**
 * R4, R5 — the clispec keys of one command: `example`, and from `output` (and `fields`)
 * `output_kind`, `media_type`, `cardinality` and `stdout_schema`. `stdout_schema` is what
 * `--json` prints, so it is the envelope around the declared result. clispec's `output_fields`
 * is not emitted: each of its entries needs a type, and `fields` names keys without one; the
 * same keys are in `stdout_schema`, where an untyped property is allowed.
 */
export function commandKeysOf(node: CommandNode, root: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const example = exampleOf(node, root);
  if (example !== undefined) out['example'] = example;
  const { kind, mediaType, cardinality, schema } = node.output ?? {};
  if (kind !== undefined) out['output_kind'] = kind;
  if (mediaType !== undefined) out['media_type'] = mediaType;
  if (cardinality !== undefined) out['cardinality'] = cardinality;
  const data = schema ?? fieldsShape(node);
  if (data !== undefined && kind !== 'opaque') out['stdout_schema'] = envelope(data);
  return out;
}
