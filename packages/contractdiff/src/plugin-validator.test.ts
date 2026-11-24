import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { draft07, draft07Cases, legacy, legacyCases, shop, shopCases } from './__fixtures__/validate/corpus.js';
import { ajvCheck, load } from './__fixtures__/validate/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin as jsonSchema } from './plugin-json-schema.js';
import { comment, DOOR_IMPORTS, moduleOf, UNTYPED, validatorCode } from './plugin-validator-code.js';
import { INPUTS, plugin, VALIDATORS_FILE } from './plugin-validator.js';
import { builtins } from './plugins.js';

const scratch = scratchDirs();

const host = () => {
  const made = createHost();
  made.register({ name: 'contractdiff', adapters: builtinAdapters });
  made.register(plugin);
  made.register(jsonSchema);
  return made;
};

type Check = (value: unknown) => boolean;

describe('the validator plugin', () => {
  it('is a built-in plugin the host accepts, for every input format, with a sample it produces on every run', async () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('validator');
    expect(plugin.generators?.validator?.inputs).toBe(INPUTS);
    expect([...INPUTS].toSorted()).toEqual(Object.keys(builtinAdapters).toSorted());
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes one module of named validators and an `operations` map, with a symbol for each', async () => {
    const { files, findings } = await host().run('validator', shop);
    expect(files.map(({ path, owner }) => [path, owner])).toEqual([[VALIDATORS_FILE, 'generated']]);
    const [file] = files;
    expect(file?.symbols).toEqual([
      { operation: 'createOrder', symbol: 'CreateOrderBody' },
      { operation: 'createOrder', symbol: 'CreateOrderResponse201' },
      { operation: 'listTrees', symbol: 'ListTreesParamQueryDepth' },
      { operation: 'listTrees', symbol: 'ListTreesResponse200' },
    ]);
    const content = file?.content ?? '';
    expect(content).not.toContain('@ts-nocheck');
    expect(content).toMatch(/^export type CreateOrderBody = \{ .*;\nexport type CreateOrderBody_0 = \{ "value": number; "children"\?: CreateOrderBody_0\[\] \| undefined \};\n\/\*\*\n \* `createOrder` body:application\/json \(request\)\.\n \*\/\nexport const CreateOrderBody: \(value: unknown\) => value is CreateOrderBody = \(\(\) => \{\n/u);
    expect(content).toContain('/**\n * `listTrees` param:query:depth (request, optional).\n */');
    expect(content).toContain('/**\n * `createOrder` response:201:application/json (response).\n */');
    expect(content.endsWith('export const operations = {\n  "createOrder": {\n    "body:application/json": CreateOrderBody,\n    "response:201:application/json": CreateOrderResponse201,\n  },\n  "listTrees": {\n    "param:query:depth": ListTreesParamQueryDepth,\n    "response:200:application/json": ListTreesResponse200,\n  },\n} as const;\n')).toBe(true);
    expect(content).not.toMatch(/new Function|eval\(|from 'zod'/u);
    expect(findings.map((finding) => finding.code)).toEqual(['keyword-dropped', 'keyword-rewritten', 'keyword-dropped', 'keyword-rewritten']);
    const module = await load(content, scratch('apicontract-validators-'), 'shop');
    expect(Object.keys(module.operations as object)).toEqual(['createOrder', 'listTrees']);
    expect((module.operations as Record<string, Record<string, unknown>>).listTrees?.['param:query:depth']).toBe(module.ListTreesParamQueryDepth);
  });

  it('reports where the validator reads less than the document', async () => {
    const document = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'T', type: 'object', patternProperties: { '^a': { type: 'string' } } };
    const { findings } = await host().run('validator', document);
    expect(findings).toEqual([
      {
        code: 'validator-not-read',
        pointer: '#',
        message: 'TValue: at "" in the document, `patternProperties`: keys matched by a pattern are not held to its schema, and additionalProperties beside it is not applied: the schema accepts more than the document',
        fix: 'the validator accepts more than the document there: check it in code, or rewrite the schema with keywords the validator reads',
      },
    ]);
  });

  it('goes through the run-time door for a format that is a function, with a finding, and still checks it', async () => {
    const document = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Pattern', type: 'string', format: 'regex' };
    const { files, findings } = await host().run('validator', document);
    const content = files[0]?.content ?? '';
    expect(content.startsWith("import { check } from 'truefit';\nimport { fromJsonSchema } from 'truefit/json-schema';\n\n")).toBe(true);
    expect(content).toContain(
      'const PatternValueSchema = fromJsonSchema({"$schema":"https://json-schema.org/draft/2020-12/schema","title":"Pattern","type":"string","format":"regex"}).schema;\nexport type PatternValue = string;\n/**\n * `Pattern` value (request).\n *\n * Checked at run time: the schema names a format that is a function.\n */\nexport const PatternValue: (value: unknown) => value is PatternValue = (value): value is PatternValue => check(PatternValueSchema, value);',
    );
    expect(findings).toEqual([
      {
        code: 'validator-runtime-door',
        pointer: '#',
        message: 'PatternValue: the schema names a format that is a function, not a pattern, which code cannot carry: the validator checks the document at run time',
        fix: 'nothing to do; or use a format with a pattern, to have it compiled ahead of time',
      },
    ]);
    const check = (await load(content, scratch('apicontract-door-'), 'door')).PatternValue as Check;
    expect([check('^a+$'), check('('), check(1)]).toEqual([true, false, false]);
  });

  it('returns its sample files exactly, symbols and all', async () => {
    const generator = plugin.generators?.validator;
    expect((await host().run('validator', generator?.sample.document)).files).toStrictEqual(generator?.sample.files);
  });

  it('imports the run-time door once, in a module where only some validators need it', async () => {
    const document = { title: 'T', type: 'string', format: 'regex', $defs: { Plain: { type: 'integer' } } };
    const content = (await host().run('validator', document)).files[0]?.content ?? '';
    expect(content.match(/^import /gmu)).toHaveLength(2);
    expect(content).toContain('export type PlainValue = number;\n/**');
    expect(content).toContain('export const PlainValue: (value: unknown) => value is PlainValue = (() => {');
    const module = await load(content, scratch('apicontract-mixed-'), 'mixed');
    expect([(module.PlainValue as Check)(1), (module.TValue as Check)('(')]).toEqual([true, false]);
  });

  it('writes an untyped validator, as the json-schema re-check asks, under @ts-nocheck', () => {
    const where = { label: 'A', at: '#', doc: ['a'] };
    const untyped = validatorCode('A', { type: 'string', format: 'regex' }, where);
    const typed = validatorCode('B', { type: 'integer' }, { ...where, typed: true });
    expect([untyped.typed, typed.typed]).toEqual([false, true]);
    expect(UNTYPED).toBe("// @ts-nocheck -- at least one validator below was emitted untyped (typed: false), so its parameters carry no types");
    expect(untyped.text).toBe('const ASchema = fromJsonSchema({"type":"string","format":"regex"}).schema;\n/**\n * a\n *\n * Checked at run time: the schema names a format that is a function.\n */\nexport const A: (value: unknown) => boolean = (value) => check(ASchema, value);');
    expect(moduleOf([typed, untyped]).startsWith(`${UNTYPED}\n${DOOR_IMPORTS}\n\nexport type B = number;\n`)).toBe(true);
    expect(moduleOf([typed]).startsWith('export type B = number;\n')).toBe(true);
  });

  it('writes a doc comment that nothing in it can end early', () => {
    expect(comment(['a */ b', '', 'c'])).toBe('/**\n * a *\\/ b\n *\n * c\n */');
  });
});

describe('J2: ajv over the json-schema output and the generated validators agree on every verdict', () => {
  const corpus = [
    ['shop', shop, shopCases],
    ['legacy', legacy, legacyCases],
    ['draft07', draft07, draft07Cases],
  ] as const;

  it.each(corpus)('%s', async (name, document, cases) => {
    const { files } = await host().run('validator', document);
    const module = await load(files[0]?.content ?? '', scratch('apicontract-j2-'), name);
    const verdicts = new Map<string, Set<boolean>>();
    let compared = 0;
    for (const options of [{}, { refs: 'inline' }, { draft: '07' }]) {
      const run = await host().run('json-schema', document, options);
      for (const file of run.files) {
        const payload = file.path.replace(/\.json$/u, '');
        const ajv = ajvCheck(JSON.parse(file.content));
        const ours = module[payload] as Check;
        // Draft-07 has no `minContains`/`maxContains`: where the document says less, it says so in a finding, and only there may the two differ.
        const lossy = run.findings.some((finding) => finding.message.startsWith(`${payload}: `) && finding.message.includes('draft-07 has no'));
        for (const value of cases[payload] ?? []) {
          const verdict = ours(value);
          if (!lossy) expect(ajv(value), `${payload} ${JSON.stringify(options)} ${JSON.stringify(value)}`).toBe(verdict);
          verdicts.set(payload, (verdicts.get(payload) ?? new Set()).add(verdict));
          compared += 1;
        }
      }
    }
    // Every payload with cases saw both a pass and a fail: no verdict agreed only because both always say the same.
    expect(Object.keys(cases).map((payload) => [payload, verdicts.get(payload)?.size])).toEqual(Object.keys(cases).map((payload) => [payload, 2]));
    expect(compared).toBeGreaterThan(Object.keys(cases).length);
  });
});
