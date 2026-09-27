/**
 * Run-time validation in one fixed order (S6): relations first — `./relations.js`, loaded only
 * for a command that declares one — then each option's value: numbers, choices, Standard
 * Schema. Every failure is a usage error with the fix in hand (E3).
 *
 * The definition-time checks (S3, S5, V5) moved to `./definition.js` when the plugin host
 * arrived; that file says why. This one runs on every invocation, that one runs once.
 */
import { UsageError } from './errors.js';
import { type OptionSpec } from './manifest.js';
import { kebab } from './names.js';

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
