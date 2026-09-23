/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N13 / D-116 — `--schema <command> --field <path>`: one field of one command's schema, so an
 * agent under a token budget reads `options.region` instead of the whole document. The path is
 * dotted; a step that does not exist is refused naming the steps that do.
 *
 * With the `--schema` surface it serves: `execute.ts` imports this module only when `--schema`
 * is on the command line (M2), so neither weighs on a run that does not ask for it.
 */
import { type Manifest } from './manifest.js';
import { UsageError } from './validate.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function fieldOf(doc: unknown, path: string, command: string): unknown {
  let at = doc;
  const walked: string[] = [];
  for (const step of path.split('.')) {
    if (!isRecord(at) || !(step in at)) {
      const here = walked.length === 0 ? `"${command}"` : `"${walked.join('.')}"`;
      const valid = isRecord(at) ? Object.keys(at).join(', ') : 'none — it is a value';
      throw new UsageError(`${here} has no field "${step}"`, `fields here: ${valid}`);
    }
    at = at[step];
    walked.push(step);
  }
  return at;
}

const SCHEMA_BUDGET = 48_000;

/**
 * `--schema` under a character budget (N13): one command's full schema when a command is
 * named (the drilling), the whole program when it fits, a summary naming every command
 * and how to drill when it does not.
 */
export async function schemaSurface(manifest: Manifest, argv: string[]): Promise<unknown> {
  const { commandSchemaOf, schemaOf, summaryOf } = await import('./schema.js');
  const end = argv.indexOf('--');
  const head = end === -1 ? argv : argv.slice(0, end);
  // D-116 — `--field <path>` (or `--field=<path>`) drills below the command into one field.
  const at = head.findIndex((a) => a === '--field' || a.startsWith('--field='));
  const field = at === -1 ? undefined : (head[at]?.slice('--field='.length) || head[at + 1]);
  // `--field x` spans two tokens and `--field=x` one; `drop` is the last index the flag owns.
  const width = head[at] === '--field' ? 1 : 0;
  const drop = at === -1 ? -1 : at + width;
  // `--format=…` and `--field` are flags, never steps in the command path being drilled into.
  const path = head.filter((a, i) => a !== '--schema' && !a.startsWith('--format=') && (i < at || i > drop));
  const { node } = manifest.resolve(path as string[], manifest.rootPath);
  if (field !== undefined) {
    if (node?.run === undefined) throw new UsageError('--field drills into one command', 'name the command first: --schema <command> --field <path>');
    return fieldOf(commandSchemaOf(node, manifest.rootPath), field, path.join(' '));
  }
  if (node?.run !== undefined) return commandSchemaOf(node, manifest.rootPath);
  const full = schemaOf(manifest);
  const budget = manifest.schemaBudget ?? SCHEMA_BUDGET;
  return JSON.stringify(full).length <= budget ? full : summaryOf(manifest, budget);
}
