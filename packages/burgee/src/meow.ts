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
import { aliasMap, splitAtCommand, type Split, typeofDefault } from './meow/parse.js';
import { buildHelp, normalizePackage, readPackageUp, setProcessTitle } from './meow/present.js';
import { type AnyFlag, type Options, own, type Result } from './meow/types.js';
import { checkChoices, checkInput, checkRequired, checkSetOnce, checkUnknown, requireImportMeta, validateCommands, validateFlags } from './meow/validate.js';
import { host } from './runtime.js';
import parser, { camelCase } from './yargs-parser.js';

export { type AnyFlag, type Options, type Result } from './meow/types.js';

/** meow, over burgee's parser. */
function meow(helpText: string | Options, options: Options = {}): Result {
  const opts: Options = typeof helpText === 'string' ? { help: helpText, ...options } : helpText;
  if (typeof helpText !== 'string' && Object.keys(options).length > 0) Object.assign(opts, options);

  if (opts.input !== undefined && typeof opts.input !== 'string' && !Array.isArray(opts.input) && typeof opts.input !== 'object') {
    throw new TypeError('The `input` option must be a string or an object.');
  }
  const flagSpecs = (opts.flags ?? {}) as Record<string, AnyFlag>;
  if (typeof flagSpecs !== 'object' || flagSpecs === null || Array.isArray(flagSpecs)) {
    throw new TypeError('The `flags` option must be an object.');
  }
  if (typeof opts.input === 'object' && opts.input !== null) {
    const required = (opts.input as { isRequired?: unknown }).isRequired;
    if (required !== undefined && typeof required !== 'boolean' && typeof required !== 'function') {
      throw new TypeError('The `input.isRequired` option must be a boolean or a function.');
    }
  }
  validateFlags(flagSpecs);

  if (opts.pkg === undefined) requireImportMeta(opts.importMeta);
  const pkg = normalizePackage(opts.pkg ?? readPackageUp(opts.importMeta));
  validateCommands(opts.commands);
  const rawArgv = [...(opts.argv ?? host.argv.slice(2))];

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
    if (spec.default !== undefined) own(defaults, name, spec.default);
    else if (type === 'boolean' && 'booleanDefault' in opts) {
      // `booleanDefault: undefined` is meow's way of saying "leave an unset boolean out",
      // which is why this reads the key's presence rather than its value.
      if (opts.booleanDefault !== undefined) own(defaults, name, opts.booleanDefault);
    } else if (type === 'boolean') own(defaults, name, false);
    if (spec.isMultiple === true && spec.default === undefined) {
      own(defaults, name, type === 'boolean' && !('booleanDefault' in opts) ? [false] : []);
    }
  }

  // With `commands`, everything after the command word belongs to the child and is handed
  // back verbatim — so the parent parses only what precedes it, and an unknown flag after
  // the command is the child's business rather than an error here.
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
      'parse-numbers': opts.inferType === true,
      'parse-positional-numbers': opts.inferType === true,
      'populate--': flagSpecs['--'] !== undefined,
      // meow keeps every spelling a caller used: `cli.flags` carries `fooBar`, `foo` and
      // `f` together, which is what `unnormalized flags` asserts. Stripping either would
      // make the object smaller than the one the suite reads.
      'strip-aliased': false,
      'strip-dashed': true,
      'unknown-options-as-args': false,
    },
  };

  const split = opts.commands === undefined ? undefined : splitAtCommand(rawArgv, parserOptions, opts);
  const argv = split?.parent ?? rawArgv;
  const parsed = parser.detailed(argv, parserOptions);

  const { _: positional, ...rest } = parsed.argv;
  const inputType = typeof opts.input === 'object' && opts.input !== null ? (opts.input as { type?: string }).type : (opts.input as string | undefined);
  const coerce = (v: unknown): unknown => {
    if (inputType === 'number') return Number(v);
    if (inputType === 'string') return String(v);
    return opts.inferType === true ? v : String(v);
  };
  const input = (split === undefined ? (positional as unknown[]).map(coerce) : split.input) as string[];
  const command = split?.command;
  // `flags` is the normalized object and `unnormalizedFlags` is everything the parser
  // produced. A `shortFlag` or a deprecated `alias` is a second spelling of one flag and is
  // dropped from `flags`; an entry in `aliases` is not — the suite states both, one test
  // apart, and they are the reason this split exists at all.
  const dropped = new Set<string>();
  for (const [name, spec] of Object.entries(flagSpecs)) {
    if (typeof spec.shortFlag === 'string') dropped.add(spec.shortFlag);
    if (typeof spec.alias === 'string') dropped.add(spec.alias);
    for (const extra of spec.aliases ?? []) dropped.add(extra);
    void name;
  }
  const flags: Record<string, unknown> = {};
  const unnormalizedFlags: Record<string, unknown> = { ...rest };
  for (const [key, value] of Object.entries(rest)) {
    if (key === '--' || dropped.has(key)) continue;
    Object.defineProperty(flags, camelCase(key), { value, writable: true, enumerable: true, configurable: true });
  }
  if (flagSpecs['--'] !== undefined) flags['--'] = rest['--'] ?? [];

  const help = buildHelp(opts, pkg);
  // `version: false` is not a switch — the suite passes the string `'false'` through an env
  // var and expects it printed. Only an absent version falls back, and the fallback is a
  // sentence rather than an empty line.
  const declared = opts.version === undefined ? undefined : String(opts.version);
  const fromPkg = typeof pkg['version'] === 'string' && pkg['version'] !== '' ? (pkg['version'] as string) : undefined;
  const version = declared ?? fromPkg ?? 'No version found';

  const showHelp = (code: number = ExitCode.USAGE): never => {
    host.stdout.write(help === '' ? '\n' : `${help}\n`);
    return host.exit(code as ExitCodeType);
  };
  const showVersion = (): void => {
    host.stdout.write(`${version}\n`);
    host.exit(ExitCode.OK);
  };

  setProcessTitle(pkg);
  const result: Result = { input, flags, unnormalizedFlags, pkg, help, version, showHelp, showVersion };
  if (opts.commands !== undefined && command !== undefined) result.command = command;
  if (split?.unknownCommand !== undefined) {
    host.stderr.write(`Unknown command: ${split.unknownCommand}\nAvailable commands: ${opts.commands?.join(', ') ?? ''}\n${help}\n`);
    host.exit(ExitCode.USAGE);
  }

  // A caller who declares `help` or `version` as a flag of their own has taken it over, and
  // meow stops answering it — which is what `help as a known flag` states.
  if (input.length === 0) {
    if (opts.autoHelp !== false && flagSpecs['help'] === undefined && flags['help'] === true) showHelp(ExitCode.OK);
    if (opts.autoVersion !== false && flagSpecs['version'] === undefined && flags['version'] === true) showVersion();
  }

  checkSetOnce(flagSpecs, rest);
  checkInput(opts, input, flags);
  checkChoices(flagSpecs, flags);
  checkRequired(flagSpecs, flags, input);
  if (opts.allowUnknownFlags === false) checkUnknown(flagSpecs, rest, argv, opts);

  return result;
}

const meowFacade: typeof meow = meow;

export default meowFacade;
