/** The options a run is generated under, and the state the transforms share while it runs. */
import { type EnumStatement, type Statement } from './gen-ts-ast.js';
import { resolveRef } from './gen-ts-ref.js';
import { type NameState, newNameState } from './gen-ts-text.js';

/** openapi-typescript's data-only options, under the same names and defaults. */
export interface GenerateOptions {
  /** Treat every object as open: add `[key: string]: unknown`. */
  readonly additionalProperties?: boolean;
  /** Sort members by name instead of keeping document order. */
  readonly alphabetize?: boolean;
  /** Turn `minItems`/`maxItems` into tuple types. */
  readonly arrayLength?: boolean;
  /** A property with a `default` is not optional. On by default. */
  readonly defaultNonNullable?: boolean;
  /** An object with no members is `Record<string, unknown>` instead of `Record<string, never>`. */
  readonly emptyObjectsUnknown?: boolean;
  /** Emit TypeScript enums instead of string unions. */
  readonly enum?: boolean;
  /** Emit each enum's values as an exported array. */
  readonly enumValues?: boolean;
  /** With `enum`, only convert schemas that carry `x-enum-*` metadata. */
  readonly conditionalEnums?: boolean;
  /** With `enum`, emit each distinct set of members once. */
  readonly dedupeEnums?: boolean;
  /** Leave deprecated members out. */
  readonly excludeDeprecated?: boolean;
  /** Emit `type` aliases instead of interfaces. */
  readonly exportType?: boolean;
  /** Mark every member and array `readonly`. */
  readonly immutable?: boolean;
  /** Emit an alias per component at the top level. */
  readonly rootTypes?: boolean;
  /** With `rootTypes`, drop the `Schema` prefix. */
  readonly rootTypesNoSchemaPrefix?: boolean;
  /** With `rootTypes`, keep schema names as written. */
  readonly rootTypesKeepCasing?: boolean;
  /** Key parameterised paths by a template literal type. */
  readonly pathParamsAsTypes?: boolean;
  /** A schema without `required` requires every property. */
  readonly propertiesRequiredByDefault?: boolean;
  /** Emit an `ApiPaths` enum of every path. */
  readonly makePathsEnum?: boolean;
  /** Add the path parameters a URL names but its operation does not declare. */
  readonly generatePathParams?: boolean;
  /** Wrap `readOnly`/`writeOnly` properties in `$Read<>`/`$Write<>`. */
  readonly readWriteMarkers?: boolean;
}

export interface Discriminator {
  readonly propertyName: string;
  readonly mapping?: Readonly<Record<string, string>>;
}

export interface Discriminators {
  /** Every discriminator in the document, by the pointer of the schema that declares or inherits it. */
  readonly objects: Record<string, Discriminator>;
  /** Schemas whose discriminator property was already written into them. */
  readonly refsHandled: string[];
}

export interface Context extends Required<GenerateOptions> {
  readonly discriminators: Discriminators;
  /** Statements hoisted to the end of the file: operations, enums, value arrays, helper types. */
  readonly injectFooter: Statement[];
  /** What a `$ref` points at, or `undefined`. */
  readonly resolve: (ref: string) => unknown;
}

/** Where a transform stands: the pointer of the node it was handed, and the run it belongs to. */
export interface TransformOptions {
  readonly path?: string;
  readonly ctx: Context;
}

/** State upstream keeps in module scope, kept per run here so one run cannot change the next. */
export interface RunState {
  readonly names: NameState;
  readonly enums: Map<string, EnumStatement>;
}

const STATES = new WeakMap<Context, RunState>();

export const stateOf = (ctx: Context): RunState => {
  let state = STATES.get(ctx);
  if (state === undefined) {
    state = { names: newNameState(), enums: new Map() };
    STATES.set(ctx, state);
  }
  return state;
};

export const DEFAULTS: Required<GenerateOptions> = {
  additionalProperties: false,
  alphabetize: false,
  arrayLength: false,
  defaultNonNullable: true,
  emptyObjectsUnknown: false,
  enum: false,
  enumValues: false,
  conditionalEnums: false,
  dedupeEnums: false,
  excludeDeprecated: false,
  exportType: false,
  immutable: false,
  rootTypes: false,
  rootTypesNoSchemaPrefix: false,
  rootTypesKeepCasing: false,
  pathParamsAsTypes: false,
  propertiesRequiredByDefault: false,
  makePathsEnum: false,
  generatePathParams: false,
  readWriteMarkers: false,
};

/** A context for `document` with every option at its default unless given. */
export const createContext = (
  document: unknown,
  options: GenerateOptions = {},
  discriminators: Discriminators = { objects: {}, refsHandled: [] },
): Context => {
  const given = Object.entries(options).filter(([name, value]) => name in DEFAULTS && value !== undefined);
  return {
    ...DEFAULTS,
    ...(Object.fromEntries(given) as GenerateOptions),
    discriminators,
    injectFooter: [],
    resolve: (ref) => resolveRef(document, ref),
  };
};
