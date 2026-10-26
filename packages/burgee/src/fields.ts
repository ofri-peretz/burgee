/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N14 — what `--json=<fields>` does once it is typed: list the declared fields, refuse an
 * unknown one naming the valid set, select the named fields of a result. Its own chunk,
 * imported by `execute.ts` only when `--json=`, `--format` or a global is on the command line
 * (M2) — `agent-headroom` RF's `--format` and R3's `--max-bytes` are read off argv here too, so
 * the startup path carries one test for all of them.
 */
import { beforeTerminator, isJsonFlag } from './argv.js';
import { formatNames, formatsOf, listFormats, SPELLINGS } from './formats.js';
import { type Globals, globalsOf, isGlobal } from './globals.js';
import { type CommandNode } from './manifest.js';
import { type Print, printer } from './max-bytes.js';
import { type Plugin } from './plugin.js';
import { UsageError } from './validate.js';

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A declaration `--json=` can trust: distinct, non-empty names without commas. Checked here,
 * on first use, rather than in `defineCommand` — the check would otherwise weigh on every
 * entry that reaches the definition door, for a flag most runs never type.
 */
function declared(node: CommandNode): readonly string[] | undefined {
  const { fields } = node;
  if (fields === undefined) return undefined;
  if (fields.every((f) => f !== '' && !f.includes(',')) && new Set(fields).size === fields.length) return fields;
  throw new Error(`burgee: command "${node.path.slice(1).join(' ')}" declares fields ${JSON.stringify(fields)}; declare distinct, non-empty names without commas`);
}

/** `--json=` with nothing after it: the declared fields, without running the handler. */
export function listFields(node: CommandNode): { ok: true; data: { fields: readonly string[] }; meta: Record<string, never> } {
  const fields = declared(node);
  if (fields === undefined) {
    const typed = node.path.slice(1).join(' ');
    throw new UsageError(`"${typed}" declares no fields to list`, `run "${typed} --json" to see its whole result`);
  }
  return { ok: true, data: { fields }, meta: {} };
}

/** An unknown field is refused with the valid set named — before the handler when they are declared. */
export function checkFields(fields: readonly string[], node: CommandNode): void {
  const valid = declared(node);
  if (valid !== undefined) refuseUnknown(fields, valid);
}

function refuseUnknown(fields: readonly string[], valid: readonly string[]): void {
  const unknown = fields.filter((f) => !valid.includes(f));
  const named = unknown.map((f) => `"${f}"`).join(', ');
  // Two sentences, not one with an `s` spliced in: each is a catalog entry a pack translates whole (`messages.ts`).
  if (unknown.length > 0) throw new UsageError(unknown.length === 1 ? `unknown field ${named}` : `unknown fields ${named}`, `valid fields: ${valid.join(', ')}`);
}

/** The named fields of a result: of the object, or of each object in a list. */
export function selectFields(data: unknown, fields: readonly string[]): unknown {
  const list: unknown[] = Array.isArray(data) ? data : [data];
  const rows = list.filter(isPlainObject);
  refuseUnknown(fields, [...new Set(rows.flatMap((row) => Object.keys(row)))]);
  const pick = (row: unknown): unknown => (isPlainObject(row) ? Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])) : row);
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

/** What `fields.js` reads off argv before the command's own parse. */
export interface LazyArgs {
  args: string[];
  fields?: string[];
  /** How the success is written, when a format or a budget was typed (RF, R3); `execute.ts` writes it. */
  print?: Print;
  /** agent-lint-conformance R1–R3: the globals typed, when any were. */
  global?: Globals;
  /** A listing to print instead of running the handler: `--json=`'s fields, or `--format`'s formats. */
  text?: string;
}

/**
 * Everything the engine reads lazily off argv, in one call: the R1–R3 globals and `--max-bytes`
 * first (`globals.js`), then `--format` and `--json=<fields>` from what is left. A listing, an
 * unknown field and a budget with no machine format to budget are all refused or answered here,
 * before the parse and before the handler.
 */
export function lazyArgs(typed: readonly string[], node: CommandNode, plugins: readonly Plugin[]): LazyArgs {
  const global = typed.some(isGlobal) ? globalsOf(typed, node) : undefined;
  const words = global?.args ?? typed;
  const { args, fields, render, list } = jsonFields(words, node, plugins);
  if (list !== undefined) return { args, text: list };
  if (fields?.length === 0) return { args, text: `${JSON.stringify(listFields(node))}\n` };
  if (fields) checkFields(fields, node);
  const max = global?.max;
  if (max !== undefined && render === undefined && !asksForJson(words, node)) {
    throw new UsageError('--max-bytes budgets a machine format, and none was asked for', 'add --json, or --format=<name>; --format lists them');
  }
  const print = render === undefined && max === undefined ? {} : { print: printer(render, max) };
  return { args, ...(fields === undefined ? {} : { fields }), ...print, ...(global === undefined ? {} : { global }) };
}

/**
 * Whether the line asks for the `--json` envelope: `--json`, `--json=<fields>`, or a spelling that
 * runs as one (`--format=json`, `--output json`, D-20261009) on a command that leaves the word to
 * burgee. Read so `--max-bytes` beside any of them is kept for the envelope.
 */
function asksForJson(words: readonly string[], node: CommandNode): boolean {
  const head = beforeTerminator(words);
  return head.some((word, i) => {
    if (isJsonFlag(word)) return true;
    const [, flag, eq] = /^--(format|output)(=json)?$/.exec(word) ?? [];
    return flag !== undefined && node.options[flag] === undefined && (eq !== undefined || head[i + 1] === 'json');
  });
}

/**
 * RF — `--format=<name>` is taken out before the parser sees it and hands back the registered
 * format's renderer; `--format` alone, or `--format=`, asks for the list. A command that declares
 * its own `format` option keeps the word, because the program wins. `text`, `json` and
 * `json-pretty` stay in argv for the spellings that already answer them; any other name nothing
 * registered is refused with the names there are.
 */
function formatOf(head: readonly string[], plugins: readonly Plugin[]): { head: readonly string[]; render?: (value: unknown) => string; list?: string } {
  // A bare `--format` lists only when no value follows it: `--format json` is the D-20261009 spelling.
  const word = head.findLast((a, i) => a.startsWith('--format=') || (a === '--format' && !/^[^-]/.test(head[i + 1] ?? '-')));
  const name = word?.slice('--format='.length) ?? '';
  if (word === undefined || SPELLINGS.includes(name)) return { head };
  const formats = formatsOf(plugins);
  const rest = head.filter((a) => a !== word);
  if (name === '') return { head: rest, list: listFormats(formats) };
  const format = formats.get(name);
  if (format === undefined) throw new UsageError(`unknown format "${name}"`, `formats: ${formatNames(formats).join(', ')}`);
  return { head: rest, render: format.render };
}

/**
 * N14 — `--json=a,b` becomes `--json` plus the fields it names; `--json=` alone is an empty
 * list, which asks for the valid set. Only the `=` form takes fields, so `cmd --json name`
 * keeps `name` a positional (D-114). Nothing after `--` is read (G5) — neither here nor by
 * `--format`, which is read first.
 */
export function jsonFields(args: readonly string[], node: CommandNode, plugins: readonly Plugin[]): { args: string[]; fields?: string[]; render?: (value: unknown) => string; list?: string } {
  const end = args.indexOf('--');
  const all = end === -1 ? args : args.slice(0, end);
  const { head, ...format } = node.options['format'] === undefined ? formatOf(all, plugins) : { head: all };
  const tail = end === -1 ? [] : args.slice(end);
  const given = head.findLast((a) => a.startsWith('--json='));
  if (given === undefined) return { args: [...head, ...tail], ...format };
  const fields = given.slice('--json='.length).split(',').map((f) => f.trim()).filter((f) => f !== '');
  const kept = head.map((a) => (a.startsWith('--json=') ? '--json' : a));
  return { args: [...kept, ...tail], fields, ...format };
}
