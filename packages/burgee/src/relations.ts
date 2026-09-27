/**
 * S2 / S6 — relations between options, checked before any value is (yargs #1186).
 *
 * Its own module since 2026-09-24 (U5): `execute.ts` imports it only for a command that
 * declares a relation, so a program whose commands declare none never loads a byte of it.
 * Every failure is a usage error with the fix in hand (E3), exactly as before.
 */
import { UsageError } from './errors.js';
import { type Relation } from './manifest.js';
import { flagsOf, kebab } from './names.js';

type Sources = Record<string, { source: string }>;
const isSet = (values: Record<string, unknown>, key: string, sources: Sources): boolean => values[key] !== undefined && sources[key]?.source !== 'default';
const flagList = (keys: readonly string[]): string => flagsOf(keys).join(', ');

function exactlyOne(keys: readonly string[], on: string[]): void {
  if (on.length === 1) return;
  throw new UsageError(`exactly one of ${flagList(keys)} is required`, on.length === 0 ? 'pass one of them' : `drop all but one of ${flagList(on)}`);
}

function atLeastOne(keys: readonly string[], on: string[]): void {
  if (on.length === 0) throw new UsageError(`at least one of ${flagList(keys)} is required`, 'pass one of them');
}

function atMostOne(keys: readonly string[], on: string[]): void {
  if (on.length > 1) throw new UsageError(`at most one of ${flagList(keys)} may be given`, `drop all but one of ${flagList(on)}`);
}

function noConflict(on: string[]): void {
  if (on.length > 1) throw new UsageError(`${flagList(on)} cannot be used together`, 'drop one of them');
}

function implied(a: string, b: string | ((values: Record<string, unknown>) => boolean), values: Record<string, unknown>, sources: Sources): void {
  if (!isSet(values, a, sources)) return;
  if (typeof b === 'string') {
    if (!isSet(values, b, sources)) throw new UsageError(`--${kebab(a)} requires --${kebab(b)}`, `pass --${kebab(b)}`);
    return;
  }
  if (!b(values)) throw new UsageError(`--${kebab(a)} is not allowed with these values`, `check the values --${kebab(a)} is declared to require`);
}

function checkRelation(rel: Relation, values: Record<string, unknown>, sources: Sources): void {
  const set = (keys: readonly string[]): string[] => keys.filter((k) => isSet(values, k, sources));
  if ('exactlyOneOf' in rel) exactlyOne(rel.exactlyOneOf, set(rel.exactlyOneOf));
  else if ('atLeastOneOf' in rel) atLeastOne(rel.atLeastOneOf, set(rel.atLeastOneOf));
  else if ('atMostOneOf' in rel) atMostOne(rel.atMostOneOf, set(rel.atMostOneOf));
  else if ('conflicts' in rel) noConflict(set(rel.conflicts));
  else implied(rel.implies[0], rel.implies[1], values, sources);
}

/** Relations before anything else (S6, yargs #1186); `--no-x` counts as set, because it was typed (yargs #898). */
export function checkRelations(relations: readonly Relation[] | undefined, values: Record<string, unknown>, sources: Sources): void {
  for (const rel of relations ?? []) checkRelation(rel, values, sources);
}
