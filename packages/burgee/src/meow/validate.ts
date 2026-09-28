/**
 * `burgee/meow` — everything meow refuses, and the words it refuses in.
 *
 * Which of these throws and which prints-and-exits is not a judgement call: `choices.js`
 * asserts a throw in-process and `is-required.js` spawns a fixture and asserts the message on
 * output with exit 2. One package, two contracts, and the suite is the only place that says
 * which is which.
 */
import { fileURLToPath } from 'node:url';

import { ExitCode } from '../exit-code.js';
import { host } from '../runtime.js';
import { decamelize } from '../yargs-parser.js';

import { type FlagSpec, type Settings } from './types.js';

/** meow's own `isObject`: a plain object, which rules out `null` and arrays. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const listed = (names: string[]): string => names.map((n) => `\`--${n}\``).join(', ');

/**
 * The declaration mistakes meow collects before it parses anything, in meow's order and
 * joined into one error — `options.js`'s `invalidOptionFilters`, filter for filter.
 */
export function validateFlags(flags: Record<string, FlagSpec>): void {
  const entries = Object.entries(flags);
  const pick = (filter: (spec: FlagSpec, name: string) => boolean): string[] =>
    entries.filter(([name, spec]) => filter(spec, name)).map(([name]) => name);
  const errors: string[] = [];

  const kebab = pick((_, name) => name.includes('-') && name !== '--');
  if (kebab.length > 0) errors.push(`Flag keys may not contain '-'. Invalid flags: ${kebab.map((k) => `\`${k}\``).join(', ')}`);
  const renamed = pick((spec) => Object.hasOwn(spec, 'alias'));
  if (renamed.length > 0) errors.push(`The option \`alias\` has been renamed to \`shortFlag\`. The following flags need to be updated: ${listed(renamed)}`);
  const badChoices = pick((spec) => Object.hasOwn(spec, 'choices') && !Array.isArray(spec.choices));
  if (badChoices.length > 0) errors.push(`The option \`choices\` must be an array. Invalid flags: ${listed(badChoices)}`);
  // `choices: [true, 'false']` on a boolean can never be satisfied by what the parser hands
  // back, so meow refuses the declaration rather than every value a user could type.
  const mistyped = pick((spec) => spec.type !== undefined && Array.isArray(spec.choices) && spec.choices.some((c) => typeof c !== spec.type));
  if (mistyped.length > 0) {
    const described = mistyped.map((n) => `(\`--${decamelize(n, '-')}\`, type: '${String(flags[n]?.type)}')`);
    errors.push(`Each value of the option \`choices\` must be of the same type as its flag. Invalid flags: ${described.join(', ')}`);
  }
  // A default outside its own `choices` is a mistake in the declaration, so it is reported
  // here, before parsing, and by the name the caller wrote.
  const outside = pick((spec) => Object.hasOwn(spec, 'default') && Array.isArray(spec.choices) && ![spec.default].flat().every((d) => spec.choices?.includes(d)));
  if (outside.length > 0) errors.push(`Each value of the option \`default\` must exist within the option \`choices\`. Invalid flags: ${listed(outside)}`);

  if (errors.length > 0) throw new Error(errors.join('\n'));
}

/** `kind-of`, for the values a flag default can be. */
const kindOf = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/**
 * The default each flag ends up with, `booleanDefault` included — which is how
 * `booleanDefault: null` reaches the type check below and is refused there.
 */
export function effectiveDefault(spec: FlagSpec, opts: Settings): { value: unknown } | undefined {
  if (Object.hasOwn(spec, 'default')) return { value: spec.default };
  const booleanDefault = 'booleanDefault' in opts ? opts.booleanDefault : false;
  if (spec.type === 'boolean' && booleanDefault !== undefined) return { value: spec.isMultiple === true ? [booleanDefault] : booleanDefault };
  if (spec.isMultiple === true) return { value: [] };
  return undefined;
}

/**
 * `minimist-options`' check that a default matches its declared type — the first mismatch,
 * as a `TypeError`, under the decamelized key the parser is handed. An array is typed by its
 * first element, and an empty one matches any array type.
 */
export function checkDefaultTypes(flags: Record<string, FlagSpec>, opts: Settings): void {
  for (const [name, spec] of Object.entries(flags)) {
    const found = effectiveDefault(spec, opts);
    if (found === undefined || name === '--') continue;
    const { value } = found;
    let expected = spec.isMultiple === true ? `${spec.type ?? 'string'}-array` : spec.type;
    if (expected?.endsWith('-array') === true && Array.isArray(value) && value.length === 0) expected = 'array';
    const actual = Array.isArray(value) && value.length > 0 ? `${kindOf(value[0])}-array` : kindOf(value);
    if (expected !== undefined && expected !== actual) {
      throw new TypeError(`Expected "${decamelize(name, '-')}" default value to be of type "${expected}", got "${actual}"`);
    }
  }
}

/** meow refuses to guess where the caller's `package.json` is. */
export function requireImportMeta(importMeta: ImportMeta | undefined): void {
  if (importMeta === undefined || typeof importMeta !== 'object' || typeof importMeta.url !== 'string') {
    throw new TypeError('The `importMeta` option is required. Its value must be `import.meta`.');
  }
  try {
    fileURLToPath(importMeta.url);
  } catch {
    throw new TypeError('The `importMeta` option is required. Its value must be `import.meta`.');
  }
}

/** `commands` is an array of bare words, and meow says so in three different sentences. */
export function validateCommands(commands: readonly string[] | undefined): void {
  if (commands === undefined) return;
  if (!Array.isArray(commands)) throw new TypeError('The `commands` option must be an array of strings.');
  if (commands.length === 0) throw new TypeError('The `commands` option must contain at least one command.');
  const bad = commands.some((c) => typeof c !== 'string' || c === '' || /\s/u.test(c) || c.startsWith('-'));
  if (bad) throw new TypeError('The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.');
}

/**
 * A value outside a flag's `choices`. Only an absent value counts as "no value": an empty
 * string is a value the user typed, and it is judged against `choices` like any other.
 */
export function checkChoices(specs: Record<string, FlagSpec>, flags: Record<string, unknown>): void {
  const errors: string[] = [];
  for (const [name, spec] of Object.entries(specs)) {
    if (!Array.isArray(spec.choices)) continue;
    const label = `--${decamelize(name, '-')}`;
    const allowed = `Value must be one of: [${spec.choices.map((c) => `\`${String(c)}\``).join(', ')}]`;
    const value = flags[name];
    if (value === undefined) {
      if (spec.isRequired !== undefined && spec.isRequired !== false) errors.push(`Flag \`${label}\` has no value. ${allowed}`);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    const bad = values.filter((v) => !spec.choices?.includes(v));
    if (bad.length > 0) {
      errors.push(`Unknown value${bad.length > 1 ? 's' : ''} for flag \`${label}\`: ${bad.map((b) => `\`${String(b)}\``).join(', ')}. ${allowed}`);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
}

/**
 * Required flags nobody passed. Missing means *absent* — `--test ''` supplied a value, and
 * meow's own `is-required.js` says so — or, for an `isMultiple` flag, an empty list.
 */
export function checkRequired(specs: Record<string, FlagSpec>, flags: Record<string, unknown>, input: string[]): void {
  const missing: string[] = [];
  for (const [name, spec] of Object.entries(specs)) {
    let required: unknown = spec.isRequired;
    if (typeof spec.isRequired === 'function') {
      required = spec.isRequired(flags, input);
      if (typeof required !== 'boolean') {
        throw new TypeError(`Return value for isRequired callback should be of type boolean, but ${typeof required} was returned.`);
      }
    }
    if (required !== true) continue;
    const value = flags[name];
    if (value !== undefined && !(spec.isMultiple === true && Array.isArray(value) && value.length === 0)) continue;
    const short = typeof spec.shortFlag === 'string' ? `, -${spec.shortFlag}` : '';
    missing.push(`--${decamelize(name, '-')}${short}`);
  }
  if (missing.length > 0) {
    // `is-required.js` spawns a fixture and asserts the message on output with exit 2, while
    // `choices.js` asserts a throw in-process. Same package, two contracts, and the suite is
    // the only place that says which is which.
    reportAndExit(`Missing required flag${missing.length > 1 ? 's' : ''}\n${missing.map((m) => `\t${m}`).join('\n')}`);
  }
}

const isNegativeNumber = (value: string): boolean => /^-(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/iu.test(value);

/**
 * meow's unknown-flag check, which is a check on *tokens*, not on parsed keys.
 *
 * With `allowUnknownFlags: false` the parser runs with `unknown-options-as-args`, so a flag
 * nobody declared arrives in the positionals exactly as typed and is reported from there.
 * Reading parsed keys instead is wrong both ways: `--no-auto-help` against a declared
 * `noAutoHelp` parses to `auto-help: false` as well — the parser negates before it looks the
 * name up — and that key is nobody's flag, yet the user typed nothing unknown.
 */
export function checkUnknownFlags(tokens: readonly unknown[]): void {
  const unknown = tokens.filter((t): t is string => typeof t === 'string' && t.length > 1 && t.startsWith('-') && !isNegativeNumber(t));
  if (unknown.length > 0) reportAndExit(`Unknown flag${unknown.length > 1 ? 's' : ''}\n${unknown.join('\n')}`);
}

/**
 * meow's `input` option may demand positionals, as a boolean or as a predicate. The predicate
 * is handed the input alone — `(input) => boolean` in meow's own types, unlike a flag's
 * `isRequired`, which also gets the flags.
 */
export function checkInput(opts: Settings, input: string[]): void {
  if (!isPlainObject(opts.input)) return;
  const { isRequired } = opts.input as { isRequired?: boolean | ((input: string[]) => unknown) };
  if (isRequired === undefined || isRequired === false) return;
  if (typeof isRequired === 'function') {
    const result = isRequired(input);
    if (typeof result !== 'boolean') {
      throw new TypeError(`Return value for isRequired callback should be of type boolean, but ${typeof result} was returned.`);
    }
    if (!result) return;
  }
  if (input.length === 0) reportAndExit('Missing required input');
}

/** A flag declared once may be given once — the parser collects repeats into an array. */
export function checkSetOnce(specs: Record<string, FlagSpec>, parsed: Record<string, unknown>): void {
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.isMultiple === true || name === '--') continue;
    // By the key as declared, not decamelized: meow's message names the flag the way the
    // caller wrote it in `flags`.
    if (Array.isArray(parsed[name])) throw new Error(`The flag --${name} can only be set once.`);
  }
}

/** stderr and exit 2 — how meow ends a run the flags do not support. */
export function reportAndExit(message: string): never {
  host.stderr.write(`${message}\n`);
  return host.exit(ExitCode.USAGE);
}
