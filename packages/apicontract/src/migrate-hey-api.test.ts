import { describe, expect, it } from 'vitest';

import recorded from './__fixtures__/kit/migrate-findings.json' with { type: 'json' };

import { cases } from './__fixtures__/kit/migrate-hey-api.js';
import { migrate } from './migrate-hey-api.js';

const pkg = (scripts: Record<string, string>): string => `${JSON.stringify({ scripts }, undefined, 2)}\n`;

describe('the documented examples', () => {
  it.each(cases)('$name', ({ name, configText, script, config, findings }) => {
    const files = { 'package.json': pkg({ 'openapi-ts': script ?? 'openapi-ts' }) };
    const result = migrate(configText, files);
    expect(result.config).toEqual(config);
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`).toSorted()).toEqual([...findings].toSorted());
    for (const one of result.findings) expect(one.fix).not.toBe('');
    // Every finding in full, as recorded: the words a user reads are part of the behaviour.
    expect(result.findings).toEqual((recorded['hey-api'] as Record<string, unknown>)[name]);
    expect(result.edits).toEqual([{ path: 'package.json', before: files['package.json'], after: pkg({ 'openapi-ts': 'apicontract gen' }) }]);
    expect(result.uninstall).toBe('npm uninstall @hey-api/openapi-ts @hey-api/client-fetch');
  });
});

const only = (configText: string) => migrate(configText, {});
const files = (script: string) => ({ 'package.json': pkg({ a: script }) });

describe('reading the config', () => {
  it('maps every plugin with a target, and says which plugin is translated', () => {
    const names = ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/schemas', '@tanstack/react-query', 'swr', 'msw', 'fastify', 'hono', 'nest', 'express', 'valibot'];
    const result = only(`export default { input: 'a.yaml', output: 'out', plugins: ${JSON.stringify(names)} }`);
    expect(Object.values(result.config?.targets ?? {}).map((target) => target.generator)).toEqual(['types', 'fetch', 'json-schema', 'tanstack-query', 'swr', 'msw', 'fastify', 'hono', 'nest', 'express', 'validator']);
    expect(result.findings.find((one) => one.code === 'plugin-translated')).toEqual({
      code: 'plugin-translated',
      pointer: 'openapi-ts.config#/plugins/10',
      message: "`valibot` schemas become the `validator` target, apicontract's own validators, not valibot's",
      fix: "import the validators from the `validator` target's output, or keep Hey API for valibot",
    });
  });

  it('reports a dropped plugin, a dropped option and an unreadable value in words', () => {
    const result = only("export default { input: { path: 'a.yaml', watch: true }, logs: { level: 'debug' }, plugins: ['@hey-api/transformers', { name: getName() }, 3], output: { path: 'o', format: 'prettier' } }");
    expect(result.config).toEqual({ input: 'a.yaml', targets: {} });
    expect(result.findings).toEqual([
      { code: 'option-dropped', pointer: 'openapi-ts.config#/logs', message: '`logs` has no counterpart in apicontract', fix: 'remove it, or carry it over by hand; `apicontract gen --help` lists what each target takes' },
      { code: 'option-dropped', pointer: 'openapi-ts.config#/input/watch', message: '`watch` has no counterpart in apicontract', fix: 'remove it, or carry it over by hand; `apicontract gen --help` lists what each target takes' },
      { code: 'option-dropped', pointer: 'openapi-ts.config#/output/format', message: '`format` has no counterpart in apicontract', fix: 'remove it, or carry it over by hand; `apicontract gen --help` lists what each target takes' },
      { code: 'imports-change', pointer: 'openapi-ts.config#/output', message: "the files under o are written with apicontract's module names, not Hey API's `*.gen.ts`", fix: "after `apicontract gen`, point imports of o/*.gen at the targets' files" },
      { code: 'plugin-dropped', pointer: 'openapi-ts.config#/plugins/0', message: 'the `@hey-api/transformers` plugin has no apicontract target', fix: 'keep Hey API for it, or write the plugin: `apicontract plugin new`' },
      { code: 'unreadable', pointer: 'openapi-ts.config#/plugins/1', message: '`{"name":{"unreadable":"getName()"}}` is not data this migration can read', fix: 'write the value out as a literal, or carry it over by hand' },
      { code: 'unreadable', pointer: 'openapi-ts.config#/plugins/2', message: '`3` is not data this migration can read', fix: 'write the value out as a literal, or carry it over by hand' },
    ]);
  });

  it('reports an input, an output and plugins it cannot read, and defaults the output', () => {
    const result = only("export default { input: env.SPEC, plugins: names }");
    expect(result.config).toBeUndefined();
    expect(result.findings.map((one) => [one.code, one.pointer, one.message])).toEqual([
      ['unreadable', 'openapi-ts.config#/input', '`env.SPEC` is not data this migration can read'],
      ['nothing-to-migrate', 'openapi-ts.config#/input', 'the config names no input document'],
    ]);
    const plugins = only("export default { input: 'a.yaml', plugins: names }");
    expect(plugins.config).toEqual({ input: 'a.yaml', targets: { types: { generator: 'types', out: 'src/client' }, fetch: { generator: 'fetch', out: 'src/client' } } });
    expect(plugins.findings.map((one) => one.code)).toEqual(['unreadable', 'imports-change']);
  });

  it('reports a remote input, and does not take a local path for a registry', () => {
    expect(only("export default { input: 'https://x.dev/openapi.json' }").findings.map((one) => [one.code, one.message])[0]).toEqual([
      'remote-input',
      'https://x.dev/openapi.json is fetched over the network, and apicontract reads local files',
    ]);
    expect(only("export default { input: 'org/project?branch=main' }").findings[0]?.code).toBe('registry-input');
    expect(only("export default { input: 'org/project@v2' }").findings[0]?.code).toBe('registry-input');
    for (const input of ['./spec/openapi.yaml', 'spec/openapi.yaml', 'a/b/c']) expect(only(`export default { input: '${input}' }`).findings.map((one) => one.code)).toEqual(['imports-change']);
  });

  it('reports a config that exports nothing it can read', () => {
    expect(only('export default config;').findings).toEqual([{ code: 'unreadable', pointer: 'openapi-ts.config', message: '`config` is not data this migration can read', fix: 'write the value out as a literal, or carry it over by hand' }]);
    expect(only('').findings).toEqual([{ code: 'config-unreadable', pointer: 'openapi-ts.config', message: 'no `export default` or `module.exports` was found', fix: 'write apicontract.config.json by hand' }]);
  });
});

describe('scripts', () => {
  it('rewrites the Hey API part of a script and reads its flags, other flags reported', () => {
    const files = { 'package.json': pkg({ gen: 'rimraf src/client && openapi-ts -i a.yaml -o out --dry-run -p zod,swr; echo ok', build: 'tsc' }) };
    const result = migrate(undefined, files);
    expect(result.edits[0]?.after).toBe(pkg({ gen: 'rimraf src/client && apicontract gen; echo ok', build: 'tsc' }));
    expect(result.config?.targets).toEqual({
      types: { generator: 'types', out: 'out' },
      fetch: { generator: 'fetch', out: 'out' },
      validator: { generator: 'validator', out: 'out' },
      swr: { generator: 'swr', out: 'out' },
    });
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['option-dropped @ openapi-ts.config#/--dry-run', 'imports-change @ openapi-ts.config#/output', 'plugin-translated @ openapi-ts.config#/plugins/2']);
  });

  it('reads the long flags, a flag with no value, and only the first script', () => {
    const files = { 'package.json': pkg({ a: 'openapi-ts --input a.yaml --output out --client @hey-api/client-fetch --plugins', b: 'openapi-ts -i b.yaml' }) };
    const result = migrate(undefined, files);
    expect(result.config?.input).toBe('a.yaml');
    expect(Object.keys(result.config?.targets ?? {})).toEqual(['types', 'fetch']);
    expect(result.findings.map((one) => one.code)).toEqual(['imports-change', 'plugin-dropped']);
  });

  it('finds no config without a config file or a script', () => {
    expect(migrate(undefined, { 'package.json': pkg({ a: 'openapi-tsx', b: 'my-openapi-ts' }) }).findings.map((one) => one.code)).toEqual(['config-unreadable']);
  });
});

describe('the edges a mutant would cross', () => {
  it('reports what it cannot read at the exact place it sits', () => {
    const result = only("export default { input: [{ path: 'a.yaml', watch: true }, 'b.yaml'], output: { path: dir() }, plugins: [['zod']] }");
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual([
      'second-input @ openapi-ts.config#/input/1',
      'option-dropped @ openapi-ts.config#/input/0/watch',
      'unreadable @ openapi-ts.config#/output/path',
      'imports-change @ openapi-ts.config#/output',
      'unreadable @ openapi-ts.config#/plugins/0',
    ]);
    expect(only("export default { input: 'a.yaml', plugins: names }").findings[0]?.pointer).toBe('openapi-ts.config#/plugins');
  });

  it('reads a flag with no value as no input, and runs of spaces as one', () => {
    expect(migrate(undefined, files('openapi-ts -o out -i')).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    expect(migrate(undefined, files('npx  openapi-ts  -i a.yaml   -o out ')).config?.input).toBe('a.yaml');
    expect(migrate(undefined, files('npx  openapi-ts  -i a.yaml   -o out ')).findings.map((one) => one.code)).toEqual(['imports-change']);
    expect(migrate(undefined, files('openapi-ts')).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
  });

  it('splits a script at `&&` without spaces, and touches no script that does not run Hey API', () => {
    expect(migrate(undefined, { 'package.json': pkg({ a: 'rimraf x &&openapi-ts -i a.yaml' }) }).edits[0]?.after).toBe(pkg({ a: 'rimraf x &&apicontract gen' }));
    expect(migrate(undefined, { 'package.json': '{"scripts":{"a":"openapi-ts -i a.yaml","b":"eslint . && tsc"}}' }).findings.map((one) => one.pointer).filter((pointer) => pointer.startsWith('package.json'))).toEqual(['package.json#/scripts/a']);
  });

  it('counts http and https as remote, and only at the start', () => {
    expect(only("export default { input: 'http://x.dev/a.yaml' }").findings[0]).toEqual({
      code: 'remote-input',
      pointer: 'apicontract.config.json#/input',
      message: 'http://x.dev/a.yaml is fetched over the network, and apicontract reads local files',
      fix: 'download the document into the project and point `input` at it',
    });
    expect(only("export default { input: 'a.yaml', plugins: [null] }").findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['imports-change @ openapi-ts.config#/output', 'unreadable @ openapi-ts.config#/plugins/0']);
    expect(only("export default { input: 'mirror/https://x.yaml' }").findings.map((one) => one.code)).toEqual(['imports-change']);
  });
});

