/**
 * What every schema extractor shares (apicontract-extract R3): loading the user's module, asking a
 * Standard JSON Schema value (standardschema.dev, `~standard.jsonSchema`) for its document, and
 * moving the `$defs` that document carries to where the extracted document keeps its schemas.
 *
 * One function per library is what this replaces: Zod 4, Valibot, ArkType and this repository's
 * validator all answer `~standard.jsonSchema.input({ target })`, so nothing here names a library
 * except to say which one did not answer.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { type ContractFinding } from './core/model.js';
import { stable } from './extract-normalise.js';

export type Json = Record<string, unknown>;

/** Which side of a schema to describe: what `parse` reads, or what it hands out. */
export type Side = 'input' | 'output';

/** The dialect asked for: OpenAPI 3.1 is this one too. */
export const TARGET = 'draft-2020-12';

export const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value is a schema of any Standard Schema library: it has `~standard`. */
export const isStandard = (value: unknown): value is { readonly '~standard': Json } =>
  (isRecord(value) || typeof value === 'function') && isRecord((value as Json)['~standard']);

/** A JSON Pointer step: `/` and `~` escaped. */
export const escape = (step: string): string => step.replaceAll('~', '~0').replaceAll('/', '~1');

export const finding = (code: string, pointer: string, message: string, fix: string): ContractFinding => ({ code, pointer, message, fix });

/**
 * The user's module. A path is imported, which runs the module's code: that is the point, the
 * values it builds carry the constraints a type does not. An object is taken as the module itself,
 * for a caller that has already imported it.
 */
export const loadModule = async (module: unknown): Promise<Json> => {
  if (isRecord(module)) return module;
  if (typeof module !== 'string' || module === '') {
    throw new TypeError('the `module` option names no module. fix: set `"options": { "module": "./src/schemas.ts" }`');
  }
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the module is the user's own code, named in their config: importing it is what extract is
  return { ...((await import(pathToFileURL(resolve(module)).href)) as Json) };
};

/** The `side` option, checked. */
export const sideOf = (value: unknown): Side => {
  if (value === undefined || value === 'input') return 'input';
  if (value === 'output') return 'output';
  throw new TypeError(`the \`side\` option is ${JSON.stringify(value)}. fix: write "input" or "output"`);
};

/** The JSON Schema of one value, or the finding that says why there is none. */
export const toJsonSchema = (value: unknown, side: Side, pointer: string): { readonly schema: Json } | { readonly finding: ContractFinding } => {
  if (!isStandard(value)) {
    return { finding: finding('not-a-standard-schema', pointer, `${pointer} is not a Standard Schema: it has no \`~standard\``, 'export a schema of a Standard Schema library (Zod 4, Valibot, ArkType, validator), or leave it out of the extract') };
  }
  const props = value['~standard'];
  const vendor = typeof props.vendor === 'string' ? props.vendor : 'an unnamed library';
  const converter = props.jsonSchema;
  if (!isRecord(converter) || typeof converter[side] !== 'function') {
    return {
      finding: finding('no-standard-json-schema', pointer, `${pointer} is a schema of ${vendor}, which does not implement Standard JSON Schema (\`~standard.jsonSchema.${side}\`)`, `upgrade ${vendor} to a version that implements Standard JSON Schema (Zod 4.2+), or export the schema from a library that does`),
    };
  }
  try {
    const { $schema: _dialect, ...schema } = (converter[side] as (options: { target: string }) => Json)({ target: TARGET });
    return { schema };
  } catch (error) {
    return { finding: finding('not-representable', pointer, `${vendor} cannot write the ${side} of ${pointer} as JSON Schema: ${error instanceof Error ? error.message : String(error)}`, side === 'output' ? 'extract with `"side": "input"`, or describe the output with a schema of its own' : 'replace the part JSON Schema cannot hold (a transform, a date, a custom check) with one it can') };
  }
};

/** Where relocated schemas go: the reference prefix, the definitions so far, and the findings. */
export interface Place {
  /** `#/$defs/` or `#/components/schemas/`. */
  readonly base: string;
  readonly defs: Map<string, unknown>;
  readonly findings: ContractFinding[];
}

/** A place to collect definitions under `base`. */
export const placeAt = (base: string): Place => ({ base, defs: new Map(), findings: [] });

/** The definitions, as an object, in the order they were added. */
export const definitions = (place: Place): Json => Object.fromEntries(place.defs);

interface Target {
  readonly name: string;
  readonly base: string;
  readonly renamed: ReadonlyMap<string, string>;
}

const reference = (ref: string, target: Target): string => {
  if (ref === '#') return `${target.base}${escape(target.name)}`;
  if (!ref.startsWith('#/$defs/')) return ref;
  const [step, ...tail] = ref.slice('#/$defs/'.length).split('/') as [string, ...string[]];
  const key = step.replaceAll('~1', '/').replaceAll('~0', '~');
  return [`${target.base}${escape(target.renamed.get(key) ?? key)}`, ...tail].join('/');
};

const rewrite = (value: unknown, target: Target): unknown => {
  if (Array.isArray(value)) return value.map((item) => rewrite(item, target));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, key === '$ref' && typeof inner === 'string' ? reference(inner, target) : rewrite(inner, target)]));
};

/**
 * `schema`, written by its library as a document of its own, moved to live at `base + name`: its
 * `$defs` join the place's (a name already there with other content takes `name.` in front, and a
 * finding says so), and every `$ref` is rewritten to match, `#` itself becoming `base + name`.
 */
export const relocate = (schema: Json, name: string, place: Place): Json => {
  const inner = Object.entries(isRecord(schema.$defs) ? schema.$defs : {});
  const renamed = new Map<string, string>();
  for (const [key, value] of inner) {
    const taken = place.defs.has(key) && stable(place.defs.get(key)) !== stable(rewrite(value, { name, base: place.base, renamed: new Map() }));
    renamed.set(key, taken ? `${name}.${key}` : key);
    if (taken) place.findings.push(finding('renamed-definition', `${place.base.slice(1)}${escape(name)}`, `two schemas define "${key}" differently; the one ${name} uses is kept as "${name}.${key}"`, 'give one of them another id'));
  }
  const target: Target = { name, base: place.base, renamed };
  for (const [key, value] of inner) place.defs.set(renamed.get(key) as string, rewrite(value, target));
  const { $defs: _defs, ...rest } = schema;
  return rewrite(rest, target) as Json;
};
