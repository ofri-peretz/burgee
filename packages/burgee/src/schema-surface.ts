import { type Manifest } from './manifest.js';
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
import { completionNode } from './root-help.js';
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
 * D-20261009-b1-totals-and-explain — the one question the program document cannot answer is which
 * source a value came from, and agents that read `--schema` spent 3 to 8 turns probing the env var
 * it names (B1's diagnose-provenance, 56 of 60 runs). So the document names the flag that answers
 * it. Here and not in `schemaOf`: the façades' `--schema` stays as it was, and so does their weight.
 * It names the flag, not `<program> --explain` (D-20260930 rule 4).
 */
const EXPLAIN = '--explain <option> on a command says where its value came from: default, env, config or flag';

/**
 * `--schema` under a character budget (N13): one command's full schema when a command is
 * named (the drilling), the whole program when it fits, a summary naming every command
 * and how to drill when it does not.
 */
export async function schemaSurface(manifest: Manifest, argv: string[]): Promise<unknown> {
  const { commandSchemaOf, schemaOf, summaryOf } = await import('./schema.js');
  const { errorsOf } = await import('./clispec.js');
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
  // agent-lint-conformance R5 — the `completion` the engine serves is published like a command the
  // program declared: listed last, and drilled into by name. Absent when the program has its own.
  const completion = completionNode(manifest);
  const { node } = manifest.resolve(path as string[], manifest.rootPath);
  let one = node?.run === undefined ? undefined : node;
  if (one === undefined && path.length === 1 && path[0] === 'completion') one = completion;
  if (field !== undefined) {
    if (one === undefined) throw new UsageError('--field drills into one command', 'name the command first: --schema <command> --field <path>');
    return fieldOf(commandSchemaOf(one, manifest.rootPath), field, path.join(' '));
  }
  if (one !== undefined) return commandSchemaOf(one, manifest.rootPath);
  const full = schemaOf(manifest);
  const budget = manifest.schemaBudget ?? SCHEMA_BUDGET;
  const summary = summaryOf(manifest, budget);
  if (completion !== undefined) {
    full.commands.push(commandSchemaOf(completion, manifest.rootPath));
    summary.commands.push({ name: 'completion', summary: completion.description as string, effects: 'read_only' });
  }
  const doc = JSON.stringify(full).length <= budget ? full : summary;
  // Just ahead of `commands`, so a reader that stops partway through the list has seen it, and
  // every other key keeps its place: without `explain` the bytes are the façades' (machine-json.test).
  // clispec-conformance R2 — `errors` beside it: what can go wrong, read before the first call.
  return Object.fromEntries(Object.entries(doc).flatMap((entry) => (entry[0] === 'commands' ? [['explain', EXPLAIN], ['errors', errorsOf()], entry] : [entry])));
}
