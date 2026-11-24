/**
 * One validator as module source (apicontract-gen-validator R2): a JSON Schema document read by
 * `fromJsonSchema` and written out by `emit` as straight-line TypeScript with no imports, compiled
 * ahead of time: a guard `(value: unknown) => value is <Name>`, beside `export type <Name>`, the
 * type the schema validates as `typeOf` writes it, so the module type-checks under `strict`. A
 * schema that names a function (a format read by a test, not a pattern) has no such text: it goes
 * through the run-time door, the validator package checking the same document at run time, with a
 * finding that says so. Nothing is dropped.
 */
import { emit, emitWith, typeOf } from 'valz/emit';
import { fromJsonSchema } from 'valz/json-schema';

import { type ContractFinding } from './core/model.js';
import { type Document } from './plugin-json-schema-build.js';

/** The imports the run-time door needs, written once at the top of a module that uses it. */
export const DOOR_IMPORTS = "import { check } from 'valz';\nimport { fromJsonSchema } from 'valz/json-schema';";

/** The type a generated validator is declared with: a guard of the type declared under its own name. */
const guard = (name: string): string => `(value: unknown) => value is ${name}`;

/** The type the validator `name` accepts, under that name, and the aliases of the schemas in it that name themselves. */
const declared = (name: string, schema: Parameters<typeof typeOf>[0]): string => {
  const { text, aliases } = typeOf(schema, name);
  return [`export type ${name} = ${text};`, ...[...aliases].map(([alias, type]) => `export type ${alias} = ${type};`)].join('\n');
};

export interface Code {
  /** The declaration, with its doc comment. */
  readonly text: string;
  readonly findings: ContractFinding[];
  /** Whether the declaration goes through the run-time door, and needs `DOOR_IMPORTS`. */
  readonly door: boolean;
  /** Whether the declaration is a typed guard; a module that holds one that is not starts with `UNTYPED`. */
  readonly typed: boolean;
}

/**
 * What a module of untyped validators starts with: their functions take untyped parameters. Only
 * the `json-schema` target's re-checks are still written so; `gen validator` writes typed guards.
 */
export const UNTYPED = "// @ts-nocheck -- at least one validator below was emitted untyped (typed: false), so its parameters carry no types";

/** Where a validator comes from, what its doc comment says, and whether it is a typed guard (`typed`, false unless given). */
export interface Where {
  readonly label: string;
  readonly at: string;
  readonly doc: readonly string[];
  readonly typed?: boolean;
}

/** A doc comment, with nothing in its lines that would end it early. */
export const comment = (lines: readonly string[]): string => `/**\n${lines.map((line) => ` * ${line.replaceAll('*/', '*\\/')}`.trimEnd()).join('\n')}\n */`;

/** The validator `name` for the document, and where its verdict may differ from the document's. */
export const validatorCode = (name: string, document: Document, where: Where): Code => {
  const { schema, findings: read } = fromJsonSchema(document);
  const findings: ContractFinding[] = read.map((finding) => ({
    code: 'validator-not-read',
    pointer: where.at,
    message: `${where.label}: at "${finding.path}" in the document, \`${finding.keyword}\`: ${finding.message}`,
    fix: 'the validator accepts more than the document there: check it in code, or rewrite the schema with keywords the validator reads',
  }));
  const typed = where.typed === true;
  // An untyped validator is declared as it was before guards: a boolean, with no type beside it.
  const [type, declaration] = typed ? [`${declared(name, schema)}\n`, guard(name)] : ['', '(value: unknown) => boolean'];
  if (emitWith(schema).hooks.length === 0) {
    return { text: `${type}${comment(where.doc)}\nexport const ${name}: ${declaration} = ${emit(schema, { typescript: typed, ...(typed && { type: name }) })};`, findings, door: false, typed };
  }
  findings.push({
    code: 'validator-runtime-door',
    pointer: where.at,
    message: `${where.label}: the schema names a format that is a function, not a pattern, which code cannot carry: the validator checks the document at run time`,
    fix: 'nothing to do; or use a format with a pattern, to have it compiled ahead of time',
  });
  const held = `${name}Schema`;
  const text = [
    `const ${held} = fromJsonSchema(${JSON.stringify(document)}).schema;`,
    `${type}${comment([...where.doc, '', 'Checked at run time: the schema names a format that is a function.'])}`,
    `export const ${name}: ${declaration} = (value)${typed ? `: value is ${name}` : ''} => check(${held}, value);`,
  ].join('\n');
  return { text, findings, door: true, typed };
};

/** A module of validator declarations: `UNTYPED` when one is not typed, the door's imports when one needs them, then each declaration. */
export const moduleOf = (codes: readonly Code[], after: readonly string[] = []): string => {
  const head = [...(codes.some((code) => !code.typed) ? [UNTYPED] : []), ...(codes.some((code) => code.door) ? [DOOR_IMPORTS] : [])];
  return `${[...(head.length > 0 ? [head.join('\n')] : []), ...codes.map((code) => code.text), ...after].join('\n\n')}\n`;
};
