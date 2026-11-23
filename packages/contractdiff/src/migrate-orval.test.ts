import { describe, expect, it } from 'vitest';

import recorded from './__fixtures__/kit/migrate-findings.json' with { type: 'json' };

import { cases } from './__fixtures__/kit/migrate-orval.js';
import { migrate } from './migrate-orval.js';

const pkg = (scripts: Record<string, string>): string => `${JSON.stringify({ scripts }, undefined, 2)}\n`;

describe('the documented examples', () => {
  it.each(cases)('$name', ({ name, configText, script, config, findings }) => {
    const files = { 'package.json': pkg({ api: script ?? 'orval' }) };
    const result = migrate(configText, files);
    expect(result.config).toEqual(config);
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(findings);
    for (const one of result.findings) expect(one.fix).not.toBe('');
    // Every finding in full, as recorded: the words a user reads are part of the behaviour.
    expect(result.findings).toEqual((recorded['orval'] as Record<string, unknown>)[name]);
    expect(result.edits).toEqual([{ path: 'package.json', before: files['package.json'], after: pkg({ api: 'contractdiff gen' }) }]);
    expect(result.uninstall).toBe('npm uninstall orval');
  });
});

const only = (configText: string) => migrate(configText, {});
const files = (script: string) => ({ 'package.json': pkg({ a: script }) });

describe('reading the config', () => {
  it('says what a translated client loses, and what a dropped one needs', () => {
    expect(only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: 'zod' } } }").findings[0]).toEqual({
      code: 'client-translated',
      pointer: 'orval.config#/p/output/client',
      message: "the `zod` client becomes the `validator` target, contractdiff's own validators and not Zod",
      fix: 'check the call sites after `contractdiff gen`, or keep orval for zod',
    });
    expect(only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: 'axios' } } }").findings[0]?.message).toBe('the `axios` client becomes the `fetch` target, which calls `fetch` and not axios');
    expect(only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: 'toString' } } }").findings[0]).toEqual({
      code: 'client-dropped',
      pointer: 'orval.config#/p/output/client',
      message: 'the `toString` client has no contractdiff target',
      fix: 'keep orval for it, or write the plugin: `contractdiff plugin new`',
    });
    expect(only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: custom } } }").findings[0]).toEqual({
      code: 'unreadable',
      pointer: 'orval.config#/p/output/client',
      message: '`custom` is not data this migration can read',
      fix: 'write the value out as a literal, or carry it over by hand',
    });
  });

  it('reads mock: true as msw and reports mock options', () => {
    const off = only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: 'fetch', mock: false } } }");
    expect(off.config?.targets.msw).toBeUndefined();
    expect(off.findings.map((one) => one.code)).toEqual(['imports-change']);
    const options = only("export default { p: { input: 'a.yaml', output: { target: 'o.ts', client: 'fetch', mock: { type: 'msw' } } } }");
    expect(options.config?.targets.msw).toBeUndefined();
    expect(options.findings[0]).toEqual({
      code: 'option-dropped',
      pointer: 'orval.config#/p/output/mock',
      message: 'mock options other than `true` have no counterpart in contractdiff',
      fix: 'set `mock: true` and run the migration again, or carry the options over by hand',
    });
  });

  it('reports a remote input, a second project and a project it cannot read', () => {
    const result = only("export default { a: { input: { target: 'https://x.dev/o.json' }, output: { target: { nested: 1 } } }, b: {} }");
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual([
      'second-input @ orval.config#/b',
      'option-dropped @ orval.config#/a/output/target/nested',
      'nothing-to-migrate @ orval.config#/a',
    ]);
    const remote = only("export default { a: { input: { target: 'https://x.dev/o.json' }, output: 'o.ts' } }");
    expect(remote.findings[0]).toEqual({
      code: 'remote-input',
      pointer: 'contractdiff.config.json#/input',
      message: 'https://x.dev/o.json is fetched over the network, and contractdiff reads local files',
      fix: 'download the document into the project and point `input` at it',
    });
    expect(only('export default { a: make() }').findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['unreadable @ orval.config#/a']);
    expect(only('export default { a: { input: spec, output: 1 } }').findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual([
      'unreadable @ orval.config#/a/input',
      'unreadable @ orval.config#/a/output',
      'nothing-to-migrate @ orval.config#/a',
    ]);
    expect(only("export default { a: { input: 'a.yaml' } }").findings).toEqual([
      { code: 'nothing-to-migrate', pointer: 'orval.config#/a', message: 'the `a` project names no input or no output', fix: 'set `input` and `output` and run the migration again' },
    ]);
    expect(only("export default { a: { output: 'o.ts' } }").findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    expect(only("export default { a: null, b: { input: 'b.yaml', output: 'o.ts' } }").findings[0]).toEqual({
      code: 'second-input',
      pointer: 'orval.config#/b',
      message: 'the `b` project is a second input, and one contractdiff.config.json reads one',
      fix: 'write a second contractdiff.config.json for it in its own folder',
    });
    expect(only("export default { a: null }").findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['unreadable @ orval.config#/a']);
  });

  it('reports a config with no project, none it can read, and none at all', () => {
    expect(only('export default {}').findings).toEqual([{ code: 'nothing-to-migrate', pointer: 'orval.config', message: 'the config names no project', fix: 'add a project and run the migration again' }]);
    expect(only('export default config').findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['unreadable @ orval.config']);
    expect(migrate(undefined, {}).findings).toEqual([{ code: 'config-unreadable', pointer: 'orval.config', message: 'no orval.config file, or no `export default` in it', fix: 'write contractdiff.config.json by hand' }]);
  });
});

describe('scripts', () => {
  it('rewrites the orval part of a script, reads its flags, and leaves the rest', () => {
    const result = migrate(undefined, { 'package.json': pkg({ gen: 'rimraf src && npx orval --input a.yaml --output o.ts --client swr --watch src', other: 'orvalish' }) });
    expect(result.edits[0]?.after).toBe(pkg({ gen: 'rimraf src && contractdiff gen', other: 'orvalish' }));
    expect(result.config).toEqual({ input: 'a.yaml', targets: { types: { generator: 'types', out: 'o.ts' }, fetch: { generator: 'fetch', out: 'o.ts' }, swr: { generator: 'swr', out: 'o.ts' } } });
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['option-dropped @ orval.config#/cli/watch', 'imports-change @ orval.config#/cli/output']);
  });

  it('reads `orval --config` as no project, and a flag with no value as empty', () => {
    expect(migrate(undefined, { 'package.json': pkg({ a: 'orval --config ./orval.config.js' }) }).findings.map((one) => one.code)).toEqual(['config-unreadable']);
    expect(migrate(undefined, { 'package.json': pkg({ a: 'orval --input a.yaml --output' }) }).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    expect(migrate(undefined, { 'package.json': pkg({ a: 'orval --input a.yaml' }) }).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
  });
});

describe('the edges a mutant would cross', () => {
  it('reads a project that is a list as unreadable', () => {
    expect(only("export default { a: ['x'] }").findings).toEqual([
      { code: 'unreadable', pointer: 'orval.config#/a', message: '`["x"]` is not data this migration can read', fix: 'write the value out as a literal, or carry it over by hand' },
    ]);
  });

  it('runs only `orval` and `npx orval`, however spaced, and reads a flag without its dashes', () => {
    expect(migrate(undefined, files('echo orval')).edits).toEqual([]);
    expect(migrate(undefined, files('xorval --input a.yaml')).edits).toEqual([]);
    const spaced = migrate(undefined, files('npx  orval  --input a.yaml   --output o.ts  no-dash v'));
    expect(spaced.edits[0]?.after).toBe(pkg({ a: 'contractdiff gen' }));
    expect(spaced.config?.input).toBe('a.yaml');
    expect(spaced.findings.map((one) => one.pointer)).toEqual(['orval.config#/cli/no-dash', 'orval.config#/cli/output/client', 'orval.config#/cli/output']);
  });

  it('touches no script that does not run orval', () => {
    expect(migrate(undefined, { 'package.json': '{"scripts":{"a":"orval","b":"eslint ."}}' }).findings.map((one) => one.pointer).filter((pointer) => pointer.startsWith('package.json'))).toEqual(['package.json#/scripts/a']);
  });

  it('counts http and https as remote, and only at the start', () => {
    expect(only("export default { a: { input: 'http://x.dev/a.yaml', output: 'o.ts' } }").findings[0]?.code).toBe('remote-input');
    expect(only("export default { a: { input: 'mirror/https://x.yaml', output: 'o.ts' } }").findings.map((one) => one.code)).toEqual(['client-translated', 'imports-change']);
  });
});

