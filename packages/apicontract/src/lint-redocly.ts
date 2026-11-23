/**
 * A `redocly.yaml` read as `lint` rules (apicontract-lint spec.md R9). Redocly's configurable
 * rules (`rule/<name>`: a `subject` and `assertions`) are carried when the subject is a node the
 * model selects and every assertion has a core function that means the same; a built-in rule
 * with an apicontract equivalent takes its level. Everything else is listed as not carried.
 */
import { type Level, type Rule, type Then } from './lint-engine.js';
import { type Given } from './lint-select.js';
import { type NotCarried, patternOf, type ReadRuleset, uncarried } from './lint-spectral.js';

/**
 * Redocly built-in rules with an apicontract equivalent, and the level `extends: [recommended]` gives each.
 * ponytail: written from Redocly's documented rules; that the two find the same things is _unmeasured_.
 */
export const REDOCLY_RECOMMENDED: Readonly<Record<string, { readonly id: string; readonly level: Level }>> = {
  'info-description': { id: 'info-description', level: 'warn' },
  'operation-description': { id: 'operation-description', level: 'warn' },
  'operation-operationId': { id: 'operation-operation-id', level: 'warn' },
  'operation-operationId-unique': { id: 'operation-operation-id-unique', level: 'error' },
  'operation-2xx-response': { id: 'operation-success-response', level: 'warn' },
  'parameter-description': { id: 'parameter-description', level: 'warn' },
  'no-path-trailing-slash': { id: 'path-no-trailing-slash', level: 'error' },
  'no-unresolved-refs': { id: 'no-unresolved-ref', level: 'error' },
  'no-unused-components': { id: 'no-unused-component', level: 'warn' },
  'no-invalid-media-type-examples': { id: 'example-valid', level: 'warn' },
};

/** A subject type as the node a `given` selects. */
const SUBJECTS: Readonly<Record<string, Given>> = {
  Root: { select: 'document' },
  Info: { select: 'path', path: '$.info' },
  Operation: { select: 'operation' },
  Parameter: { select: 'parameter' },
  Schema: { select: 'schema' },
};

/** Redocly's casings as `casing`'s types. */
const CASINGS: Readonly<Record<string, string>> = {
  camelCase: 'camel',
  PascalCase: 'pascal',
  'kebab-case': 'kebab',
  snake_case: 'snake',
  MACRO_CASE: 'macro',
  flatcase: 'flat',
};

const LEVELS = new Map<unknown, Level>([
  ['error', 'error'],
  ['warn', 'warn'],
  ['off', 'off'],
]);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const levelOf = (severity: unknown): Level => LEVELS.get(severity ?? 'error') ?? uncarried(`severity \`${String(severity)}\` is not error, warn or off`);

/** One assertion as the `then` that checks it. */
const thenOf = (name: string, value: unknown): Omit<Then, 'field'> => {
  switch (name) {
    case 'defined': {
      return { function: value === false ? 'undefined' : 'defined' };
    }
    case 'nonEmpty': {
      return { function: 'length', functionOptions: { min: 1 } };
    }
    case 'pattern': {
      return { function: 'pattern', functionOptions: { match: patternOf(value, 'match') } };
    }
    case 'notPattern': {
      return { function: 'pattern', functionOptions: { notMatch: patternOf(value, 'notMatch') } };
    }
    case 'casing': {
      const type = CASINGS[String(value)] ?? uncarried(`casing \`${String(value)}\` is not one of ${Object.keys(CASINGS).join(', ')}`);
      return { function: 'casing', functionOptions: { type } };
    }
    case 'enum': {
      return Array.isArray(value) ? { function: 'enumeration', functionOptions: { values: value } } : uncarried('`enum` is not a list');
    }
    case 'const': {
      return { function: 'enumeration', functionOptions: { values: [value] } };
    }
    case 'minLength':
    case 'maxLength': {
      if (typeof value !== 'number') return uncarried(`\`${name}\` is not a number`);
      return { function: 'length', functionOptions: name === 'minLength' ? { min: value } : { max: value } };
    }
    default: {
      return uncarried(`assertion \`${name}\` has no core function that means the same`);
    }
  }
};

/** A configurable rule as a `lint` rule and its level. */
const ruleOf = (id: string, value: Record<string, unknown>, file: string): { rule: Rule; level: Level } => {
  for (const key of ['where', 'function']) if (value[key] !== undefined) uncarried(`\`${key}\` is not carried`);
  const subject = isRecord(value.subject) ? value.subject : uncarried('it has no `subject`');
  const given = SUBJECTS[String(subject.type)] ?? uncarried(`subject type \`${String(subject.type)}\` is not one of ${Object.keys(SUBJECTS).join(', ')}`);
  for (const key of Object.keys(subject)) if (key !== 'type' && key !== 'property') uncarried(`\`subject.${key}\` is not carried`);
  const fields = subject.property === undefined ? [undefined] : [subject.property].flat().map((field) => (typeof field === 'string' ? field : uncarried('`subject.property` is not a name or a list of names')));
  const assertions = isRecord(value.assertions) && Object.keys(value.assertions).length > 0 ? value.assertions : uncarried('it has no `assertions`');
  const thens = fields.flatMap((field) => Object.entries(assertions).map(([name, option]): Then => ({ ...thenOf(name, option), ...(field === undefined ? {} : { field }) })));
  const description = typeof value.message === 'string' ? value.message : id;
  return {
    rule: { description, given, then: thens.length === 1 ? (thens[0] as Then) : thens, fix: `make it hold, as \`${id}\` in ${file} asks: ${description}` },
    level: levelOf(value.severity),
  };
};

/** What `extends` brings in: `recommended`'s equivalents at their levels, and what it could not carry. */
const extendsOf = (value: unknown, file: string): { levels: Map<string, Level>; notCarried: NotCarried[] } => {
  const levels = new Map<string, Level>();
  const notCarried: NotCarried[] = [];
  for (const [index, name] of [value ?? []].flat().entries()) {
    const pointer = `#/extends/${String(index)}`;
    if (name !== 'recommended') {
      notCarried.push({ id: String(name), file, pointer, reason: `extends \`${String(name)}\`, which apicontract does not read`, fix: `name the rules you need from \`${String(name)}\` in ${file}` });
      continue;
    }
    for (const { id, level } of Object.values(REDOCLY_RECOMMENDED)) levels.set(id, level);
    notCarried.push({
      id: 'recommended',
      file,
      pointer,
      reason: `carries ${String(Object.keys(REDOCLY_RECOMMENDED).length)} of its rules as apicontract equivalents (${Object.keys(REDOCLY_RECOMMENDED).join(', ')}); the others are not carried`,
      fix: 'write the others you rely on as `rule/…` assertions in this file, or run `apicontract lint --ruleset recommended` for the built-in set',
    });
  }
  return { levels, notCarried };
};

/** The keys of a Redocly config that hold no rules, each listed as not carried. */
const IGNORED = ['plugins', 'decorators', 'preprocessors', 'apis', 'configurable-rules'];

/** One `rules` entry: a configurable rule carried, or the level a built-in rule's severity sets. */
interface Reading {
  readonly file: string;
  readonly known: ReadonlySet<string>;
  readonly rules: Map<string, Rule>;
  readonly levels: Map<string, Level>;
}

const entryOf = (id: string, definition: unknown, into: Reading): void => {
  if (isRecord(definition) && id.startsWith('rule/')) {
    const carried = ruleOf(id, definition, into.file);
    into.rules.set(id, carried.rule);
    into.levels.set(id, carried.level);
    return;
  }
  const severity = isRecord(definition) ? definition.severity : definition;
  const target = REDOCLY_RECOMMENDED[id]?.id ?? (into.known.has(id) ? id : uncarried(`it sets the level of \`${id}\`, which no carried ruleset defines`));
  into.levels.set(target, levelOf(severity));
};

/** A Redocly config document as `lint` rules; `known` is every rule id a bare severity may set. */
export const readRedocly = (document: unknown, file: string, known: ReadonlySet<string>): ReadRuleset => {
  const value = isRecord(document) ? document : {};
  const { levels, notCarried } = extendsOf(value.extends, file);
  for (const key of IGNORED.filter((each) => value[each] !== undefined)) {
    notCarried.push({ id: key, file, pointer: `#/${key}`, reason: `\`${key}\` is not carried`, fix: `keep \`${key}\` running in Redocly; lint reads \`rules\` and \`extends\`` });
  }
  const rules = new Map<string, Rule>();
  for (const [id, definition] of Object.entries(isRecord(value.rules) ? value.rules : {})) {
    try {
      entryOf(id, definition, { file, known, rules, levels });
    } catch (error) {
      notCarried.push({ id, file, pointer: `#/rules/${token(id)}`, reason: (error as Error).message, fix: 'rewrite it as a `rule/…` with a subject apicontract selects and assertions it carries, or keep it in Redocly' });
    }
  }
  return { rules: Object.fromEntries(rules), levels: Object.fromEntries(levels), notCarried };
};
