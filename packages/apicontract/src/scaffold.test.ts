import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { checkName, KINDS, scaffold } from './scaffold.js';
import { conformance, type ConformanceOptions } from './testing.js';

const directory = mkdtempSync(join(tmpdir(), 'apicontract-scaffold-'));
const testing = pathToFileURL(join(import.meta.dirname, 'testing.ts')).href;

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

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
