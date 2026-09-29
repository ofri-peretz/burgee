/**
 * `burgee/meow` — argv in, flags out, over burgee's own `yargs-parser`.
 *
 * meow is one function over that parser, which is why this file is the shape of its options
 * object rather than a parser of its own.
 */
import { decamelize } from '../yargs-parser.js';

import { type FlagSpec } from './types.js';

/** Every flag name a caller may write, and the canonical name each maps to. */
export function aliasMap(flags: Record<string, FlagSpec>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [name, spec] of Object.entries(flags)) {
    const names: string[] = [];
    if (typeof spec.shortFlag === 'string') names.push(spec.shortFlag);
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
