/**
 * The built-in `validator` target (apicontract-gen-validator R1, R2, R6): `validators.ts`, one
 * validator per payload, compiled ahead of time by the validator package's emitter. No `new
 * Function`, no compile at run time, and each validator a declaration of its own, so a bundler
 * keeps only the ones an import names. `operations` maps an operation id and a payload name to its
 * validator, for a server plugin to look one up.
 *
 * Each payload is written as a JSON Schema document first (`plugin-json-schema-build.ts`, refs kept
 * under `$defs`), so the validator and the `json-schema` target describe one document. The body
 * carries no header: the writer adds it.
 */
import { type Contract, type ContractFinding } from './core/model.js';
import { type GeneratedFile, type Generator, type GeneratorResult, type Plugin } from './host.js';
import { build, sourceOf } from './plugin-json-schema-build.js';
import { type Code, comment, moduleOf, validatorCode } from './plugin-validator-code.js';
import { namedPayloads } from './plugin-validator-names.js';

/** The file the target writes, relative to the output folder. */
export const VALIDATORS_FILE = 'validators.ts';

/** Every input format: a payload is a JSON Schema whichever document it came from. */
export const INPUTS = ['openapi', 'swagger2', 'asyncapi', 'mcp', 'jsonschema'] as const;

/** The validators of every payload of a contract, as one module. */
export const generateValidators = (contract: Contract): GeneratorResult => {
  const source = sourceOf(contract);
  const findings: ContractFinding[] = [];
  const codes: Code[] = [];
  const named = namedPayloads(contract);
  for (const { name, operation, payload } of named) {
    const where = { label: name, at: operation.source };
    const built = build(contract.document, payload.schema, { draft: '2020-12', refs: 'keep', source, ...where });
    const code = validatorCode(name, built.schema, { ...where, doc: [`\`${operation.id}\` ${payload.name} (${payload.direction}${payload.required ? '' : ', optional'}).`] });
    findings.push(...built.findings, ...code.findings);
    codes.push(code);
  }
  const byOperation = new Map<string, string[]>();
  for (const { name, operation, payload } of named) {
    byOperation.set(operation.id, [...(byOperation.get(operation.id) ?? []), `    ${JSON.stringify(payload.name)}: ${name},`]);
  }
  const map = [
    comment(['Every validator, by operation id and payload name.']),
    'export const operations = {',
    ...[...byOperation].map(([id, lines]) => `  ${JSON.stringify(id)}: {\n${lines.join('\n')}\n  },`),
    '} as const;',
  ].join('\n');
  const file: GeneratedFile = {
    path: VALIDATORS_FILE,
    owner: 'generated',
    content: moduleOf(codes, [map]),
    symbols: named.map(({ name, operation }) => ({ operation: operation.id, symbol: name })),
  };
  return { files: [file], findings };
};

/** The sample: one operation with a query parameter and a response that names a shared schema. */
const document = {
  openapi: '3.1.0',
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }],
        responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } },
      },
    },
  },
  components: { schemas: { Pet: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
};

const SAMPLE = `// @ts-nocheck -- the code is written by the validator package's emitter, whose functions take untyped parameters

/**
 * \`listPets\` param:query:limit (request, optional).
 */
export const ListPetsParamQueryLimit: (value: unknown) => boolean = (() => {

return (v) => typeof v === "number" && v >= 1 && v <= 1.7976931348623157e+308 && Number.isInteger(v);
})();

/**
 * \`listPets\` response:200:application/json (response).
 */
export const ListPetsResponse200: (value: unknown) => boolean = (() => {
const f0 = (v) => typeof v === "object" && v !== null && !Array.isArray(v)
  && (typeof v["id"] === "string");
const g0 = (v) => f0(v);
const f2 = (v) => {
  if (!Array.isArray(v)) return false;
  for (let i = 0; i < v.length; i++) if (!(g0(v[i]))) return false;
  return true;
};
return (v) => f2(v);
})();

/**
 * Every validator, by operation id and payload name.
 */
export const operations = {
  "listPets": {
    "param:query:limit": ListPetsParamQueryLimit,
    "response:200:application/json": ListPetsResponse200,
  },
} as const;
`;

const validator: Generator = {
  description: 'A validator for every payload, compiled ahead of time to straight-line code, and an `operations` map to look one up',
  inputs: INPUTS,
  sample: {
    document,
    files: [
      {
        path: VALIDATORS_FILE,
        owner: 'generated',
        symbols: [
          { operation: 'listPets', symbol: 'ListPetsParamQueryLimit' },
          { operation: 'listPets', symbol: 'ListPetsResponse200' },
        ],
        content: SAMPLE,
      },
    ],
  },
  run: (contract) => generateValidators(contract),
};

export const plugin: Plugin = { name: 'validator', generators: { validator } };
