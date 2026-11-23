/**
 * The arbitraries as a module a consumer's tests import (contract-properties R4): one fast-check
 * arbitrary per payload, keyed `<operation> <payload>`, and one per referenced schema, keyed by its
 * reference, tied with `fc.letrec` so a schema that names itself is still one arbitrary.
 *
 * fast-check is the generated file's dependency, never apicontract's: this writes text. A keyword
 * the arbitrary does not hold to is listed in `notGenerated` beside it, so the consumer filters
 * with their validator there, and nothing is dropped in silence.
 */
import { type Contract } from './core/model.js';
import { pointerGet } from './core/resolve.js';
import { has, isDict } from './diff-normalise.js';
import { type Draft, type Format, isFormat, itemsOf, rangeOf, typesOf, wholeIn } from './props-generate.js';
import { draftOf } from './props-judge.js';

type Dict = Readonly<Record<string, unknown>>;

interface Emit {
  readonly root: unknown;
  readonly draft: Draft;
  /** References met, in the order first met: each becomes a key of the letrec. */
  readonly refs: string[];
  /** The keywords each arbitrary does not hold to, by its key. */
  readonly loose: Map<string, Set<string>>;
  /** The references each arbitrary ties to, by its key: looseness is passed along them. */
  readonly uses: Map<string, Set<string>>;
  key: string;
}

const json = (value: unknown): string => JSON.stringify(value);

const FORMAT_ARBITRARY: Readonly<Record<Format, string>> = {
  date: "fc.date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10))",
  'date-time': "fc.date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString())",
  time: "fc.date({ min: new Date('1970-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true }).map((d) => d.toISOString().slice(11))",
  duration: "fc.integer({ min: 1, max: 99 }).map((n) => `P${n}D`)",
  email: 'fc.emailAddress()',
  hostname: 'fc.domain()',
  ipv4: 'fc.ipV4()',
  ipv6: 'fc.ipV6()',
  uuid: 'fc.uuid({ version: 4 })',
  regex: "fc.constantFrom('^a$', '[0-9]+', 'x|y')",
  byte: 'fc.uint8Array({ maxLength: 16 }).map((bytes) => btoa(String.fromCodePoint(...bytes)))',
};

const note = (map: Map<string, Set<string>>, key: string, value: string): void => {
  map.set(key, new Set([...(map.get(key) ?? []), value]));
};

const loose = (emit: Emit, keyword: string): void => {
  note(emit.loose, emit.key, keyword);
};

/** Every key's loose keywords, with `via <ref>` where an arbitrary it ties to is loose itself. */
const looseness = (emit: Emit, keys: readonly string[]): { readonly key: string; readonly keyword: string }[] =>
  keys.flatMap((key) => {
    const reached = new Set<string>();
    // Stryker disable next-line ArrayDeclaration: equivalent, a made-up reference is never loose, so it adds no row
    for (let queue = [...(emit.uses.get(key) ?? [])]; queue.length > 0; ) {
      const ref = queue.shift() as string;
      if (reached.has(ref)) continue;
      reached.add(ref);
      // Stryker disable next-line ArrayDeclaration: equivalent, a made-up reference is never loose, so it adds no row
      queue = [...queue, ...(emit.uses.get(ref) ?? [])];
    }
    const own = [...(emit.loose.get(key) ?? [])];
    const via = [...reached].filter((ref) => ref !== key && emit.loose.has(ref)).map((ref) => `via ${ref}`);
    return [...own, ...via].sort().map((keyword) => ({ key, keyword }));
  });

const options = (entries: Record<string, unknown>): string => {
  const set = Object.entries(entries).filter(([, value]) => value !== undefined);
  return set.length === 0 ? '' : `{ ${set.map(([key, value]) => `${key}: ${String(value)}`).join(', ')} }`;
};

const integerArbitrary = (emit: Emit, schema: Dict): string => {
  const range = rangeOf(schema, emit.draft);
  const [low, high] = wholeIn(range);
  const whole = Number.isInteger(schema.multipleOf);
  const step = whole ? (schema.multipleOf as number) : 1;
  if (has(schema, 'multipleOf') && !whole) loose(emit, 'multipleOf');
  // An open end stays open: the window `rangeOf` draws from is the generator's choice, not the schema's.
  const min = boundOf(schema, 'Minimum') ? Math.ceil(low / step) : undefined;
  const max = boundOf(schema, 'Maximum') ? Math.floor(high / step) : undefined;
  const base = `fc.integer(${options({ min, max })})`;
  return step === 1 ? base : `${base}.map((n) => n * ${String(step)})`;
};

const boundOf = (schema: Dict, side: 'Minimum' | 'Maximum'): boolean => typeof schema[side === 'Minimum' ? 'minimum' : 'maximum'] === 'number' || typeof schema[`exclusive${side}`] === 'number';

/** `true` where a bound is set and excluded, else left out of the options. */
const excluded = (out: boolean, bound: number | undefined): true | undefined => (out && bound !== undefined ? true : undefined);

/** A type no JSON value has: any value, said so beside it. */
const unknownType =
  (type: string) =>
  (emit: Emit): string => {
    loose(emit, `type:${type}`);
    return 'fc.jsonValue()';
  };

const doubleArbitrary = (emit: Emit, schema: Dict): string => {
  if (has(schema, 'multipleOf')) loose(emit, 'multipleOf');
  const range = rangeOf(schema, emit.draft);
  const min = boundOf(schema, 'Minimum') ? range.low : undefined;
  const max = boundOf(schema, 'Maximum') ? range.high : undefined;
  return `fc.double(${options({ min, max, minExcluded: excluded(range.lowOut, min), maxExcluded: excluded(range.highOut, max), noNaN: true, noDefaultInfinity: true })}).map((n) => n + 0)`;
};

const string = (emit: Emit, schema: Dict): string => {
  if (has(schema, 'pattern')) loose(emit, 'pattern');
  const format = schema.format;
  if (isFormat(format)) return new Map(Object.entries(FORMAT_ARBITRARY)).get(format) as string;
  if (format !== undefined) loose(emit, `format:${String(format)}`);
  return `fc.string(${options({ minLength: schema.minLength, maxLength: schema.maxLength })})`;
};

const length = (low: number, high: number | undefined): string => options({ minLength: low > 0 ? low : undefined, maxLength: high }) || '{}';

const array = (emit: Emit, schema: Dict): string => {
  for (const keyword of ['uniqueItems', 'contains']) if (has(schema, keyword)) loose(emit, keyword);
  const { tuple, rest } = itemsOf(schema);
  const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0;
  const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : undefined;
  if (tuple.length === 0) return `fc.array(${arbitrary(emit, rest)}, ${length(minItems, maxItems)})`;
  // A tuple's items are each optional past `minItems`: the prefix is cut to a drawn length, and only a whole prefix has a rest.
  const restMax = maxItems === undefined ? undefined : Math.max(0, maxItems - tuple.length);
  const restArbitrary = rest === false || restMax === 0 ? 'fc.constant([])' : `fc.array(${arbitrary(emit, rest)}, ${length(minItems - tuple.length, restMax)})`;
  const longest = Math.min(tuple.length, maxItems ?? tuple.length);
  const cut = `fc.integer({ min: ${String(Math.min(minItems, longest))}, max: ${String(longest)} })`;
  return `fc.tuple(fc.tuple(${tuple.map((item) => arbitrary(emit, item)).join(', ')}), ${restArbitrary}, ${cut}).map(([head, tail, cut]) => (cut < head.length ? head.slice(0, cut) : [...head, ...tail]))`;
};

const object = (emit: Emit, schema: Dict): string => {
  for (const keyword of ['propertyNames', 'patternProperties', 'dependentRequired', 'dependentSchemas', 'dependencies', 'minProperties', 'maxProperties']) if (has(schema, keyword)) loose(emit, keyword);
  const properties = isDict(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const extra: unknown = schema.additionalProperties ?? true;
  const entries = [...Object.keys(properties).map((name) => [name, arbitrary(emit, properties[name])]), ...required.filter((name) => !has(properties, name)).map((name) => [name, arbitrary(emit, extra)])];
  return `fc.record({ ${entries.map(([name, value]) => `${json(name)}: ${String(value)}`).join(', ')} }, { requiredKeys: ${json(required)} })`;
};

const TYPED: Readonly<Record<string, (emit: Emit, schema: Dict) => string>> = {
  null: () => 'fc.constant(null)',
  boolean: () => 'fc.boolean()',
  integer: integerArbitrary,
  number: doubleArbitrary,
  string,
  array,
  object,
};

const reference = (emit: Emit, schema: Dict): string => {
  const ref = String(schema.$ref);
  try {
    pointerGet(emit.root, ref);
  } catch {
    // A reference that names nothing: any value, and said so beside it.
    loose(emit, '$ref');
    return 'fc.jsonValue()';
  }
  if (!emit.refs.includes(ref)) emit.refs.push(ref);
  note(emit.uses, emit.key, ref);
  if (emit.draft === '2020-12' && Object.keys(schema).length > 1) loose(emit, '$ref-siblings');
  return `tie(${json(ref)})`;
};

const union = (emit: Emit, schema: Dict): string | undefined => {
  const keyword = ['anyOf', 'oneOf'].find((key) => Array.isArray(schema[key]) && (schema[key] as unknown[]).length > 0);
  if (keyword === undefined) return undefined;
  if (Object.keys(schema).length > 1) loose(emit, `${keyword}-siblings`);
  return `fc.oneof(${(schema[keyword] as unknown[]).map((branch) => arbitrary(emit, branch)).join(', ')})`;
};

/** The fast-check expression for `schema`. */
function arbitrary(emit: Emit, schema: unknown): string {
  if (schema === true) return 'fc.jsonValue()';
  if (!isDict(schema)) {
    // A schema no value meets has no arbitrary: one that never yields would hang the consumer's run.
    loose(emit, 'false');
    return 'fc.constant(undefined)';
  }
  for (const keyword of ['not', 'if', 'oneOf', 'unevaluatedProperties', 'unevaluatedItems']) if (has(schema, keyword)) loose(emit, keyword);
  if (typeof schema.$ref === 'string') return reference(emit, schema);
  if (Array.isArray(schema.allOf)) {
    loose(emit, 'allOf');
    return arbitrary(emit, schema.allOf[0] ?? true);
  }
  const branches = union(emit, schema);
  if (branches !== undefined) return branches;
  if (has(schema, 'const')) return `fc.constant(${json(schema.const)})`;
  if (Array.isArray(schema.enum)) return `fc.constantFrom(${schema.enum.map((value) => json(value)).join(', ')})`;
  const kinds = typesOf(schema, emit.draft).map((type) => (new Map(Object.entries(TYPED)).get(type) ?? unknownType(type))(emit, schema));
  return kinds.length === 1 ? (kinds[0] as string) : `fc.oneof(${kinds.join(', ')})`;
}

/** The module text, and how many arbitraries it holds. */
export const emitArbitraries = (contract: Contract, label: string): { readonly text: string; readonly count: number } => {
  // Stryker disable next-line StringLiteral: equivalent, each payload sets the key before anything reads it
  const emit: Emit = { root: contract.document, draft: draftOf(contract), refs: [], loose: new Map(), uses: new Map(), key: '' };
  const entries: [string, string][] = [];
  for (const operation of contract.operations) {
    for (const payload of operation.payloads) {
      if (payload.schema === false) continue;
      emit.key = `${operation.id} ${payload.name}`;
      entries.push([emit.key, arbitrary(emit, payload.schema)]);
    }
  }
  // Each reference met, including those met inside a reference, is a key of its own.
  for (let index = 0; index < emit.refs.length; index += 1) {
    const ref = emit.refs[index] as string;
    emit.key = ref;
    entries.push([ref, arbitrary(emit, pointerGet(emit.root, ref))]);
  }
  const notGenerated = looseness(emit, entries.map(([key]) => key));
  const text = [
    `// Generated by \`apicontract props --emit\` from ${label}. Do not edit: run it again.`,
    '// One fast-check arbitrary per payload (`<operation> <payload>`) and per referenced schema.',
    "import fc from 'fast-check';",
    '',
    'export const arbitraries = fc.letrec((tie) => ({',
    ...entries.map(([key, value]) => `  ${json(key)}: ${value},`),
    '}));',
    '',
    '/** Keywords an arbitrary above does not hold to: filter its values with your validator. */',
    `export const notGenerated = ${json(notGenerated)};`,
    '',
  ].join('\n');
  return { text, count: entries.length };
};
