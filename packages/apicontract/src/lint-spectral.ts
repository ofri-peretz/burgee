/**
 * A `.spectral.yaml` / `.spectral.json` read as `lint` rules (apicontract-lint spec.md R9), so a
 * team keeps the standards it already wrote. A rule is carried when its `given` stays inside the
 * JSONPath subset and its `then` uses core functions with options that mean here what they meant
 * there. Every rule that is not carried is listed with the reason and a `fix:`, never dropped.
 *
 * `extends: spectral:oas` carries the rules that have an apicontract equivalent, at Spectral's
 * default level; the rest of that ruleset is reported as not carried, in one entry.
 */
import { type Level, type Rule, type Then } from './lint-engine.js';
import { CASINGS } from './lint-functions.js';
import { parse } from './lint-jsonpath.js';
import { FUNCTIONS, type FunctionName } from './lint-names.js';

/** A rule, or a ruleset, that a reader could not carry: where it is, why, and what to do. */
export interface NotCarried {
  readonly id: string;
  readonly file: string;
  readonly pointer: string;
  readonly reason: string;
  readonly fix: string;
}

/** What a ruleset file gives a run: its rules, the level of each rule it names, and what it could not carry. */
export interface ReadRuleset {
  readonly rules: Readonly<Record<string, Rule>>;
  readonly levels: Readonly<Record<string, Level>>;
  readonly notCarried: readonly NotCarried[];
}

/**
 * `spectral:oas` rules with an apicontract equivalent, and Spectral's default level for each.
 * ponytail: written from Spectral's documented oas ruleset; that the two find the same things on
 * the corpus is _unmeasured_.
 */
export const SPECTRAL_OAS: Readonly<Record<string, { readonly id: string; readonly level: Level }>> = {
  'info-description': { id: 'info-description', level: 'warn' },
  'operation-description': { id: 'operation-description', level: 'warn' },
  'operation-operationId': { id: 'operation-operation-id', level: 'warn' },
  'operation-operationId-unique': { id: 'operation-operation-id-unique', level: 'error' },
  'operation-success-response': { id: 'operation-success-response', level: 'warn' },
  'operation-tags': { id: 'operation-tags', level: 'warn' },
  'path-keys-no-trailing-slash': { id: 'path-no-trailing-slash', level: 'warn' },
  'oas3-unused-component': { id: 'no-unused-component', level: 'warn' },
  'oas3-valid-media-example': { id: 'example-valid', level: 'warn' },
};

/** Spectral's format names, as the adapters name them. */
const FORMATS: Readonly<Record<string, string>> = {
  oas2: 'swagger2',
  oas3: 'openapi',
  oas3_0: 'openapi',
  'oas3.0': 'openapi',
  oas3_1: 'openapi',
  'oas3.1': 'openapi',
  asyncapi: 'asyncapi',
  asyncapi2: 'asyncapi',
  'asyncapi2.0': 'asyncapi',
};

/** Spectral's severities as `lint`'s levels: `info` and `hint` have no level of their own, so they warn. */
const SEVERITIES = new Map<unknown, Level>([
  ['error', 'error'],
  ['warn', 'warn'],
  ['info', 'warn'],
  ['hint', 'warn'],
  ['off', 'off'],
  [false, 'off'],
  [true, 'warn'],
]);
/** Spectral's numeric severities, by number: `-1` is off. */
const NUMBERED = ['error', 'warn', 'info', 'hint'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Why a rule is not carried: thrown inside the reader, caught per rule. Nothing else in it throws. */
const uncarried = (reason: string): never => {
  throw new Error(`${reason}`);
};

/** A Spectral pattern as the `u`-flag source `pattern` compiles: `/x/` loses its slashes; flags are not carried. */
const patternOf = (value: unknown, key: string): string => {
  if (typeof value !== 'string') return uncarried(`\`pattern\`'s \`${key}\` is not a string`);
  const slashed = /^\/(.*)\/([a-z]*)$/su.exec(value);
  if (slashed !== null && slashed[2] !== '') uncarried(`\`pattern\`'s \`${key}\` has the flags \`${slashed[2] as string}\`, which are not carried`);
  const source = slashed === null ? value : (slashed[1] as string);
  try {
    // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- compiled only to see that it compiles; the ruleset's owner wrote it
    new RegExp(source, 'u');
  } catch {
    uncarried(`\`pattern\`'s \`${key}\` does not compile as a Unicode regular expression`);
  }
  return source;
};

/** A core function's options, checked to mean here what they meant in Spectral. */
const optionsOf = (name: FunctionName, options: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (options === undefined) return undefined;
  if (!isRecord(options)) return uncarried('`functionOptions` is not an object');
  if (name === 'casing') {
    if (!(CASINGS as readonly unknown[]).includes(options.type)) uncarried(`\`casing\` type \`${String(options.type)}\` is not one of ${CASINGS.join(', ')}`);
    const extra = Object.keys(options).filter((key) => key !== 'type');
    if (extra.length > 0) uncarried(`\`casing\` options ${extra.map((key) => `\`${key}\``).join(', ')} are not carried`);
  }
  if (name === 'pattern') {
    return { ...(options.match === undefined ? {} : { match: patternOf(options.match, 'match') }), ...(options.notMatch === undefined ? {} : { notMatch: patternOf(options.notMatch, 'notMatch') }) };
  }
  return options;
};

/** One `then` entry, carried, or why not. */
const thenOf = (then: unknown): Then => {
  if (!isRecord(then)) return uncarried('a `then` entry is not an object');
  const name = then.function;
  if (!(FUNCTIONS as readonly unknown[]).includes(name)) return uncarried(`function \`${String(name)}\` is not a core function apicontract carries (${FUNCTIONS.join(', ')})`);
  const { field } = then;
  if (field !== undefined && (typeof field !== 'string' || field.startsWith('@') || field.startsWith('$'))) uncarried(`\`field\` \`${String(field)}\` is not a member name; \`@key\` and JSONPath fields are not carried`);
  const options = optionsOf(name as FunctionName, then.functionOptions);
  return { function: name as FunctionName, ...(field === undefined ? {} : { field: field as string }), ...(options === undefined ? {} : { functionOptions: options }) };
};

/** A rule's `given`, each path inside the subset. */
const pathsOf = (given: unknown): string[] => {
  const paths = [given].flat();
  if (paths.length === 0 || !paths.every((path) => typeof path === 'string')) return uncarried('`given` is not a JSONPath or a list of them');
  for (const path of paths as string[]) {
    try {
      parse(path);
    } catch (error) {
      uncarried((error as Error).message);
    }
  }
  return paths as string[];
};

/** A numeric severity by its name, `-1` (or any number below 0) as `off`. */
const namedOf = (severity: number): string | undefined => (severity < 0 ? 'off' : NUMBERED.at(severity));

const levelOf = (severity: unknown): Level =>
  SEVERITIES.get(typeof severity === 'number' ? namedOf(severity) : (severity ?? 'warn')) ??
  uncarried(`severity \`${String(severity)}\` is not error, warn, info, hint or off`);

/** One rule definition as a `lint` rule and its level. */
const ruleOf = (id: string, value: Record<string, unknown>, file: string): { rule: Rule; level: Level } => {
  const formats = value.formats === undefined ? undefined : [value.formats].flat().map((format) => FORMATS[String(format)] ?? uncarried(`format \`${String(format)}\` is not one apicontract reads`));
  const paths = pathsOf(value.given);
  const thens = [value.then].flat().map((then) => thenOf(then));
  const description = [value.description, value.message, id].find((text): text is string => typeof text === 'string') as string;
  return {
    rule: {
      description,
      given: { select: 'path', path: paths.length === 1 ? (paths[0] as string) : paths, ...(formats === undefined ? {} : { formats: [...new Set(formats)] }) },
      then: thens.length === 1 ? (thens[0] as Then) : thens,
      fix: `make it hold, as \`${id}\` in ${file} asks: ${description}`,
    },
    level: levelOf(value.severity),
  };
};

/** What `extends` brings in: `spectral:oas`'s equivalents at their levels, and what it could not carry. */
const extendsOf = (value: unknown, file: string): { levels: Map<string, Level>; notCarried: NotCarried[] } => {
  const levels = new Map<string, Level>();
  const notCarried: NotCarried[] = [];
  const entries = value === undefined ? [] : [value].flat().map((entry) => (Array.isArray(entry) ? entry : [entry]));
  for (const [index, [name, mode]] of entries.entries()) {
    const pointer = `#/extends/${String(index)}`;
    if (mode === 'off') continue;
    if (name !== 'spectral:oas') {
      notCarried.push({ id: String(name), file, pointer, reason: `extends \`${String(name)}\`, which apicontract does not read`, fix: `copy the rules you need from \`${String(name)}\` into ${file}, inside the JSONPath subset` });
      continue;
    }
    for (const { id, level } of Object.values(SPECTRAL_OAS)) levels.set(id, level);
    notCarried.push({
      id: 'spectral:oas',
      file,
      pointer,
      reason: `carries ${String(Object.keys(SPECTRAL_OAS).length)} of its rules as apicontract equivalents (${Object.keys(SPECTRAL_OAS).join(', ')}); the others are not carried`,
      fix: 'add the others you rely on as rules in this file, or run `apicontract lint --ruleset recommended` for the built-in set',
    });
  }
  return { levels, notCarried };
};

/** The level a rule's bare severity sets, for a rule `extends` or apicontract defines. */
const overrideOf = (id: string, severity: unknown, known: ReadonlySet<string>): [string, Level] => {
  const target = SPECTRAL_OAS[id]?.id ?? (known.has(id) ? id : uncarried(`it sets the level of \`${id}\`, which no carried ruleset defines`));
  return [target, levelOf(severity)];
};

/** A Spectral ruleset document as `lint` rules; `known` is every rule id a bare severity may set. */
export const readSpectral = (document: unknown, file: string, known: ReadonlySet<string>): ReadRuleset => {
  const value = isRecord(document) ? document : {};
  const { levels, notCarried } = extendsOf(value.extends, file);
  const rules = new Map<string, Rule>();
  for (const [id, definition] of Object.entries(isRecord(value.rules) ? value.rules : {})) {
    try {
      if (isRecord(definition)) {
        const carried = ruleOf(id, definition, file);
        rules.set(id, carried.rule);
        levels.set(id, carried.level);
      } else {
        const [target, level] = overrideOf(id, definition, known);
        levels.set(target, level);
      }
    } catch (error) {
      notCarried.push({ id, file, pointer: `#/rules/${token(id)}`, reason: (error as Error).message, fix: 'rewrite it with core functions and a `given` inside the JSONPath subset, or turn it off here and keep it in Spectral' });
    }
  }
  return { rules: Object.fromEntries(rules), levels: Object.fromEntries(levels), notCarried };
};
