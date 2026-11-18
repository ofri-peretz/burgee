import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/kit/scratch-dir.js';
import { checkName, KINDS, scaffold } from './scaffold.js';
import { conformance, type ConformanceOptions } from './testing.js';

const scratch = scratchDirs();
const directory = scratch('apicontract-scaffold-');
const testing = pathToFileURL(join(import.meta.dirname, 'testing.ts')).href;


/** Write a scaffold to disk with `apicontract/testing` pointing at this checkout, and import it. */
const load = async (name: string, kind: (typeof KINDS)[number]): Promise<Record<string, unknown>> => {
  const files = scaffold(name, kind);
  for (const file of files) writeFileSync(join(directory, file.path), file.content.replaceAll("'apicontract/testing'", `'${testing}'`));
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the point of the test: the scaffold as written to disk, loaded as a user would load it
  return (await import(pathToFileURL(join(directory, `plugin-${name}.ts`)).href)) as Record<string, unknown>;
};

describe('the scaffold', () => {
  it.each(KINDS)('writes a %s plugin that passes the conformance suite as generated', async (kind) => {
    const module = await load(`demo-${kind}`, kind);
    const options: ConformanceOptions = kind === 'adapter' ? { mutate: module.mutate as (document: unknown) => unknown } : {};
    await expect(conformance(module.plugin, options)).resolves.toBeUndefined();
  });

  it.each(KINDS)('writes the %s plugin, its test and a README, all owned by the user', (kind) => {
    const files = scaffold('pets', kind);
    expect(files.map((file) => [file.path, file.owner])).toEqual([
      ['plugin-pets.ts', 'user'],
      ['plugin-pets.test.ts', 'user'],
      ['README.md', 'user'],
    ]);
    expect(files[0]?.content).toContain(`apicontract plugin new pets --kind ${kind}`);
    expect(files[1]?.content).toContain("import { conformance } from 'apicontract/testing';");
    expect(files[2]?.content).toContain(`a\n${kind}, scaffolded by`);
  });

  it.each([
    ['generator', 'a generator, spec to code'],
    ['extractor', 'an extractor, code to spec'],
    ['adapter', 'an input format, and a generator that reads it'],
  ] as const)('says what a %s plugin is in its first line', (kind, what) => {
    expect(scaffold('pets', kind)[0]?.content.split('\n').slice(0, 2)).toEqual(['/**', ` * The \`pets\` apicontract plugin: ${what}.`]);
  });

  it('indents the sample document where it sits', () => {
    expect(scaffold('pets', 'generator')[0]?.content).toContain("        document: {\n          openapi: '3.1.0',\n          info: { title: 'pets sample', version: '1.0.0' },\n");
  });

  it('hands the adapter test its `mutate`, and the others none', () => {
    expect(scaffold('pets', 'adapter')[1]?.content).toContain("import { mutate, plugin } from './plugin-pets.js';");
    expect(scaffold('pets', 'adapter')[1]?.content).toContain('await conformance(plugin, { mutate });');
    expect(scaffold('pets', 'generator')[1]?.content).toContain("import { plugin } from './plugin-pets.js';");
    expect(scaffold('pets', 'generator')[1]?.content).toContain('await conformance(plugin);');
  });
});

it('refuses a kind it does not know, with a fix line', () => {
  expect(() => scaffold('pets', 'toString' as never)).toThrow('"toString" is not a plugin kind. fix: pass --kind generator, --kind extractor, --kind adapter');
});

describe('checkName', () => {
  it.each(['a', 'my-target', 'v2', 'a1-b2-c3'])('accepts %s', (name) => {
    expect(() => {
      checkName(name);
    }).not.toThrow();
  });

  it.each(['', 'A', '1a', 'my_target', 'a--b', 'a-', '-a', '../a', 'a b', 'a\nb'])('refuses %j with a fix line', (name) => {
    expect(() => scaffold(name, 'generator')).toThrow(`"${name}" is not a plugin name. fix: use lowercase letters, digits and single dashes, starting with a letter, e.g. \`my-target\``);
  });
});
