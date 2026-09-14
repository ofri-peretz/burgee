/**
 * Validating the resolved shape, and reporting a violation **with its provenance** (R12).
 *
 * The sentence is the product:
 *
 *     `out` must be a string; `./mytool.config.js:3` set it to `4`
 *
 * Every incumbent in this layer can produce the first half. None can produce the second,
 * because none of them records where a value came from — which is the same absence R3 and R4
 * exist to fix, seen from the error-message end. A type error the user cannot locate sends
 * them grepping four files.
 *
 * **Structurally typed, and no import of burgee** (Y1). `Shape` declares the four fields
 * validation reads; burgee's `OptionSpec` carries eighteen and satisfies this by having
 * them, with no adapter and no dependency pointing back up the stack. A program with its own
 * option type does the same.
 */
import { ConfigError, type Provenance, type Resolution } from './precedence.js';

/**
 * What validation reads from a manifest, and no more.
 *
 * `type` is checked when it is one of the four JavaScript kinds and ignored otherwise: a
 * shape that says nothing asserts nothing, which is what lets a richer spec pass through a
 * field this package has never heard of.
 */
export interface Shape {
  type?: string;
  choices?: readonly unknown[];
  required?: boolean;
  default?: unknown;
}

export interface Violation {
  key: string;
  /** The whole sentence, ready to print: the rule, then where the value came from. */
  message: string;
  /** What the value should have been — `'a string'`, `'one of fast, safe'`. */
  expected: string;
  value: unknown;
  /** Absent only for a required option that no source set: there is no origin to name. */
  provenance?: Provenance;
}

const KINDS: ReadonlySet<string> = new Set(['string', 'number', 'boolean']);

/** `./mytool.config.js:3`, or `APP_RETRIES`, or `--force` — where a person would go and look. */
function where(provenance: Provenance): string {
  const at = provenance.location ?? String(provenance.source);
  return provenance.line === undefined ? at : `${at}:${String(provenance.line)}`;
}

function expectationFor(shape: Shape): string | undefined {
  if (shape.choices !== undefined && shape.choices.length > 0) return `one of ${shape.choices.map((c) => String(c)).join(', ')}`;
  if (shape.type !== undefined && KINDS.has(shape.type)) return `a ${shape.type}`;
  if (shape.type === 'array') return 'an array';
  return undefined;
}

function satisfies(value: unknown, shape: Shape): boolean {
  if (shape.choices !== undefined && shape.choices.length > 0) return shape.choices.includes(value);
  if (shape.type === 'array') return Array.isArray(value);
  return typeof value === shape.type;
}

/**
 * Every violation, in the order the shape declares its options — never the first one alone.
 * A config file with three mistakes should be fixable in one pass, not three runs.
 */
export function validate(shape: Record<string, Shape>, resolution: Resolution): Violation[] {
  const out: Violation[] = [];
  for (const [key, spec] of Object.entries(shape)) {
    const has = key in resolution.values;
    if (!has) {
      if (spec.required === true) out.push({ key, message: `\`${key}\` is required, and no source set it`, expected: 'a value', value: undefined });
      continue;
    }
    const expected = expectationFor(spec);
    const value = resolution.values[key];
    if (expected === undefined || satisfies(value, spec)) continue;
    const provenance = resolution.provenance[key];
    const origin = provenance === undefined ? '' : `; \`${where(provenance)}\` set it to \`${render(value)}\``;
    out.push({ key, message: `\`${key}\` must be ${expected}${origin}`, expected, value, ...(provenance === undefined ? {} : { provenance }) });
  }
  return out;
}

/** `4`, `"lots"`, `true` — the value as the user would recognise it, and never a thrown stringify. */
function render(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * The throwing form: the resolved values, or one `CONFIG`-class error listing every
 * violation. `validate` is the record; this is the rendering a program that just wants to
 * exit reaches for (E1, E3 — a message and a hint, never a stack).
 */
export function check(shape: Record<string, Shape>, resolution: Resolution): Record<string, unknown> {
  const violations = validate(shape, resolution);
  if (violations.length === 0) return resolution.values;
  throw new ConfigError(violations.map((v) => v.message).join('\n'), 'fix the file, the variable or the flag each line names');
}
