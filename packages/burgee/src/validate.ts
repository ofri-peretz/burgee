/**
 * Run-time validation in one fixed order (S6): relations first, then each option's value —
 * numbers, choices, Standard Schema. Every failure is a usage error with the fix in hand (E3).
 *
 * The definition-time checks (S3, S5, V5) moved to `./definition.js` when the plugin host
 * arrived; that file says why. This one runs on every invocation, that one runs once.
 */
import { UsageError } from './errors.js';
import { type OptionSpec, type Relation } from './manifest.js';
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

const isFinite = (n: number): boolean => Number.isFinite(n);

/** A number from the command line, env or config: never NaN, never Infinity, within bounds (S3, yargs #1079). */
const numberOf = (raw: unknown): number => {
  if (typeof raw === 'number') return raw;
  const text = String(raw).trim();
  return text === '' ? Number.NaN : Number(text);
};

export function toNumber(key: string, spec: OptionSpec, raw: unknown): number {
  const n = numberOf(raw);
  const flag = `--${kebab(key)}`;
  if (!isFinite(n)) throw new UsageError(`${flag} expects a number, got "${String(raw)}"`, `pass ${flag} <number>`);
  if (spec.integer === true && !Number.isInteger(n)) throw new UsageError(`${flag} expects an integer, got ${n}`, `pass ${flag} ${Math.round(n)}`);
  if (spec.minimum !== undefined && n < spec.minimum) throw new UsageError(`${flag} must be at least ${spec.minimum}, got ${n}`, `pass ${flag} ${spec.minimum}`);
  if (spec.maximum !== undefined && n > spec.maximum) throw new UsageError(`${flag} must be at most ${spec.maximum}, got ${n}`, `pass ${flag} ${spec.maximum}`);
  return n;
}

function checkChoice(key: string, spec: OptionSpec, value: unknown): void {
  if (spec.choices === undefined || spec.choices.includes(String(value))) return;
  throw new UsageError(`--${kebab(key)} must be one of ${spec.choices.join(', ')}, got "${String(value)}"`, `pass --${kebab(key)} ${spec.choices[0] ?? ''}`);
}

async function checkSchema(key: string, spec: OptionSpec, value: unknown): Promise<unknown> {
  if (spec.schema === undefined) return value;
  const result = await spec.schema['~standard'].validate(value);
  if (result.issues !== undefined) {
    throw new UsageError(`--${kebab(key)}: ${result.issues.map((i) => i.message).join('; ')}`, `check --${kebab(key)}`);
  }
  return result.value;
}

/** Split a repeatable option's raw values on its separator; arrays from config pass through (S8, yargs #846). */
export function splitMultiple(spec: OptionSpec, raw: unknown): unknown[] {
  const sep = spec.separator ?? ',';
  const parts = Array.isArray(raw) ? raw : [raw];
  return parts.flatMap((p) => (typeof p === 'string' ? p.split(sep).map((s) => s.trim()).filter((s) => s !== '') : [p]));
}

async function coerceOne(key: string, spec: OptionSpec, raw: unknown): Promise<unknown> {
  const value = spec.type === 'number' ? toNumber(key, spec, raw) : raw;
  checkChoice(key, spec, value);
  return await checkSchema(key, spec, value);
}

async function coerceValue(key: string, spec: OptionSpec, raw: unknown): Promise<unknown> {
  if (spec.multiple !== true) return await coerceOne(key, spec, raw);
  return await Promise.all(splitMultiple(spec, raw).map((item) => coerceOne(key, spec, item)));
}

/** Every option's resolved value, coerced and validated: numbers, choices, then its Standard Schema (S3, S6). */
export async function coerce(specs: Record<string, OptionSpec>, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const present = Object.entries(specs).filter(([key]) => values[key] !== undefined);
  const coerced = await Promise.all(present.map(async ([key, spec]) => [key, await coerceValue(key, spec, values[key])] as const));
  return { ...values, ...Object.fromEntries(coerced) };
}

export { camel, kebab } from './names.js';

// The two classes live in `errors.ts` so a façade can recognise them without this module;
// re-exported here so every existing import keeps its path.
export { AuthError, UsageError } from './errors.js';
