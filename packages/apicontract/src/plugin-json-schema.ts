/**
 * The built-in `json-schema` target (apicontract-gen-validator R3, R5, R7): one JSON Schema document
 * per payload, `<Name>.json`, that a team's own ajv compiles unchanged. Draft 2020-12 or draft-07;
 * each reference kept under `$defs` or inlined.
 *
 * With `dialect`, each payload is narrowed to what that model provider accepts instead,
 * `<Name>.<dialect>.json`, and when anything was dropped or rewritten, `recheck.ts` holds a
 * validator for the full schema, `<Name>Recheck`, to check the model's answer locally (narrow, then
 * re-check). A limit a provider sets per request, not per schema, is checked over the whole set.
 */
import { type Contract, type ContractFinding } from './core/model.js';
import { type GeneratedFile, type GeneratedSymbol, type Generator, type GeneratorResult, type Options, type Plugin } from './host.js';
import { build, type Document, type Draft, type Refs, sourceOf } from './plugin-json-schema-build.js';
import { dialect as anthropic } from './plugin-json-schema-dialect-anthropic.js';
import { dialect as gemini } from './plugin-json-schema-dialect-gemini.js';
import { dialect as mcpElicitation } from './plugin-json-schema-dialect-mcp-elicitation.js';
import { dialect as mcp } from './plugin-json-schema-dialect-mcp.js';
import { dialect as openai } from './plugin-json-schema-dialect-openai.js';
import { type Dialect, narrow, overLimits } from './plugin-json-schema-dialect.js';
import { type Code, moduleOf, validatorCode } from './plugin-validator-code.js';
import { namedPayloads } from './plugin-validator-names.js';
import { INPUTS } from './plugin-validator.js';

/** The dialect tables, by the name `dialect` takes. */
export const DIALECTS: ReadonlyMap<string, Dialect> = new Map([
  ['anthropic', anthropic],
  ['gemini', gemini],
  ['mcp', mcp],
  ['mcp-elicitation', mcpElicitation],
  ['openai', openai],
]);

/** The file the re-checks are written to, with a dialect. */
export const RECHECK_FILE = 'recheck.ts';

const DRAFTS: ReadonlyMap<unknown, Draft> = new Map<unknown, Draft>([
  [undefined, '2020-12'],
  ['2020-12', '2020-12'],
  ['07', '07'],
]);

const REFS: ReadonlyMap<unknown, Refs> = new Map<unknown, Refs>([
  [undefined, 'keep'],
  ['keep', 'keep'],
  // Stryker disable next-line StringLiteral: equivalent, every `refs` but `keep` inlines
  ['inline', 'inline'],
]);

/** An option's value, or a refusal that names the values it takes. */
const option = <T>(options: Options, key: string, values: ReadonlyMap<unknown, T>): T => {
  const value = values.get(options[key]);
  if (value === undefined) {
    const names = [...values.keys()].filter((name) => name !== undefined).join(', ');
    throw new Error(`json-schema: the option \`${key}\` is ${JSON.stringify(options[key])}. fix: use one of: ${names}`);
  }
  return value;
};

const text = (schema: Document): string => `${JSON.stringify(schema, null, 2)}\n`;

/** The documents for every payload, plain or narrowed to a dialect, and what could not be carried over. */
export const generateSchemas = (contract: Contract, options: Options = {}): GeneratorResult => {
  const draft = option(options, 'draft', DRAFTS);
  const refs = option(options, 'refs', REFS);
  const dialect = options.dialect === undefined ? undefined : option(options, 'dialect', DIALECTS);
  const name = options.dialect as string;
  if (dialect !== undefined && draft !== '2020-12') {
    throw new Error(`json-schema: \`dialect: ${name}\` writes 2020-12, and \`draft\` is ${draft}. fix: leave \`draft\` out, or drop \`dialect\``);
  }
  const source = sourceOf(contract);
  const findings: ContractFinding[] = [];
  const files: GeneratedFile[] = [];
  const named = namedPayloads(contract);
  if (dialect === undefined) {
    for (const { name: label, operation, payload } of named) {
      const built = build(contract.document, payload.schema, { draft, refs, source, label, at: operation.source });
      findings.push(...built.findings);
      files.push({ path: `${label}.json`, owner: 'generated', content: text(built.schema), symbols: [{ operation: operation.id, symbol: label }] });
    }
    return { files, findings };
  }
  const rechecks: Code[] = [];
  const checked: GeneratedSymbol[] = [];
  // Stryker disable next-line ArrayDeclaration: equivalent, an entry that is no schema measures zero against every limit
  const narrowed: { label: string; at: string; schema: Document }[] = [];
  // A payload that says nothing is sent (`false`) is no schema to give a model.
  for (const { name: label, operation, payload } of named.filter((entry) => entry.payload.schema !== false)) {
    const where = { label, at: operation.source };
    const built = build(contract.document, payload.schema, { draft, refs: dialect.refs, source, ...where });
    const result = narrow(name, dialect, built.schema, where);
    findings.push(...built.findings, ...result.findings);
    if (result.narrowed === undefined) continue;
    narrowed.push({ ...where, schema: result.narrowed.schema });
    files.push({ path: `${label}.${name}.json`, owner: 'generated', content: text(result.narrowed.schema), symbols: [{ operation: operation.id, symbol: label }] });
    if (result.narrowed.dropped.length === 0) continue;
    // The re-check reads the full schema, references kept, so one that refers to itself stays finite.
    const full = build(contract.document, payload.schema, { draft, refs: 'keep', source, ...where });
    const doc = [
      `Re-checks an answer to \`${label}.${name}.json\` against the full schema of \`${operation.id}\` ${payload.name}.`,
      `${name} was given less than the full schema; the narrowed schema does not say:`,
      ...result.narrowed.dropped.map((line) => `- ${line}`),
    ];
    const code = validatorCode(`${label}Recheck`, full.schema, { ...where, doc });
    findings.push(...code.findings);
    rechecks.push(code);
    checked.push({ operation: operation.id, symbol: `${label}Recheck` });
  }
  findings.push(...overLimits(name, dialect, narrowed));
  if (rechecks.length > 0) {
    files.push({ path: RECHECK_FILE, owner: 'generated', content: moduleOf(rechecks), symbols: checked });
  }
  return { files, findings };
};

/** The sample: one operation whose body names a shared schema with an optional key. */
const document = {
  openapi: '3.1.0',
  paths: {
    '/pets': {
      post: {
        operationId: 'createPet',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { '201': {} },
      },
    },
  },
  components: { schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, tag: { type: 'string' } } } } },
};

/** The body, its shared schema kept under `$defs`. */
const SAMPLE_BODY = `${JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: '#/$defs/Pet',
    $defs: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 }, tag: { type: 'string' } } } },
  },
  null,
  2,
)}\n`;

/** A response with no content: no value passes. */
const SAMPLE_NOTHING = `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', not: {} }, null, 2)}\n`;

const jsonSchema: Generator = {
  description: 'A JSON Schema document per payload (2020-12 or draft-07), or the subset a model provider accepts with a validator that re-checks the answer',
  inputs: INPUTS,
  options: {
    draft: { type: 'string', choices: ['2020-12', '07'], default: '2020-12', description: 'the JSON Schema dialect to write' },
    refs: { type: 'string', choices: ['keep', 'inline'], default: 'keep', description: 'keep each referenced schema under `$defs`, or copy it in place' },
    dialect: { type: 'string', choices: [...DIALECTS.keys()], description: 'narrow to what this model provider accepts, and write a re-check' },
  },
  sample: {
    document,
    files: [
      { path: 'CreatePetBody.json', owner: 'generated', content: SAMPLE_BODY, symbols: [{ operation: 'createPet', symbol: 'CreatePetBody' }] },
      { path: 'CreatePetResponse201.json', owner: 'generated', content: SAMPLE_NOTHING, symbols: [{ operation: 'createPet', symbol: 'CreatePetResponse201' }] },
    ],
  },
  run: (contract, options) => generateSchemas(contract, options),
};

export const plugin: Plugin = { name: 'json-schema', generators: { 'json-schema': jsonSchema } };
