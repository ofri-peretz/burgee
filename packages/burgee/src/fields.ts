/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N14 — what `--json=<fields>` does once it is typed: list the declared fields, refuse an
 * unknown one naming the valid set, select the named fields of a result. Its own chunk,
 * imported by `execute.ts` only when `--json=` is on the command line (M2).
 */
import { type CommandNode } from './manifest.js';
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
  if (unknown.length > 0) throw new UsageError(`unknown field${unknown.length === 1 ? '' : 's'} ${unknown.map((f) => `"${f}"`).join(', ')}`, `valid fields: ${valid.join(', ')}`);
}

/** The named fields of a result: of the object, or of each object in a list. */
export function selectFields(data: unknown, fields: readonly string[]): unknown {
  const list: unknown[] = Array.isArray(data) ? data : [data];
  const rows = list.filter(isPlainObject);
  refuseUnknown(fields, [...new Set(rows.flatMap((row) => Object.keys(row)))]);
  const pick = (row: unknown): unknown => (isPlainObject(row) ? Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]])) : row);
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

/**
 * N14 — `--json=a,b` becomes `--json` plus the fields it names; `--json=` alone is an empty
 * list, which asks for the valid set. Only the `=` form takes fields, so `cmd --json name`
 * keeps `name` a positional (D-114). Nothing after `--` is read (G5).
 */
export function jsonFields(args: readonly string[]): { args: string[]; fields?: string[] } {
  const end = args.indexOf('--');
  const head = end === -1 ? args : args.slice(0, end);
  const given = head.findLast((a) => a.startsWith('--json='));
  if (given === undefined) return { args: [...args] };
  const fields = given.slice('--json='.length).split(',').map((f) => f.trim()).filter((f) => f !== '');
  const kept = head.map((a) => (a.startsWith('--json=') ? '--json' : a));
  return { args: end === -1 ? kept : [...kept, ...args.slice(end)], fields };
}
