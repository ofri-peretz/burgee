/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * N15 — `--format=agent`: a command's result as one compact line per record, and nothing else.
 * Its own chunk, imported by `execute.ts` only when the flag is on the command line (M2).
 *
 * **Not JSON, on purpose.** oxlint's `agent` reporter and vitest's converged on the same shape
 * independently: one line per record, no excerpts, no summary, whitespace collapsed. An agent
 * wants low-token and grep-able, and the `--json` envelope is neither — every record repeats
 * its braces and quoted keys, and `meta.provenance` rides along on every run.
 *
 * The shape is logfmt, because logfmt is the line format tools already split:
 *
 * - The records are the result's elements when it is a list, else the result itself. `null`,
 *   `undefined` and an empty list are no records, so no lines — the exit code says it ran.
 * - An object record is `key=value` pairs separated by one space; a nested object's keys are
 *   dotted (`owner.name=ada`), a list of scalars is comma-joined (`tags=a,b`), and a list that
 *   holds an object is indexed (`files.0.path=a`).
 * - A value is quoted — JSON string escaping — only when it is empty or holds a space, `=`,
 *   `"`, `,` or a control character, so splitting on unquoted spaces, then on the first `=`,
 *   then on unquoted commas, is always correct.
 * - A scalar record is itself, unquoted, since there is no key for it to be confused with.
 * - Whitespace runs collapse to one space and are trimmed, so a record is always one line.
 *
 * What it gives up is stated rather than hidden: types (`1` and `"1"` print alike), exact
 * whitespace, and `meta`. The data is the data `--json` would carry — it goes through
 * `JSON.stringify` first, so `toJSON`, dropped `undefined` and a refused `BigInt` are the
 * same on both — and the exit code is the same. A caller who needs the types asks for
 * `--json`, which is the surface that promises them; `--json` wins when both are typed.
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A run of whitespace, and a value that needs quotes to split back out of a record. */
const SPACE = /\s+/g;
const UNSAFE = /^$|[ =",\p{Cc}]/u;

const text = (value: Json): string => String(value).replace(SPACE, ' ').trim();

function scalar(value: Json): string {
  const s = text(value);
  return UNSAFE.test(s) ? JSON.stringify(s) : s;
}

const isScalar = (value: Json): boolean => value === null || typeof value !== 'object';

/** The children of an object or a list, keyed by their dotted path under `key`, in order. */
const children = (value: Json, key: string): [string, Json][] => Object.entries(value as Record<string, Json>).map(([k, v]) => [key === '' ? k : `${key}.${k}`, v]);

/**
 * An object or list record as `key=value` pairs. A walk with its own stack rather than a
 * recursion, so a deep result costs memory and not the call stack; the value came through
 * `JSON.parse`, so it is a tree and the walk ends.
 */
function line(record: Json): string {
  if (isScalar(record)) return text(record);
  const out: string[] = [];
  const stack = children(record, '').reverse();
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    const [key, value] = next;
    if (isScalar(value)) out.push(`${key}=${scalar(value)}`);
    else if (Array.isArray(value) && value.every(isScalar)) out.push(`${key}=${value.map(scalar).join(',')}`);
    else for (const child of children(value, key).reverse()) stack.push(child);
  }
  return out.join(' ');
}

/** The result as `--format=agent` prints it: one line per record, each ending in a newline. */
export function agentLines(data: unknown): string {
  const json = JSON.stringify(data);
  const value = json === undefined ? null : (JSON.parse(json) as Json);
  const records = value === null ? [] : [value].flat();
  return records.map((r) => `${line(r)}\n`).join('');
}
