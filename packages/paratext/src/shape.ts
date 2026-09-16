/**
 * A walk over the JSON-Schema subset `schema.json` actually uses — the check R4 claimed and
 * `check()` did not have.
 *
 * **What was wrong.** `check()` read exactly one array out of the schema,
 * `$defs.capability.required`, and asserted that those five keys were present. Everything
 * else in the file — `type`, `oneOf`, `const`, `minLength`, `minimum`, `items`,
 * `additionalProperties: false` — was declared and enforced by nothing, so this validated
 * clean: `{ name: 'x', osc: { nope: true }, when: 'not an object', encode: 'e{text}',
 * fallback: '{text}', extra: 1 }`. The `when` line is the one that bites. `supports()`
 * destructures it, a string destructures to four `undefined` clauses, every guard falls
 * through, and the answer is `true` — so a capability with a typo in `when` writes OSC into
 * whatever the caller redirected to. That is the one failure this package exists to prevent,
 * reached through its own documented extension surface.
 *
 * **Enforced here:** `type` (with `integer` as its own type, which is what `osc` is declared
 * as), `oneOf`, `const`, `minLength`, `minimum`, `items`, `properties`, and
 * `additionalProperties: false`. Between them that is every keyword `$defs/capability` and
 * its nested `when` write.
 *
 * **Not enforced, said here rather than left to be discovered:** `$ref` — nothing under a
 * capability uses one, and `capabilityDocument`'s two branches are `check()`'s own two
 * shapes; `pattern` — only the plugin's `tokens` map writes one, and that is roundel's half
 * of the file, not paratext's; `minItems`, `maxLength`, `enum`, `allOf`, `anyOf`, `not` —
 * unused anywhere in the schema; and `required`, on purpose, because presence is checked in
 * `capability.ts` where each of the five fields gets a line saying what the author is giving
 * up rather than "is required". A keyword added to the file tomorrow is silently unenforced,
 * which is why this paragraph is the claim and `README.md` repeats it rather than saying
 * "validated against the schema".
 *
 * **Why a walker and not a JSON-Schema library.** PRINCIPLES rule 2: zero external
 * dependencies. `ajv` is over 100 KB in a package whose whole root entry is under 19 KB, and
 * this is 40 lines.
 *
 * **It reads the schema; it does not restate it.** Nothing in this file names `when`, `osc`
 * or `tty`. Point it at `$defs.capability` and it enforces whatever that entry says today —
 * the property `check()` already had for `required` and now has for the rest.
 */

/** A schema node, as parsed from JSON. Deliberately untyped: this walks data. */
export type Schema = Readonly<Record<string, unknown>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The value's type in the schema's vocabulary rather than JavaScript's: `null` and arrays are
 * their own types, and a whole number is an `integer`, which is how `osc` is declared.
 */
function kindOf(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v === 'number' && Number.isInteger(v) ? 'integer' : typeof v;
}

/** One schema node in a reader's words: `an integer ≥ 0`, `"BEL"`, `an object`. */
function describe(s: Schema): string {
  if ('const' in s) return JSON.stringify(s['const']);
  const type = String(s['type']);
  return `${'aeiou'.includes(type[0] ?? '') ? 'an' : 'a'} ${type}${s['minimum'] === undefined ? '' : ` ≥ ${String(s['minimum'])}`}`;
}

/**
 * Whether `value` is not the thing `schema` says it is. `const` and `type` are one question to
 * a reader — "this is not what it has to be" — so they share this and one message.
 */
function mistyped(schema: Schema, value: unknown): boolean {
  const type = schema['type'];
  if ('const' in schema) return value !== schema['const'];
  if (typeof type !== 'string') return false;
  return kindOf(value) !== type && !(type === 'number' && typeof value === 'number');
}

/**
 * A `oneOf`: matching none of the branches is one line naming what they were.
 *
 * `some`, not "exactly one" — the branches this schema writes are disjoint, so a value
 * matching two of them would be a bug in the schema rather than in the capability.
 */
function alternatives(branches: readonly unknown[], value: unknown, at: string): string[] {
  if (branches.some((b) => isRecord(b) && violations(b, value, at).length === 0)) return [];
  return [`${at}: must be ${branches.map((b) => describe(b as Schema)).join(' or ')}`];
}

/** The two bounds this schema writes: `minLength` on a string, `minimum` on a number. */
function bounds(schema: Schema, value: unknown, at: string): string[] {
  const { minLength, minimum } = schema;
  if (typeof value === 'string' && value.length < ((minLength as number) ?? 0)) return [`${at}: must not be empty`];
  if (typeof value === 'number' && value < ((minimum as number) ?? -Infinity)) return [`${at}: must be ${describe(schema)}`];
  return [];
}

/** The keys of an object value, each against its own rule — or refused where there is none. */
function members(schema: Schema, value: object, at: string): string[] {
  const { properties, additionalProperties } = schema;
  const out: string[] = [];
  for (const [key, sub] of Object.entries(value)) {
    const rule = isRecord(properties) ? properties[key] : undefined;
    if (sub === undefined) continue;
    if (isRecord(rule)) out.push(...violations(rule, sub, `${at}.${key}`));
    else if (additionalProperties === false) out.push(`${at}.${key}: is not a field the schema declares`);
  }
  return out;
}

/**
 * Everything about `value` that `schema` disagrees with, each line prefixed with `at` — the
 * path a reader has to go and edit, `capabilities.link.when.tty`, not merely the capability.
 *
 * Absent is not wrong: a key whose value is `undefined` is skipped, because JSON has no
 * `undefined` and presence is `capability.ts`'s question. A wrong type returns immediately,
 * since every deeper rule would only restate it.
 */
export function violations(schema: Schema, value: unknown, at: string): string[] {
  const { oneOf, items } = schema;
  if (Array.isArray(oneOf)) return alternatives(oneOf, value, at);
  if (mistyped(schema, value)) return [`${at}: must be ${describe(schema)}, not ${kindOf(value)}`];

  const out = bounds(schema, value, at);
  if (Array.isArray(value) && isRecord(items)) for (const [i, element] of value.entries()) out.push(...violations(items, element, `${at}[${i}]`));
  if (isRecord(value)) out.push(...members(schema, value, at));
  return out;
}
