/**
 * One validator as module source (apicontract-gen-validator R2): a JSON Schema document read by
 * `fromJsonSchema` and written out by `emit` as straight-line code with no imports, compiled ahead of
 * time. A schema that names a function (a format read by a test, not a pattern) has no such text:
 * it goes through the run-time door, the validator package checking the same document at run time,
 * with a finding that says so. Nothing is dropped.
 */
import { emit, emitWith } from 'validator/emit';
import { fromJsonSchema } from 'validator/json-schema';

import { type ContractFinding } from './core/model.js';
import { type Document } from './plugin-json-schema-build.js';

/** The imports the run-time door needs, written once at the top of a module that uses it. */
export const DOOR_IMPORTS = "import { check } from 'validator';\nimport { fromJsonSchema } from 'validator/json-schema';";

/** The type every generated validator is declared with. */
const TYPE = '(value: unknown) => boolean';

export interface Code {
  /** The declaration, with its doc comment. */
  readonly text: string;
  readonly findings: ContractFinding[];
  /** Whether the declaration goes through the run-time door, and needs `DOOR_IMPORTS`. */
  readonly door: boolean;
}

/** A doc comment, with nothing in its lines that would end it early. */
export const comment = (lines: readonly string[]): string => `/**\n${lines.map((line) => ` * ${line.replaceAll('*/', '*\\/')}`.trimEnd()).join('\n')}\n */`;

/** The validator `name` for the document, and where its verdict may differ from the document's. */
export const validatorCode = (name: string, document: Document, where: { readonly label: string; readonly at: string; readonly doc: readonly string[] }): Code => {
  const { schema, findings: read } = fromJsonSchema(document);
  const findings: ContractFinding[] = read.map((finding) => ({
    code: 'validator-not-read',
    pointer: where.at,
    message: `${where.label}: at "${finding.path}" in the document, \`${finding.keyword}\`: ${finding.message}`,
    fix: 'the validator accepts more than the document there: check it in code, or rewrite the schema with keywords the validator reads',
  }));
  if (emitWith(schema).hooks.length === 0) {
    return { text: `${comment(where.doc)}\nexport const ${name}: ${TYPE} = ${emit(schema)};`, findings, door: false };
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
    comment([...where.doc, '', 'Checked at run time: the schema names a format that is a function.']),
    `export const ${name}: ${TYPE} = (value) => check(${held}, value);`,
  ].join('\n');
  return { text, findings, door: true };
};

/** A module of validator declarations: the door's imports when one needs them, then each declaration. */
export const moduleOf = (codes: readonly Code[], after: readonly string[] = []): string => {
  const head = [
    '// @ts-nocheck -- the code is written by the validator package\'s emitter, whose functions take untyped parameters',
    ...(codes.some((code) => code.door) ? [DOOR_IMPORTS] : []),
  ];
  return `${[head.join('\n'), ...codes.map((code) => code.text), ...after].join('\n\n')}\n`;
};
