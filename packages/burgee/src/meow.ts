/**
 * `burgee/meow` — meow's public surface, implemented over burgee (J9: no dependency on meow
 * itself). Graded by meow's own suite; see `npm run compat -- meow`.
 *
 * meow is one function over `yargs-parser`, and burgee ships its own `yargs-parser` for the
 * `burgee/yargs` front end — so this façade is that parser plus meow's option contract, and
 * takes nothing new into the tree. The parts live beside this file: `parse.ts` turns argv
 * into flags, `validate.ts` holds everything meow refuses, and `present.ts` builds what the
 * CLI says about itself.
 */
import { type ExitCode as ExitCodeType, ExitCode } from './exit-code.js';
import { aliasMap, typeofDefault } from './meow/parse.js';
import { buildHelp, normalizePackage, readPackageUp, setProcessTitle } from './meow/present.js';
import { type AnyFlags, type FlagSpec, type Options, own, type Result, type Settings } from './meow/types.js';
import {
  checkChoices,
  checkDefaultTypes,
  checkInput,
  checkRequired,
  checkSetOnce,
  checkUnknownFlags,
  effectiveDefault,
  isPlainObject,
  requireImportMeta,
  validateCommands,
  validateFlags,
} from './meow/validate.js';
import { host } from './runtime.js';
import parser, { camelCase } from './yargs-parser.js';

export {
  type AnyFlag,
  type AnyFlags,
  type Flag,
  type FlagType,
  type InputOption,
  type InputOptionType,
  type IsRequiredPredicate,
  type Options,
  type Result,
  type TypedFlags,
} from './meow/types.js';

/** meow, over burgee's parser. */
function meow<Flags extends AnyFlags>(helpMessage: string, options: Options<Flags>): Result<Flags>;
function meow<Flags extends AnyFlags>(options: Options<Flags>): Result<Flags>;
function meow(helpText: string | Settings, options: Settings = {}): Result<AnyFlags> {
  const opts: Settings = typeof helpText === 'string' ? { help: helpText, ...options } : helpText;
  if (typeof helpText !== 'string' && Object.keys(options).length > 0) Object.assign(opts, options);

  // `flags: null` is refused rather than read as "no flags" — only an absent key means that.
  const flagSpecs = (opts.flags === undefined ? {} : opts.flags) as Record<string, FlagSpec>;
  if (!isPlainObject(flagSpecs)) throw new TypeError('The `flags` option must be an object.');
  // meow accepts a string or a plain object here and nothing else, by the object's toString tag:
  // `null` and an array are refused, as upstream refuses them, rather than read as no `input`.
  if (opts.input !== undefined && typeof opts.input !== 'string' && Object.prototype.toString.call(opts.input) !== '[object Object]') {
    throw new TypeError('The `input` option must be a string or an object.');
  }
  if (typeof opts.input === 'object' && opts.input !== null) {
    const required = (opts.input as { isRequired?: unknown }).isRequired;
    if (required !== undefined && typeof required !== 'boolean' && typeof required !== 'function') {
      throw new TypeError('The `input.isRequired` option must be a boolean or a function.');
    }
  }
  validateCommands(opts.commands);
  validateFlags(flagSpecs);
  checkDefaultTypes(flagSpecs, opts);

  if (opts.pkg === undefined) requireImportMeta(opts.importMeta);
  const pkg = opts.pkg ?? readPackageUp(opts.importMeta);
  const rawArgv = [...(opts.argv ?? host.argv.slice(2))];
  const strict = opts.allowUnknownFlags === false;

  const booleans: string[] = [];
  const strings: string[] = [];
  const numbers: string[] = [];
  const defaults: Record<string, unknown> = {};
  const arrays: string[] = [];
  for (const [name, spec] of Object.entries(flagSpecs)) {
    if (name === '--') continue;
    const type = spec.type ?? (spec.default === undefined ? undefined : typeofDefault(spec.default));
    if (type === 'boolean') booleans.push(name);
    else if (type === 'number') numbers.push(name);
    else if (type === 'string') strings.push(name);
    if (spec.isMultiple === true) arrays.push(name);
    const found = effectiveDefault(spec, opts);
    if (found !== undefined) own(defaults, name, found.value);
  }
  // Strict mode has to know `--help` and `--version` by name, or it reports them as unknown.
  // Only while meow is answering them: with `autoHelp: false`, `--help` is the caller's.
  if (strict && opts.autoHelp !== false && flagSpecs['help'] === undefined) booleans.push('help');
  if (strict && opts.autoVersion !== false && flagSpecs['version'] === undefined) booleans.push('version');

  const parserOptions = {
    alias: aliasMap(flagSpecs),
    array: arrays,
    boolean: booleans,
    string: strings,
    number: numbers,
    default: defaults,
    configuration: {
      'camel-case-expansion': true,
      'greedy-arrays': false,
      // With `commands`, the first positional is the command word and everything after it
      // belongs to the child, unparsed — so the parent stops there.
      'halt-at-non-option': opts.commands !== undefined,
      'parse-numbers': opts.inferType === true,
      'parse-positional-numbers': opts.inferType === true,
      'populate--': flagSpecs['--'] !== undefined,
      // meow keeps every spelling a caller used: `cli.flags` carries `fooBar`, `foo` and
      // `f` together, which is what `unnormalized flags` asserts. Stripping either would
      // make the object smaller than the one the suite reads.
      'strip-aliased': false,
      'strip-dashed': true,
      // Strict mode checks tokens, not keys: an undeclared flag lands in the positionals as
      // typed, and `checkUnknownFlags` reports it from there.
      'unknown-options-as-args': strict,
    },
  };
  const parse = (args: string[]): Record<string, unknown> => parser.detailed(args, parserOptions).argv as Record<string, unknown>;

  const { _: positionalRaw, ...rest } = parse(rawArgv);
  const positional = positionalRaw as unknown[];
  const help = buildHelp(opts, pkg);
  // `version: false` is not a switch — the suite passes the string `'false'` through an env
  // var and expects it printed. Only an absent version falls back, and the fallback is a
  // sentence rather than an empty line.
  const declared = opts.version === undefined ? undefined : String(opts.version);
  const fromPkg = typeof pkg['version'] === 'string' && pkg['version'] !== '' ? pkg['version'] : undefined;
  const version = declared ?? fromPkg ?? 'No version found';

  const showHelp = (code: number = ExitCode.USAGE): never => {
    host.stdout.write(`${help}\n`);
    return host.exit(code as ExitCodeType);
  };
  const showVersion = (): void => {
    host.stdout.write(`${version}\n`);
    host.exit(ExitCode.OK);
  };

  // meow answers `--help` and `--version` only when that is the whole command line, and it
  // answers them even when the caller declared the flag — `-h` against a declared
  // `help: {shortFlag: 'h'}` still prints help. `--version --help` is two arguments, so
  // neither fires and both arrive as flags.
  if (positional.length === 0 && rawArgv.length === 1) {
    if (rest['version'] === true && opts.autoVersion !== false) showVersion();
    else if (rest['help'] === true && opts.autoHelp !== false) showHelp(ExitCode.OK);
  }

  const coerce = (v: unknown): unknown => {
    const inputType = isPlainObject(opts.input) ? (opts.input as { type?: string }).type : (opts.input as string | undefined);
    if (inputType === 'number') return Number(v);
    if (inputType === 'string') return String(v);
    return opts.inferType === true ? v : String(v);
  };
  let command: string | undefined;
  let input: string[];
  if (opts.commands === undefined) input = positional.map(coerce) as string[];
  else if (positional.length === 0) input = [];
  else {
    const word = String(positional[0]);
    if (opts.commands.includes(word)) {
      command = word;
      input = positional.slice(1).map(String);
    } else {
      // A "command" that looks like a flag is an unknown parent flag — unless it came after
      // `--`, where it is a word like any other. Re-parsing what precedes `--` is the only
      // reliable way to tell, because the same string can be an earlier flag's value. Only
      // the flags before the first non-flag are the parent's; the rest are the child's.
      if (strict && word.startsWith('-')) {
        const separator = rawArgv.indexOf('--');
        const afterSeparator = separator !== -1 && !(parse(rawArgv.slice(0, separator))['_'] as unknown[]).map(String).includes(word);
        if (!afterSeparator) {
          const firstWord = positional.findIndex((item) => typeof item !== 'string' || !item.startsWith('-'));
          checkUnknownFlags(firstWord === -1 ? positional : positional.slice(0, firstWord));
        }
      }
      host.stderr.write(`Unknown command: ${word}\nAvailable commands: ${opts.commands.join(', ')}\n${help}\n`);
      host.exit(ExitCode.USAGE);
      input = [];
    }
  }

  if (strict && opts.commands === undefined) {
    // After `--` everything is input, unless the caller declared `--` to collect it — then
    // the parser already set it aside and the positionals are clean.
    const separator = rawArgv.indexOf('--');
    const tokens = separator !== -1 && flagSpecs['--'] === undefined ? (parse(rawArgv.slice(0, separator))['_'] as unknown[]) : positional;
    checkUnknownFlags(tokens);
  }

  // `flags` is the normalized object and `unnormalizedFlags` is everything the parser
  // produced. A `shortFlag` or a deprecated `alias` is a second spelling of one flag and is
  // dropped from `flags`; an entry in `aliases` is not — the suite states both, one test
  // apart, and they are the reason this split exists at all.
  const dropped = new Set<string>();
  for (const spec of Object.values(flagSpecs)) {
    if (typeof spec.shortFlag === 'string') dropped.add(spec.shortFlag);
    if (typeof spec.alias === 'string') dropped.add(spec.alias);
    for (const extra of spec.aliases ?? []) dropped.add(extra);
  }
  const flags: Record<string, unknown> = {};
  const unnormalizedFlags: Record<string, unknown> = { ...rest };
  for (const [key, value] of Object.entries(rest)) {
    if (key === '--' || dropped.has(key)) continue;
    // A one-character key is kept as typed: `-F` is `F`, not `f`. meow's `camelcaseKeys`
    // excludes `/^\w$/`, and camel-casing a single capital would lowercase it.
    own(flags, /^\w$/u.test(key) ? key : camelCase(key), value);
  }
  if (flagSpecs['--'] !== undefined) flags['--'] = rest['--'] ?? [];

  setProcessTitle(pkg);
  // `pkg` is a getter because meow's is: the caller's object is normalized in place the first
  // time anyone reads it, and not before.
  let normalized: Record<string, unknown> | undefined;
  const result = {
    input,
    flags,
    unnormalizedFlags,
    get pkg(): Record<string, unknown> {
      normalized ??= normalizePackage(pkg);
      return normalized;
    },
    help,
    version,
    showHelp,
    showVersion,
  } as unknown as Result<AnyFlags>;
  if (command !== undefined) result.command = command;

  checkSetOnce(flagSpecs, rest);
  checkChoices(flagSpecs, flags);
  checkRequired(flagSpecs, flags, input);
  checkInput(opts, input);

  return result;
}

const meowFacade: typeof meow = meow;

export default meowFacade;
