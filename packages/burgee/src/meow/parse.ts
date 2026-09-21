/**
 * `burgee/meow` — argv in, flags out, over burgee's own `yargs-parser`.
 *
 * meow is one function over that parser, which is why this file is the shape of its options
 * object rather than a parser of its own.
 */
import parser, { decamelize } from '../yargs-parser.js';

import { type AnyFlag, type Options } from './types.js';

/** Where a command run's parent arguments end and the child's begin. */
export interface Split {
  parent: string[];
  input: string[];
  command?: string;
  unknownCommand?: string;
}

/** Every flag name a caller may write, and the canonical name each maps to. */
export function aliasMap(flags: Record<string, AnyFlag>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, spec] of Object.entries(flags)) {
    const names: string[] = [];
    if (typeof spec.shortFlag === 'string') names.push(spec.shortFlag);
    if (typeof spec.alias === 'string') names.push(spec.alias);
    for (const extra of spec.aliases ?? []) names.push(extra);
    const decamelized = decamelize(name, '-');
    if (decamelized !== name) names.push(decamelized);
    if (names.length > 0) Object.defineProperty(out, name, { value: names, writable: true, enumerable: true, configurable: true });
  }
  return out;
}

export function typeofDefault(value: unknown): 'string' | 'boolean' | 'number' | undefined {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return typeofDefault(value[0]);
  return undefined;
}

/**
 * Where the parent's arguments end and the command's begin.
 *
 * The first token the parser reads as positional is the command word; everything after it in
 * the *raw* argv is the child's, unparsed. `--` is not a fence here — the suite states that
 * `-- --unknown run` reports `Unknown command: --unknown`, so a post-separator word is a
 * candidate command like any other.
 */
export function splitAtCommand(argv: string[], parserOptions: Record<string, unknown>, opts: Options): Split {
  // The same options the real parse uses, because a probe that does not know `--parent-flag`
  // is a boolean reads the command word as that flag's value and cuts in the wrong place.
  const probe = parser.detailed(argv, parserOptions);
  const first = (probe.argv['_'] as unknown[])[0];
  if (first === undefined) return { parent: argv, input: [] };
  const word = String(first);
  const at = argv.indexOf(word);
  const parent = at === -1 ? argv : argv.slice(0, at);
  const input = at === -1 ? [] : argv.slice(at + 1);
  if (!(opts.commands ?? []).includes(word)) return { parent, input, unknownCommand: word };
  return { parent, input, command: word };
}

/** stderr and exit 2 — how meow ends a run the flags do not support. */
