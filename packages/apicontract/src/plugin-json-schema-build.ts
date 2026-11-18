/**
 * One payload as a JSON Schema document of its own (apicontract-gen-validator R2, R3, R5), the
 * shared step under both targets: `json-schema` writes it, `validator` compiles it.
 *
 * The walk knows which keywords hold schemas, so a `$ref` written as data under `const`, `enum`,
 * `default` or `examples` stays data. Every keyword is either carried into the document, rewritten
 * with a finding, or left out with a finding (intent J3): what the source says that the document
 * cannot is never lost silently.
 *
 * References are local JSON Pointers into the source document, followed with `core/resolve.ts`.
 * `refs: 'keep'` writes each target once under the document's `$defs`; `refs: 'inline'` copies each
 * target in place, and keeps under `$defs` only a target that refers to itself, which has no end
 * when inlined. Either way the document is whole: it names nothing outside itself.
 */
import { type Contract, type ContractFinding, type JsonSchema } from './core/model.js';
import { pointerGet } from './core/resolve.js';

/** The dialect a document is written in: 2020-12, or draft-07 for an ajv set up for it. */
export type Draft = '2020-12' | '07';

/** Whether a referenced schema is kept under `$defs` or copied in place. */
export type Refs = 'keep' | 'inline';

/** How the source writes its schemas: 2020-12 (OpenAPI 3.1+, MCP), draft-07 (AsyncAPI, older JSON Schema), or OpenAPI 3.0's Schema Object. */
export type Source = '2020-12' | '07' | 'oas30';

type Dict = Readonly<Record<string, unknown>>;

/** A JSON Schema document, as the targets write it. */
export type Document = Readonly<Record<string, unknown>>;

const isDict = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

export const URI_2020 = 'https://json-schema.org/draft/2020-12/schema';
export const URI_07 = 'http://json-schema.org/draft-07/schema#';

/** What a keyword's value is: one schema, a list of schemas, a map of names to schemas, or data. */
export type Kind = 'schema' | 'list' | 'map' | 'data';

/**
 * Every keyword of the 2020-12 vocabularies (core, applicator, unevaluated, validation, format,
 * content, meta-data) that a document may carry as it is. `$ref`, `$defs` and `$schema` are handled
 * on their own; `$id`, `$anchor` and the dynamic references are not here, because the document
 * resolves by pointer alone.
 */
export const KEYWORDS: ReadonlyMap<string, Kind> = new Map<string, Kind>([
  ['additionalProperties', 'schema'],
  ['propertyNames', 'schema'],
  ['items', 'schema'],
  ['contains', 'schema'],
  ['not', 'schema'],
  ['if', 'schema'],
  ['then', 'schema'],
  ['else', 'schema'],
  ['unevaluatedItems', 'schema'],
  ['unevaluatedProperties', 'schema'],
  ['contentSchema', 'schema'],
  ['allOf', 'list'],
  ['anyOf', 'list'],
  ['oneOf', 'list'],
  ['prefixItems', 'list'],
  ['properties', 'map'],
  ['patternProperties', 'map'],
  ['dependentSchemas', 'map'],
  ['type', 'data'],
  ['enum', 'data'],
  ['const', 'data'],
  ['required', 'data'],
  ['multipleOf', 'data'],
  ['maximum', 'data'],
  ['exclusiveMaximum', 'data'],
  ['minimum', 'data'],
  ['exclusiveMinimum', 'data'],
  ['maxLength', 'data'],
  ['minLength', 'data'],
  ['pattern', 'data'],
  ['maxItems', 'data'],
  ['minItems', 'data'],
  ['uniqueItems', 'data'],
  ['maxContains', 'data'],
  ['minContains', 'data'],
  ['maxProperties', 'data'],
  ['minProperties', 'data'],
  ['dependentRequired', 'data'],
  ['format', 'data'],
  ['contentEncoding', 'data'],
  ['contentMediaType', 'data'],
  ['title', 'data'],
  ['description', 'data'],
  ['default', 'data'],
  ['deprecated', 'data'],
  ['readOnly', 'data'],
  ['writeOnly', 'data'],
  ['examples', 'data'],
  ['$comment', 'data'],
]);

/** Where shared schemas are kept, which the walk writes itself. */
const DEFS = new Set(['$defs', 'definitions']);

/** The dialect each input format writes its schemas in. */
export const sourceOf = (contract: Contract): Source => {
  const document = isDict(contract.document) ? contract.document : {};
  if (contract.format === 'openapi') return String(document.openapi).startsWith('3.0') ? 'oas30' : '2020-12';
  // Swagger 2.0's Schema Object is draft-04's, with boolean exclusive bounds, as OpenAPI 3.0's is.
  if (contract.format === 'swagger2') return 'oas30';
  // AsyncAPI's Schema Object is a superset of draft-07.
  if (contract.format === 'asyncapi') return '07';
  return typeof document.$schema === 'string' && /draft-0[467]/u.test(document.$schema) ? '07' : '2020-12';
};

export interface BuildOptions {
  readonly draft: Draft;
  readonly refs: Refs;
  readonly source: Source;
  /** Who the findings are about, e.g. `ListPetsResponse200`. */
  readonly label: string;
  /** JSON Pointer to where the payload is declared. */
  readonly at: string;
}

export interface Built {
  readonly schema: Document;
  readonly findings: ContractFinding[];
}

interface Def {
  readonly name: string;
  schema: JsonSchema;
}

interface State {
  readonly document: unknown;
  readonly options: BuildOptions;
  readonly findings: ContractFinding[];
  /** The target of each reference written under `$defs`, by the reference. */
  readonly defs: Map<string, Def>;
  readonly names: Set<string>;
  /** References already reported as cycles. */
  readonly cut: Set<string>;
}

const token = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

const quoted = (keys: readonly string[]): string => keys.map((key) => `\`${key}\``).join(', ');

/** A finding about the payload, its message led by the payload's name. */
const report =
  (state: Pick<State, 'findings' | 'options'>) =>
  (code: string, pointer: string, message: string, fix: string): void => {
    state.findings.push({ code, pointer, message: `${state.options.label}: ${message}`, fix });
  };

/** Where a schema is: its pointer, and the references open on the path to it. */
interface Place {
  readonly at: string;
  readonly open: ReadonlySet<string>;
}

/** A finding about a place in the written document. */
type Say = (code: string, message: string, fix: string) => void;

/** A schema the document cannot have: refused, with where it is. */
const invalid = (state: State, at: string, what: string): never => {
  throw new Error(`cannot generate ${state.options.label}: the schema at "${at}" ${what}. fix: correct the document, or validate it against its dialect's meta-schema first`);
};

const without = (schema: Dict, ...keys: readonly string[]): Dict => Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)));

/** Before 2020-12, a `$ref` is the whole of its schema: a keyword beside it is ignored by that dialect, so it is left out here too. */
const lone = (state: State, schema: Dict, at: string): Dict => {
  const beside = Object.keys(schema).filter((key) => key !== '$ref');
  if (beside.length > 0) {
    report(state)('keyword-dropped', at, `${quoted(beside)} beside \`$ref\` ${beside.length === 1 ? 'is' : 'are'} ignored by the source's dialect, and left out`, 'move them into the referenced schema, or put the `$ref` under `allOf` beside them');
  }
  return { $ref: schema.$ref };
};

/** Draft-04's boolean `exclusiveMinimum` and `exclusiveMaximum`, as 2020-12's numbers. */
const exclusive = (state: State, schema: Dict, at: string): Dict => {
  let out = schema;
  for (const [flag, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    const on = out[flag];
    if (typeof on !== 'boolean') continue;
    const value = out[bound];
    out = without(out, flag, bound);
    if (value === undefined) {
      report(state)('keyword-dropped', `${at}/${flag}`, `\`${flag}: ${String(on)}\` is the boolean form of draft-04, and there is no \`${bound}\` beside it: it is left out`, 'nothing to do: it says nothing without the bound');
      continue;
    }
    out = { ...out, [on ? flag : bound]: value };
    report(state)('keyword-rewritten', `${at}/${flag}`, `\`${flag}: ${String(on)}\` is the boolean form of draft-04: written as ${on ? `\`${flag}: ${String(value)}\`` : `\`${bound}\` alone`}`, 'nothing to do: the document means the same');
  }
  return out;
};

/** OpenAPI 3.0's `nullable: true` adds `null` to the schema's `type`; without a `type` it adds nothing (3.0.3). */
const nullable = (state: State, schema: Dict, at: string): Dict => {
  const rest = without(schema, 'nullable');
  if (schema.nullable !== true) return rest;
  if (typeof rest.type === 'string') {
    report(state)('keyword-rewritten', `${at}/nullable`, `\`nullable: true\` is written as \`type: ["${rest.type}", "null"]\``, 'nothing to do: the document means the same');
    return { ...rest, type: [rest.type, 'null'] };
  }
  report(state)('keyword-dropped', `${at}/nullable`, '`nullable: true` without a `type` adds nothing in OpenAPI 3.0.3, and is left out', 'give the schema a `type`, or write `type: [..., "null"]` once on OpenAPI 3.1');
  return rest;
};

/** OpenAPI's `example` is JSON Schema's `examples`. */
const example = (state: State, schema: Dict, at: string): Dict => {
  if (!('example' in schema)) return schema;
  const rest = without(schema, 'example');
  if (rest.examples === undefined) {
    report(state)('keyword-rewritten', `${at}/example`, '`example` is written as `examples: [example]`', 'nothing to do: the document means the same');
    return { ...rest, examples: [schema.example] };
  }
  report(state)('keyword-dropped', `${at}/example`, '`example` beside `examples` is left out', 'move the example into `examples`');
  return rest;
};

/** Draft-07's tuple `items` and its `additionalItems`, and its `dependencies`, as 2020-12 writes them. */
const fromDraft07 = (state: State, schema: Dict, at: string): Dict => {
  let out = schema;
  if (Array.isArray(out.items)) {
    report(state)('keyword-rewritten', `${at}/items`, 'draft-07\'s list of `items` is written as `prefixItems`, and `additionalItems` as `items`', 'nothing to do: the document means the same');
    const rest = without(out, 'items', 'additionalItems');
    out = { ...rest, prefixItems: out.items, ...(out.additionalItems !== undefined && { items: out.additionalItems }) };
  }
  if (isDict(out.dependencies)) {
    report(state)('keyword-rewritten', `${at}/dependencies`, '`dependencies` is written as `dependentRequired` (lists of keys) and `dependentSchemas` (schemas)', 'nothing to do: the document means the same');
    const entries = Object.entries(out.dependencies);
    const keys = entries.filter(([, value]) => Array.isArray(value));
    const schemas = entries.filter(([, value]) => !Array.isArray(value));
    out = {
      ...without(out, 'dependencies'),
      ...(keys.length > 0 && { dependentRequired: Object.fromEntries(keys) }),
      ...(schemas.length > 0 && { dependentSchemas: Object.fromEntries(schemas) }),
    };
  }
  return out;
};

/** The schema with what its source writes in its own way written as 2020-12 does. */
const normalise = (state: State, schema: Dict, at: string): Dict => {
  const { source } = state.options;
  if (typeof schema.$ref === 'string' && source !== '2020-12') return lone(state, schema, at);
  let out = example(state, exclusive(state, schema, at), at);
  if (source === 'oas30') out = nullable(state, out, at);
  if (source === '07') out = fromDraft07(state, out, at);
  return out;
};

/** A name for a shared schema: the last part of its pointer, made safe, and not one already given. */
const define = (state: State, ref: string, target: unknown): string => {
  const known = state.defs.get(ref);
  if (known !== undefined) return known.name;
  const last = (ref.split('/').at(-1) as string).replaceAll('~1', '/').replaceAll('~0', '~');
  const base = ref === '#' ? 'root' : decodeURIComponent(last).replaceAll(/[^\w.-]/gu, '_') || 'def';
  let name = base;
  for (let suffix = 2; state.names.has(name); suffix += 1) name = `${base}${String(suffix)}`;
  state.names.add(name);
  // Stryker disable next-line BooleanLiteral: equivalent, the placeholder is replaced on the next line before anything reads it
  const def: Def = { name, schema: true };
  // Set before it is walked: a target that refers to itself finds its own name.
  state.defs.set(ref, def);
  def.schema = walk(state, target, { at: ref, open: new Set([ref]) });
  return name;
};

/** A `$ref` and the keywords beside it, as the document writes them. */
const referenced = (state: State, ref: unknown, beside: Dict, { at, open }: Place): JsonSchema => {
  if (typeof ref !== 'string') return invalid(state, at, 'has a `$ref` that is not a string');
  if (ref !== '#' && !ref.startsWith('#/')) {
    report(state)('ref-unresolved', `${at}/$ref`, `\`$ref: ${JSON.stringify(ref)}\` is not a JSON Pointer into this document, and is left out: the document accepts any value there`, 'bundle the document first, so every `$ref` is a `#/…` pointer');
    return beside;
  }
  const target = pointerGet(state.document, ref);
  const inline = state.options.refs !== 'keep';
  if (inline && !open.has(ref)) {
    const inlined = walk(state, target, { at: ref, open: new Set(open).add(ref) });
    if (Object.keys(beside).length === 0) return inlined;
    // As `core/resolve.ts` inlines: the keywords beside a reference stay, and its target moves under `allOf`.
    return { ...beside, allOf: [inlined, ...(Array.isArray(beside.allOf) ? (beside.allOf as unknown[]) : [])] };
  }
  if (inline && !state.cut.has(ref)) {
    state.cut.add(ref);
    report(state)('ref-cycle-kept', ref, `\`${ref}\` refers to itself, so it cannot be inlined: it is kept under \`$defs\``, 'nothing to do; or generate with `refs: keep`');
  }
  return { $ref: `#/$defs/${define(state, ref, target)}`, ...beside };
};

/** A keyword's value, with every schema in it walked. */
const child = (state: State, kind: Kind, value: unknown, { at, open }: Place): unknown => {
  if (kind === 'data') return value;
  if (kind === 'schema') return walk(state, value, { at, open });
  if (kind === 'list') {
    if (!Array.isArray(value)) return invalid(state, at, 'is not a list of schemas');
    return value.map((item, index) => walk(state, item, { at: `${at}/${String(index)}`, open }));
  }
  if (!isDict(value)) return invalid(state, at, 'is not an object of schemas');
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(state, item, { at: `${at}/${token(key)}`, open })]));
};

function walk(state: State, schema: unknown, place: Place, root = false): JsonSchema {
  const { at, open } = place;
  if (typeof schema === 'boolean') return schema;
  if (!isDict(schema)) return invalid(state, at, 'is neither an object nor a boolean');
  const normal = normalise(state, schema, at);
  const entries = Object.entries(normal);
  const out = Object.fromEntries(
    entries.flatMap(([key, value]) => {
      const kind = KEYWORDS.get(key);
      return kind === undefined ? [] : [[key, child(state, kind, value, { at: `${at}/${token(key)}`, open })]];
    }),
  );
  // Shared schemas are written once, under the document's own `$defs`, when a reference names them.
  // The payload's own `$schema` is replaced by the document's: only one in a subschema says something lost.
  const dropped = entries.map(([key]) => key).filter((key) => !KEYWORDS.has(key) && key !== '$ref' && !DEFS.has(key) && !(root && key === '$schema'));
  if (dropped.length > 0) {
    report(state)(
      'keyword-dropped',
      at,
      `${quoted(dropped)} ${dropped.length === 1 ? 'is not a keyword' : 'are not keywords'} a JSON Schema validator applies here, and ${dropped.length === 1 ? 'is' : 'are'} left out`,
      'move what it means into a keyword the dialect has, or into `description`',
    );
  }
  return '$ref' in normal ? referenced(state, normal.$ref, out, place) : out;
}

/** A document's body: `true` is the empty schema, `false` the schema nothing passes. */
const body = (schema: JsonSchema): Dict => {
  // Stryker disable next-line ConditionalExpression: equivalent, `true` falls through to a spread of `true`, which is `{}` too
  if (schema === true) return {};
  return schema === false ? { not: {} } : schema;
};

/** Draft-07's tuple: `prefixItems` as a list of `items`, and `items` as `additionalItems`. */
const tuple07 = (out: Dict, say: Say): Dict => {
  if (!('prefixItems' in out)) return out;
  say('keyword-rewritten', '`prefixItems` is written as draft-07\'s list of `items`, and `items` as `additionalItems`', 'nothing to do: the document means the same');
  return { ...without(out, 'prefixItems', 'items'), items: out.prefixItems, ...(out.items !== undefined && { additionalItems: out.items }) };
};

/** Draft-07's `dependencies`, which 2020-12 split in two. */
const dependencies07 = (out: Dict, say: Say): Dict => {
  if (!('dependentRequired' in out || 'dependentSchemas' in out)) return out;
  say('keyword-rewritten', '`dependentRequired` and `dependentSchemas` are written as `dependencies`', 'nothing to do: the document means the same');
  return { ...without(out, 'dependentRequired', 'dependentSchemas'), dependencies: { ...(out.dependentRequired as Dict | undefined), ...(out.dependentSchemas as Dict | undefined) } };
};

/** What draft-07 has no keyword for, left out. */
const missing07 = (out: Dict, say: Say): Dict => {
  const missing = ['minContains', 'maxContains', 'unevaluatedItems', 'unevaluatedProperties'].filter((key) => key in out);
  if (missing.length === 0) return out;
  say('keyword-dropped', `draft-07 has no ${quoted(missing)}, and ${missing.length === 1 ? 'it is' : 'they are'} left out: the document accepts more than the schema`, 'generate with `draft: 2020-12`');
  return without(out, ...missing);
};

/** Draft-07 ignores what stands beside a `$ref`, so the reference moves under `allOf`. */
const ref07 = (out: Dict, say: Say): Dict => {
  const beside = Object.keys(out).filter((key) => !['$ref', '$schema', '$defs'].includes(key));
  if (!('$ref' in out) || beside.length === 0) return out;
  say('keyword-rewritten', '`$ref` with keywords beside it is written under `allOf`, which draft-07 does not ignore', 'nothing to do: the document means the same');
  const rest = without(out, '$ref');
  return { ...rest, allOf: [{ $ref: out.$ref }, ...(Array.isArray(rest.allOf) ? (rest.allOf as unknown[]) : [])] };
};

/** One keyword's value written down to draft-07, every schema in it too. */
const value07 = (state: State, key: string, value: unknown, path: string): unknown => {
  const kind = key === '$defs' ? 'map' : KEYWORDS.get(key);
  if (key === '$ref') return (value as string).replace('#/$defs/', '#/definitions/');
  if (kind === 'schema') return toDraft07(state, value, `${path}/${key}`);
  if (kind === 'list') return (value as unknown[]).map((item, index) => toDraft07(state, item, `${path}/${key}/${String(index)}`));
  if (kind === 'map') return Object.fromEntries(Object.entries(value as Dict).map(([name, item]) => [name, toDraft07(state, item, `${path}/${key}/${token(name)}`)]));
  return value;
};

/** Draft-07 down from 2020-12 (R5): each rewrite and each keyword draft-07 does not have is a finding. */
function toDraft07(state: State, schema: unknown, path: string): unknown {
  if (!isDict(schema)) return schema;
  const say: Say = (code, message, fix) => {
    report(state)(code, state.options.at, `at "${path}" in the document, ${message}`, fix);
  };
  const out = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value07(state, key, value, path)]));
  return ref07(missing07(dependencies07(tuple07(out, say), say), say), say);
}

/** A payload's schema as a whole document in the dialect asked for, and what could not be carried over exactly. */
export const build = (document: unknown, schema: JsonSchema, options: BuildOptions): Built => {
  const state: State = { document, options, findings: [], defs: new Map(), names: new Set(), cut: new Set() };
  const top = body(walk(state, schema, { at: options.at, open: new Set() }, true));
  const defs = state.defs.size === 0 ? {} : { $defs: Object.fromEntries([...state.defs.values()].map((def) => [def.name, def.schema])) };
  const whole: Dict = { $schema: URI_2020, ...top, ...defs };
  if (options.draft === '2020-12') return { schema: whole, findings: state.findings };
  const down = toDraft07(state, whole, '') as Dict;
  const shared = down.$defs;
  const rest = without(down, '$defs', '$schema');
  if (shared !== undefined) {
    report(state)('keyword-rewritten', options.at, '`$defs` is written as draft-07\'s `definitions`', 'nothing to do: the document means the same');
  }
  return { schema: { $schema: URI_07, ...rest, ...(shared !== undefined && { definitions: shared }) }, findings: state.findings };
};
