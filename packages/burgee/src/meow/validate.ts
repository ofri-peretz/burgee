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
import { camelCase, decamelize } from '../yargs-parser.js';

import { type AnyFlag, type Options } from './types.js';

export function validateFlags(flags: Record<string, AnyFlag>): void {
  const errors: string[] = [];
  const kebab = Object.keys(flags).filter((name) => name.includes('-') && name !== '--');
  if (kebab.length > 0) errors.push(`Flag keys may not contain '-'. Invalid flags: ${kebab.map((k) => `\`${k}\``).join(', ')}`);
  const renamed = Object.entries(flags).filter(([, spec]) => typeof spec.alias === 'string');
  if (renamed.length > 0) {
    errors.push(`The option \`alias\` has been renamed to \`shortFlag\`. The following flags need to be updated: ${renamed.map(([n]) => `\`--${n}\``).join(', ')}`);
  }
  const badChoices = Object.entries(flags).filter(([, spec]) => spec.choices !== undefined && !Array.isArray(spec.choices));
  if (badChoices.length > 0) {
    errors.push(`The option \`choices\` must be an array. Invalid flags: ${badChoices.map(([n]) => `\`--${n}\``).join(', ')}`);
  }
  for (const [name, spec] of Object.entries(flags)) {
    if (spec.default === undefined || spec.type === undefined) continue;
    const values = Array.isArray(spec.default) ? spec.default : [spec.default];
    const wrong = values.find((v) => typeof v !== spec.type);
    if (wrong !== undefined) errors.push(`Expected "${name}" default value to be of type "${String(spec.type)}", got "${typeof wrong}"`);
  }
  if (errors.length > 0) throw new Error(`${errors.join('\n')}`);
}

/** meow refuses to guess where the caller's `package.json` is. */

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

/** meow, over burgee's parser. */

/** `commands` is an array of bare words, and meow says so in three different sentences. */
export function validateCommands(commands: string[] | undefined): void {
  if (commands === undefined) return;
  if (!Array.isArray(commands)) throw new TypeError('The `commands` option must be an array of strings.');
  if (commands.length === 0) throw new TypeError('The `commands` option must contain at least one command.');
  const bad = commands.some((c) => typeof c !== 'string' || c === '' || /\s/u.test(c) || c.startsWith('-'));
  if (bad) throw new TypeError('The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.');
}

interface Split {
  parent: string[];
  input: string[];
  command?: string;
  unknownCommand?: string;
}

/**
 * Where the parent's arguments end and the command's begin.
 *
 * The first token the parser reads as positional is the command word; everything after it in
 * the *raw* argv is the child's, unparsed. `--` is not a fence here — the suite states that
 * `-- --unknown run` reports `Unknown command: --unknown`, so a post-separator word is a
 * candidate command like any other.
 */

export function checkChoices(specs: Record<string, AnyFlag>, flags: Record<string, unknown>): void {
  const errors: string[] = [];
  // A default outside its own `choices` is a mistake in the declaration, so it is reported
  // once for every flag that has it and by the name the caller wrote — not per value, which
  // is how a bad *argument* is reported two paragraphs down.
  const badDefaults = Object.entries(specs).filter(([, spec]) => {
    if (spec.default === undefined || !Array.isArray(spec.choices)) return false;
    return (Array.isArray(spec.default) ? spec.default : [spec.default]).some((d) => !spec.choices?.includes(d));
  });
  if (badDefaults.length > 0) {
    throw new Error(`Each value of the option \`default\` must exist within the option \`choices\`. Invalid flags: ${badDefaults.map(([n]) => `\`--${n}\``).join(', ')}`);
  }
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.choices === undefined || !Array.isArray(spec.choices)) continue;
    const label = `--${decamelize(name, '-')}`;
    const allowed = `[${spec.choices.map((c) => `\`${String(c)}\``).join(', ')}]`;
    const value = flags[name];
    const required = typeof spec.isRequired === 'function' ? true : spec.isRequired === true;
    if (value === undefined || value === '') {
      if (required) errors.push(`Flag \`${label}\` has no value. Value must be one of: ${allowed}`);
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    const bad = values.filter((v) => !spec.choices?.includes(v));
    if (bad.length > 0) {
      errors.push(`Unknown value${bad.length > 1 ? 's' : ''} for flag \`${label}\`: ${bad.map((b) => `\`${String(b)}\``).join(', ')}. Value must be one of: ${allowed}`);
    }
  }
  if (errors.length > 0) throw new Error(`${errors.join('\n')}`);
}

export function checkRequired(specs: Record<string, AnyFlag>, flags: Record<string, unknown>, input: string[]): void {
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
    if (value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) continue;
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

export function checkUnknown(specs: Record<string, AnyFlag>, parsedFlags: Record<string, unknown>, argv: string[], opts: Options): void {
  // `--help` belongs to meow only while `autoHelp` is answering it. Turn it off and the flag
  // is the caller's problem, which is what `help as an unknown flag` asserts.
  const known = new Set<string>(['--']);
  if (opts.autoHelp !== false) known.add('help');
  if (opts.autoVersion !== false) known.add('version');
  for (const [name, spec] of Object.entries(specs)) {
    known.add(name);
    known.add(decamelize(name, '-'));
    if (typeof spec.shortFlag === 'string') known.add(spec.shortFlag);
    if (typeof spec.alias === 'string') known.add(spec.alias);
  }
  const unknown = Object.keys(parsedFlags).filter((k) => !known.has(k) && !known.has(camelCase(k)) && !known.has(decamelize(k, '-')));
  if (unknown.length > 0) {
    const names = unknown.map((u) => (u.length === 1 ? `-${u}` : `--${decamelize(u, '-')}`));
    reportAndExit(`Unknown flag${names.length > 1 ? 's' : ''}\n${names.join('\n')}`);
  }
  void argv;
}

/** `commands` is an array of bare words, and meow says so in three different sentences. */

/** meow's `input` option may demand positionals, as a boolean or as a predicate. */
export function checkInput(opts: Options, input: string[], flags: Record<string, unknown>): void {
  if (typeof opts.input !== 'object' || opts.input === null) return;
  const spec = opts.input as { isRequired?: boolean | ((flags: Record<string, unknown>, input: string[]) => boolean) };
  const required = typeof spec.isRequired === 'function' ? spec.isRequired(flags, input) : spec.isRequired === true;
  if (required && input.length === 0) reportAndExit('Missing required input');
}

/** A flag declared once may be given once — the parser collects repeats into an array. */

/** A flag declared once may be given once — the parser collects repeats into an array. */
export function checkSetOnce(specs: Record<string, AnyFlag>, parsed: Record<string, unknown>): void {
  for (const [name, spec] of Object.entries(specs)) {
    if (spec.isMultiple === true || name === '--') continue;
    if (Array.isArray(parsed[name])) throw new Error(`The flag --${decamelize(name, '-')} can only be set once.`);
  }
}

/**
 * The half of `normalize-package-data` meow's callers can see.
 *
 * `bin` as a string becomes `{ [name]: path }` — the suite reads `cli.pkg.bin['browser-sync']`
 * — and an absent `version` becomes `''`. A copy, because `pkg normalization is lazy` asserts
 * the object the caller passed in is untouched.
 */

/** stderr and exit 2 — how meow ends a run the flags do not support. */
export function reportAndExit(message: string): never {
  host.stderr.write(`${message}\n`);
  return host.exit(ExitCode.USAGE);
}

/** meow's `input` option may demand positionals, as a boolean or as a predicate. */
