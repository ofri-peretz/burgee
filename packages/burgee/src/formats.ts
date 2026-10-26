/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */
/* eslint-disable maintainability/no-missing-error-context, reliability/no-missing-error-context -- `PluginError`'s message is argument two, because argument one is the family's code; the rule only recognises `new Error(literal)`. The same exemption `plugin.ts` carries, on the same class and call shape. */

/**
 * `agent-headroom` RF — output formats as data on the plugin object.
 *
 * A format is a name and one `(value) => string`, which is what `plugin-contract` admits, so the
 * set is not burgee's to close: **the CLI's author decides what their agents read.** burgee's own
 * formats are registered by a plugin of its own, through the same check every author's go
 * through — `agent` (N15) and `tsv`, the format with the largest measured saving (63% under
 * minified JSON on fifty rows of four fields, 2026-09-09) — so the extension point is proven by
 * the format that justified it rather than asserted beside a built-in.
 *
 * Its own chunk, imported by `fields.js` only when `--format` is typed (M2). A plugin's formats are
 * checked here, where they are first used, and by `burgee check` — not at `use()`, which stays as
 * light as it was, the same choice `locales` made.
 *
 * **A format renders a success's data and nothing else.** `text` and `json` are burgee's own
 * surfaces and cannot be registered over; a failure is written by `failure.js` whatever format was
 * typed, so no format can drop the `hint` a failure carries (R6, `hint-survives.test.ts`).
 */
import { agentLines } from './agent-format.js';
import { UsageError } from './errors.js';
import { CONTRACT, type Format, type Plugin, PluginError } from './plugin.js';

/** The surfaces `--format` names that are not registered formats: the default, and the envelope. */
const SURFACES: readonly (readonly [string, string])[] = [
  ['text', 'the default: the result rendered for a person'],
  ['json', 'the --json envelope: ok, data and meta'],
];

/** Names `--format=` passes on to the spellings that already answer them (D-20261009, R1). */
export const SPELLINGS: readonly string[] = ['text', 'json', 'json-pretty'];

/** A name a caller types as one word after `--format=`. */
const NAME = /^[a-z][a-z\d-]*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A TSV cell on one line: tab, newline, carriage return and the escape itself, backslash-escaped. */
const ESCAPES: Readonly<Record<string, string>> = { '\t': '\\t', '\n': '\\n', '\r': '\\r', '\\': '\\\\' };
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  // A string is its own text; a number, a boolean, an object or a list is its compact JSON.
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replaceAll(/[\t\n\r\\]/g, (c) => ESCAPES[c] as string);
};

/**
 * `--format=tsv`: a header row, then one tab-separated line per row of a list result.
 *
 * The columns are every row's keys, in the order each first appears, so a ragged list loses no
 * field; a missing cell is empty. A row that is not an object is one cell under `value`. A nested
 * value is its compact JSON. What it gives up is stated, as `agent`'s is: types (`1` and `"1"`
 * print alike, and `null` is an empty cell) and `meta`. A result that is not a list has no rows,
 * so it is refused with the surface that prints it whole.
 */
export function tsvOf(value: unknown): string {
  if (!Array.isArray(value)) throw new UsageError('--format=tsv prints a list result, and this one is not a list', 'run it with --json for the whole result');
  const rows = value.map((row): Record<string, unknown> => (isRecord(row) ? row : { value: row }));
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) return '';
  return [columns, ...rows.map((row) => columns.map((c) => cell(row[c])))].map((line) => `${line.join('\t')}\n`).join('');
}

/** burgee's own formats, registered as an author registers theirs. */
const BUILTIN: Plugin = {
  name: 'burgee',
  contract: CONTRACT,
  formats: {
    agent: { description: 'one logfmt line per record: key=value, no envelope', render: agentLines },
    tsv: { description: 'a header row, then one tab-separated line per row of a list result', render: tsvOf },
  },
};

const refuse = (message: string, fix: string): PluginError => new PluginError('E_PLUGIN_SCHEMA', message, fix);

const isFormat = (value: unknown): value is Format => isRecord(value) && typeof value['render'] === 'function' && typeof value['description'] === 'string' && value['description'] !== '';

/** One plugin's format under `key`, checked against what is already taken. */
function checked(plugin: string, key: string, format: unknown, taken: ReadonlySet<string>): Format {
  if (!NAME.test(key)) throw refuse(`plugin "${plugin}": "${key}" is not a format name`, 'name it in lower-case letters, digits and dashes, starting with a letter: it is typed as --format=<name>');
  if (taken.has(key)) throw refuse(`plugin "${plugin}": format "${key}" is already registered`, 'rename it — one name, one format');
  if (!isFormat(format)) throw refuse(`plugin "${plugin}": format "${key}" is not { render(value), description }`, `\`${key}: { render: (value) => string, description: '…' }\``);
  return format;
}

/**
 * Every registered format by name, burgee's first and then each plugin's in registration order —
 * each one checked: an object of `{ render(value), description }` under a one-word lower-case
 * name that nothing registered before it.
 */
export function formatsOf(plugins: readonly Plugin[]): Map<string, Format> {
  const taken = new Set(SPELLINGS);
  const found = new Map<string, Format>();
  for (const { name, formats } of [BUILTIN, ...plugins]) {
    if (formats === undefined) continue;
    if (!isRecord(formats)) throw refuse(`plugin "${name}": formats must be an object`, 'map a name to `{ render(value), description }`');
    for (const [key, format] of Object.entries(formats)) {
      found.set(key, checked(name, key, format, taken));
      taken.add(key);
    }
  }
  return found;
}

/** Every name `--format` takes, the surfaces first: what a refusal names and what `--schema` declares. */
export const formatNames = (formats: ReadonlyMap<string, Format>): string[] => [...SURFACES.map(([name]) => name), ...formats.keys()];

/** `--format` with no name: every format, the surfaces first, as `--json=` lists fields — without running the handler. */
export function listFormats(formats: ReadonlyMap<string, Format>): string {
  const listed = [...SURFACES.map(([name, description]) => ({ name, description })), ...[...formats].map(([name, { description }]) => ({ name, description }))];
  return `${JSON.stringify({ ok: true, data: { formats: listed }, meta: {} })}\n`;
}
