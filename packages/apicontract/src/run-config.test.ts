import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { CONFIG_FILES, ConfigError, configSchema, findConfig, loadConfig, relativePath, UsageError, validateConfig } from './run-config.js';


const scratch = scratchDirs();
const temp = (): string => scratch('apicontract-config-');

const problemsOf = (attempt: () => unknown): string => {
  try {
    attempt();
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe('CONFIG');
    return (error as Error).message;
  }
  throw new Error('expected a config error');
};

const rejection = async (attempt: Promise<unknown>): Promise<string> => {
  try {
    await attempt;
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe('CONFIG');
    return (error as Error).message;
  }
  throw new Error('expected a config error');
};

describe('relativePath', () => {
  it.each([
    ['src/gen', 'src/gen'],
    ['./src/gen/', 'src/gen'],
    ['.', '.'],
    ['./', '.'],
    ['a//b', 'a/b'],
    ['.config/x', '.config/x'],
  ])('keeps %j inside the project as %j', (path, expected) => {
    expect(relativePath(path)).toBe(expected);
  });

  it.each(['/abs', '../up', 'a/../../b', String.raw`a\b`, 'C:/x'])('refuses %j, which leaves the project', (path) => {
    expect(relativePath(path)).toBeUndefined();
  });
});

describe('validateConfig', () => {
  it('reads a full config, with every path relative to the folder the file is in', () => {
    const config = validateConfig(
      {
        $schema: './schema.json',
        input: 'openapi.yaml',
        overlays: ['o.yaml'],
        plugins: ['./plugin.mjs', 'apicontract-plugin-x'],
        targets: { types: { generator: 'types', out: './src/gen/', options: { a: 1 } } },
        extract: { from: 'schemas', out: 'spec.json', options: { module: './a.js' } },
      },
      '/repo/apicontract.config.json',
    );
    expect(config).toEqual({
      root: '/repo',
      file: '/repo/apicontract.config.json',
      input: 'openapi.yaml',
      overlays: ['o.yaml'],
      plugins: ['./plugin.mjs', 'apicontract-plugin-x'],
      targets: { types: { generator: 'types', out: 'src/gen', options: { a: 1 } } },
      extract: { from: 'schemas', out: 'spec.json', options: { module: './a.js' } },
    });
  });

  it('defaults everything that may be left out', () => {
    expect(validateConfig({}, '/r/c.json')).toStrictEqual({ root: '/r', file: '/r/c.json', overlays: [], plugins: [], targets: {}, extract: { options: {} } });
    expect(validateConfig({ targets: { t: { generator: 'g', out: 'o' } }, extract: {} }, '/r/c.json')).toMatchObject({ targets: { t: { generator: 'g', out: 'o', options: {} } }, extract: { options: {} } });
  });

  it('reads an empty extract section as no settings, and keeps no key it was not given', () => {
    expect(validateConfig({ extract: {} }, '/r/c.json').extract).toStrictEqual({ options: {} });
    expect(validateConfig({ extract: { out: 'a.json' } }, '/r/c.json').extract).toStrictEqual({ out: 'a.json', options: {} });
    expect(validateConfig({ extract: { from: 'x' } }, '/r/c.json').extract).toStrictEqual({ from: 'x', options: {} });
  });

  it.each([null, 'x'])('refuses a config that is %j', (value) => {
    expect(problemsOf(() => validateConfig(value, '/r/c.json'))).toContain('the config is not an object');
    expect(problemsOf(() => validateConfig({ targets: { t: value } }, '/r/c.json'))).toContain('`targets.t` must be an object');
  });

  it('refuses a config that is not an object', () => {
    expect(problemsOf(() => validateConfig([], '/r/c.json'))).toBe('/r/c.json cannot be used:\n  - the config is not an object. fix: write `{ "input": "openapi.yaml", "targets": { … } }`');
  });

  it('reports every problem at once, each with its fix', () => {
    const message = problemsOf(() =>
      validateConfig(
        {
          inptu: 'x',
          input: '../x.yaml',
          overlays: [''],
          plugins: 'x',
          targets: { a: 1, b: { out: '/abs', options: 1, extra: true }, c: { generator: 'c', out: '' } },
          extract: { from: '', out: '../s.json', options: [], other: 1 },
        },
        '/r/c.json',
      ),
    );
    expect(message.split('\n')).toEqual([
      '/r/c.json cannot be used:',
      '  - `inptu` is not a setting. fix: remove it; the settings are $schema, input, overlays, plugins, targets, extract, diff',
      '  - `input` must be a file inside the project. fix: write `"input": "openapi.yaml"`',
      '  - `overlays` must be a list of non-empty strings. fix: write `"overlays": ["…"]`',
      '  - `plugins` must be a list of non-empty strings. fix: write `"plugins": ["…"]`',
      '  - `targets.a` must be an object. fix: write `{ "generator": "…", "out": "…" }`',
      '  - `targets.b.extra` is not a target setting. fix: remove it; a target takes generator, out and options',
      '  - `targets.b.generator` is missing. fix: name the generator, e.g. `"generator": "b"`',
      '  - `targets.b.out` must be a folder inside the project. fix: write a relative path such as `"out": "src/generated"`',
      '  - `targets.b.options` must be an object. fix: map each option name to its value',
      '  - `targets.c.out` must be a folder inside the project. fix: write a relative path such as `"out": "src/generated"`',
      '  - `extract.other` is not an extract setting. fix: remove it; extract takes from, out and options',
      '  - `extract.from` must be an extractor name. fix: write `"from": "…"`',
      '  - `extract.out` must be a file inside the project. fix: write `"out": "spec.json"`',
      '  - `extract.options` must be an object. fix: map each option name to its value',
    ]);
  });

  it.each([
    [{ input: '' }, '`input` must be a file inside the project'],
    [{ input: 1 }, '`input` must be a file inside the project'],
    [{ targets: [] }, '`targets` must be an object'],
    [{ targets: { t: { generator: 'g', out: 1 } } }, '`targets.t.out` must be a folder'],
    [{ extract: 'x' }, '`extract` must be an object. fix: write `{ "from": "…", "out": "spec.json" }`'],
    [{ extract: { from: 1 } }, '`extract.from` must be an extractor name'],
    [{ extract: { out: '' } }, '`extract.out` must be a file inside the project'],
    [{ plugins: ['a', 1] }, '`plugins` must be a list'],
  ])('refuses %j', (value, problem) => {
    expect(problemsOf(() => validateConfig(value, '/r/c.json'))).toContain(problem);
  });
});

describe('configSchema', () => {
  it('names every setting validateConfig reads, and only those', () => {
    expect(Object.keys(configSchema.properties)).toEqual(['$schema', 'input', 'overlays', 'plugins', 'targets', 'extract', 'diff']);
    expect(configSchema).toMatchObject({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'apicontract.config.json', type: 'object', additionalProperties: false });
    expect(configSchema.properties.targets.additionalProperties).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['generator', 'out'],
      properties: { generator: { type: 'string', minLength: 1 }, out: { type: 'string', minLength: 1 }, options: { type: 'object' } },
    });
    expect(configSchema.properties.extract).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: { from: { type: 'string', minLength: 1 }, out: { type: 'string', minLength: 1 }, options: { type: 'object' } },
    });
    expect(configSchema.properties.input).toEqual({ type: 'string', minLength: 1, description: 'The spec, relative to this file: JSON or YAML' });
    expect(configSchema.properties.overlays).toEqual({ type: 'array', items: { type: 'string', minLength: 1 }, description: 'OpenAPI Overlays applied to the input, in order' });
    expect(configSchema.properties.plugins).toEqual({ type: 'array', items: { type: 'string', minLength: 1 }, description: 'Package names or relative paths; nothing else is loaded' });
    expect(configSchema.properties.$schema).toEqual({ type: 'string' });
    expect(configSchema.properties.targets.type).toBe('object');
  });
});

describe('ConfigError and UsageError', () => {
  it('is a CONFIG refusal listing each problem', () => {
    const error = new ConfigError('/c.json', ['a', 'b']);
    expect(error.message).toBe('/c.json cannot be used:\n  - a\n  - b');
    expect(error.code).toBe('CONFIG');
    expect(error.name).toBe('ConfigError');
    expect(error).toBeInstanceOf(Error);
  });

  it('is a USAGE refusal with its message', () => {
    const error = new UsageError('bad. fix: good');
    expect([error.message, error.code, error.name]).toEqual(['bad. fix: good', 'USAGE', 'UsageError']);
  });
});

describe('findConfig and loadConfig', () => {
  it('looks for json, then mjs, then ts', () => {
    expect(CONFIG_FILES).toEqual(['apicontract.config.json', 'apicontract.config.mjs', 'apicontract.config.ts']);
    const dir = temp();
    expect(findConfig(dir)).toBeUndefined();
    writeFileSync(join(dir, 'apicontract.config.ts'), 'export default { input: "ts.yaml" };\n');
    expect(findConfig(dir)).toBe(join(dir, 'apicontract.config.ts'));
    writeFileSync(join(dir, 'apicontract.config.mjs'), 'export default { input: "mjs.yaml" };\n');
    expect(findConfig(dir)).toBe(join(dir, 'apicontract.config.mjs'));
    writeFileSync(join(dir, 'apicontract.config.json'), '{ "input": "json.yaml" }\n');
    expect(findConfig(dir)).toBe(join(dir, 'apicontract.config.json'));
  });

  it('is undefined when no config is named and none is found', async () => {
    expect(await loadConfig(temp())).toBeUndefined();
  });

  it('loads the JSON form', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'apicontract.config.json'), '{ "input": "a.yaml" }\n');
    expect(await loadConfig(dir)).toMatchObject({ root: dir, file: join(dir, 'apicontract.config.json'), input: 'a.yaml' });
  });

  it('loads a module by its default export, and the file --config names, relative to cwd', async () => {
    const dir = temp();
    writeFileSync(join(dir, 'apicontract.config.json'), '{ "input": "json.yaml" }\n');
    writeFileSync(join(dir, 'other.mjs'), 'export default { input: "mjs.yaml" };\n');
    expect(await loadConfig(dir, 'other.mjs')).toMatchObject({ root: dir, file: join(dir, 'other.mjs'), input: 'mjs.yaml' });
  });

  it('refuses a named file that does not exist, a file that is not JSON, and a module that does not load', async () => {
    const dir = temp();
    expect(await rejection(loadConfig(dir, 'missing.json'))).toBe(
      `${join(dir, 'missing.json')} cannot be used:\n  - it does not exist. fix: pass \`--config\` a file that exists, or create \`apicontract.config.json\``,
    );
    writeFileSync(join(dir, 'bad.json'), '{');
    expect(await rejection(loadConfig(dir, 'bad.json'))).toMatch(/cannot be used:\n {2}- it is not JSON \(.+\)\. fix: correct the JSON, or validate it against `configSchema`$/u);
    writeFileSync(join(dir, 'bad.mjs'), 'throw new Error("boom");\n');
    expect(await rejection(loadConfig(dir, 'bad.mjs'))).toMatch(/- it failed to load \(boom\)\. fix: make it a module whose default export is the config object$/u);
    writeFileSync(join(dir, 'none.mjs'), 'export const x = 1;\n');
    expect(await rejection(loadConfig(dir, 'none.mjs'))).toContain('the config is not an object');
  });
});
