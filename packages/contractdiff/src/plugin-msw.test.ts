import { describe, expect, it } from 'vitest';

import { shop } from './__fixtures__/clients/harness.js';
import { checkPlugin, createHost, validate } from './host.js';
import { builtinAdapters } from './inputs.js';
import { HANDLERS_FILE, plugin, SCENARIOS_FILE } from './plugin-msw.js';
import { builtins } from './plugins.js';

const host = () => {
  const created = createHost();
  created.register({ name: 'contractdiff', adapters: builtinAdapters });
  created.register(plugin);
  return created;
};

const one = (content: Record<string, unknown>) => ({
  openapi: '3.1.0',
  info: { title: 't', version: '1' },
  paths: { '/x': { get: { operationId: 'x', responses: { '200': { description: 'OK', content } } } } },
});

const scenarioOf = async (content: Record<string, unknown>) => {
  const { files, findings } = await host().run('msw', one(content));
  return { line: files[1]?.content.split('\n').find((text) => text.startsWith('    "200"')), findings };
};

describe('the msw plugin', () => {
  it('is a built-in the host accepts, with one generator that reads OpenAPI', () => {
    expect(() => validate(plugin)).not.toThrow();
    expect(builtins).toContain(plugin);
    expect(plugin.name).toBe('msw');
    expect(Object.keys(plugin.generators ?? {})).toEqual(['msw']);
    expect(plugin.generators?.msw?.inputs).toEqual(['openapi']);
  });

  it('produces exactly its sample, on every run', async () => {
    expect(await checkPlugin(plugin)).toEqual([]);
  });

  it('writes handlers.ts and scenarios.ts for the fixture spec, and reports every synthesised body', async () => {
    const { files, findings } = await host().run('msw', shop);
    expect(files.map((file) => [file.path, file.owner])).toEqual([
      [HANDLERS_FILE, 'generated'],
      [SCENARIOS_FILE, 'generated'],
    ]);
    expect(files[0]?.symbols).toEqual(files[1]?.symbols);
    expect(files[0]?.symbols?.[0]).toEqual({ operation: 'createPet', symbol: 'createPet' });
    await expect(files[0]?.content).toMatchFileSnapshot('./__fixtures__/clients/shop/handlers.ts.snap');
    await expect(files[1]?.content).toMatchFileSnapshot('./__fixtures__/clients/shop/scenarios.ts.snap');
    expect(findings.map((finding) => [finding.code, finding.pointer])).toEqual([
      ['value-synthesised', '#/paths/~1pets/post/responses/201/content/application~1json'],
      ['value-synthesised', '#/paths/~1pets~1{petId}/get/responses/200/content/application~1json'],
      ['value-synthesised', '#/paths/~1pets~1{petId}/get/responses/4XX/content/application~1problem+json'],
      ['value-synthesised', '#/paths/~1pets/get/responses/default/content/application~1problem+json'],
      ['value-synthesised', '#/paths/~1login/post/responses/200/content/application~1json'],
    ]);
    expect(findings[0]).toEqual({
      code: 'value-synthesised',
      pointer: '#/paths/~1pets/post/responses/201/content/application~1json',
      message: 'the 201 response of "createPet" has no example, so its mock body is synthesised from the schema',
      fix: 'add an `example` to the media type to mock it with a value you chose',
    });
  });

  it('takes the media type example, then its first named example, then the schema example, before synthesising', async () => {
    const schema = { type: 'string', examples: ['from-schema'] };
    expect(await scenarioOf({ 'application/json': { schema, example: 'given', examples: { a: { value: 'named' } } } })).toEqual({
      line: '    "200": {"status":200,"contentType":"application/json","body":"given"},',
      findings: [],
    });
    expect((await scenarioOf({ 'application/json': { schema, examples: { a: { value: 'named' }, b: { value: 'second' } } } })).line).toBe('    "200": {"status":200,"contentType":"application/json","body":"named"},');
    expect((await scenarioOf({ 'application/json': { schema, examples: null } })).line).toBe('    "200": {"status":200,"contentType":"application/json","body":"from-schema"},');
    expect((await scenarioOf({ 'application/json': { schema, examples: {} } })).line).toBe('    "200": {"status":200,"contentType":"application/json","body":"from-schema"},');
    expect((await scenarioOf({ 'application/json': { schema: true, examples: [] } })).findings).toHaveLength(1);
    expect((await scenarioOf({ 'text/plain': { schema: { const: 'c' } } })).line).toBe('    "200": {"status":200,"contentType":"text/plain","body":"c"},');
  });

  it('answers a range or `default` with the first status in its range that no other response declares', async () => {
    const responses = { '400': { description: 'a' }, '4XX': { description: 'b' }, '500': { description: 'c' }, '501': { description: 'd' }, default: { description: 'e' }, '2XX': { description: 'f' } };
    const document = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/x': { get: { operationId: 'x', responses } } } };
    const [handlers, scenarios] = await host().generate('msw', document);
    expect(scenarios?.content).toContain('    "4XX": {"status":401},\n');
    expect(scenarios?.content).toContain('    "default": {"status":502},\n');
    expect(scenarios?.content).toContain('    "2XX": {"status":200},\n');
    expect(handlers?.content).toContain('  handler("x", "2XX"),\n');
  });

  it('answers with the first declared response when none is 2xx, and writes no handler for an operation without one', async () => {
    const document = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: { '/x': { get: { operationId: 'x', responses: { '404': { description: 'gone' } } }, put: { operationId: 'y', responses: {} } } },
    };
    const [handlers] = await host().generate('msw', document);
    expect(handlers?.content).toContain('export const handlers = [\n  handler("x", "404"),\n];\n');
  });

  it('escapes what the spec writes into the generated source', async () => {
    const document = one({ 'application/json': { example: '</script>\u2028\u2029' } });
    const [handlers, scenarios] = await host().generate('msw', { ...document, paths: { '/<x>': document.paths['/x'] } });
    expect(handlers?.content).toContain('  "x": ["get", "*/\\u003Cx\\u003E"],\n');
    expect(scenarios?.content).toContain('"body":"\\u003C/script\\u003E\\u2028\\u2029"');
  });
});
