import { describe, expect, it } from 'vitest';

import recorded from './__fixtures__/kit/migrate-findings.json' with { type: 'json' };

import { cases } from './__fixtures__/kit/migrate-openapi-typescript.js';
import { migrate, STDOUT_OUT } from './migrate-openapi-typescript.js';

describe('the documented examples', () => {
  it.each(cases)('$name', ({ name, configText, files, config, findings, packageJson }) => {
    const result = migrate(configText, files);
    expect(result.config).toEqual(config);
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(findings);
    for (const one of result.findings) expect(one.fix).not.toBe('');
    // Every finding in full, as recorded: the words a user reads are part of the behaviour.
    expect(result.findings).toEqual((recorded['openapi-typescript'] as Record<string, unknown>)[name]);
    expect(result.edits).toEqual(packageJson === undefined ? [] : [{ path: 'package.json', before: files['package.json'], after: packageJson }]);
    expect(result.uninstall).toBe('npm uninstall openapi-typescript');
  });
});

const pkg = (scripts: Record<string, string>): string => `${JSON.stringify({ scripts }, undefined, 2)}\n`;

describe('scripts', () => {
  it('rewrites only the part of a script that runs openapi-typescript, runners and all', () => {
    const before = pkg({ gen: 'rm -rf out && pnpm exec openapi-typescript a.yaml -o "out/a.ts" > /dev/null; echo done', lint: 'eslint .' });
    const { config, edits } = migrate(undefined, { 'package.json': before });
    expect(config?.targets.types?.out).toBe('/dev/null');
    expect(edits[0]?.after).toBe(pkg({ gen: 'rm -rf out && apicontract gen; echo done', lint: 'eslint .' }));
  });

  it('reads --output=, a quoted input, and the output of a redirect', () => {
    expect(migrate(undefined, { 'package.json': pkg({ a: "openapi-typescript 'my api.yaml' --output=x.ts --enum=true" }) }).config).toEqual({
      input: 'my api.yaml',
      targets: { types: { generator: 'types', out: 'x.ts', options: { compat: 'openapi-typescript', enum: true } } },
    });
    expect(migrate(undefined, { 'package.json': pkg({ a: 'openapi-typescript a.yaml > b.ts' }) }).config?.targets.types?.out).toBe('b.ts');
    expect(migrate(undefined, { 'package.json': pkg({ a: 'openapi-typescript a.yaml --immutable=yes' }) }).config?.targets.types?.options).toEqual({ compat: 'openapi-typescript', immutable: 'yes' });
  });

  it('makes one target per run on the same input, and reports a flag it does not know', () => {
    const result = migrate(undefined, { 'package.json': pkg({ a: 'openapi-typescript a.yaml -o a.ts', b: 'openapi-typescript a.yaml -o b.ts --unknown' }) });
    expect(Object.keys(result.config?.targets ?? {})).toEqual(['types', 'types-2']);
    expect(result.findings).toEqual([
      { code: 'option-dropped', pointer: 'package.json#/scripts/b', message: '`--unknown` is not an openapi-typescript flag apicontract carries', fix: 'remove it; `apicontract gen --help` lists what the types target takes' },
    ]);
  });

  it('reports a script it cannot find in the text to rewrite', () => {
    const text = '{"scripts":{"a":"openapi-typescript a.yaml -o a.ts"}}';
    const result = migrate(undefined, { 'package.json': text });
    expect(result.edits).toEqual([]);
    expect(result.findings).toEqual([
      { code: 'script-not-rewritten', pointer: 'package.json#/scripts/a', message: 'the `a` script is not written as `"a": "…"` on one line', fix: 'set it to `apicontract gen` by hand' },
    ]);
  });

  it('reads no scripts from a missing, unreadable or script-less package.json', () => {
    for (const files of [{}, { 'package.json': '{' }, { 'package.json': '{"scripts":null}' }, { 'package.json': '{"scripts":{"a":1}}' }]) {
      expect(migrate(undefined, files).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    }
  });
});

describe('redocly.yaml', () => {
  it('reads camelCase flags, drops unknown ones and APIs without x-openapi-ts, and keeps an api without output', () => {
    const yaml = ['apis:', '  a:', '    root: a.yaml', '    x-openapi-ts:', '      rootTypes: true', '      transform: x', '  b:', '    root: b.yaml', '  c: 1', 'apis2: {}', ''].join('\n');
    const result = migrate(yaml, {});
    expect(result.config).toEqual({ input: 'a.yaml', targets: { types: { generator: 'types', out: STDOUT_OUT, options: { compat: 'openapi-typescript', rootTypes: true } } } });
    expect(result.findings.map((one) => [one.code, one.pointer, one.message])).toEqual([
      ['option-dropped', 'redocly.yaml#/apis2', '`apis2` configures Redocly, not the types'],
      ['option-dropped', 'redocly.yaml#/apis/a/x-openapi-ts/transform', '`transform` is not an openapi-typescript option apicontract carries'],
      ['stdout-output', 'redocly.yaml#/apis/a', 'openapi-typescript printed to stdout, and apicontract writes a file'],
    ]);
  });

  it('reports YAML it cannot read, and reads a document that is not a map as empty', () => {
    expect(migrate('a: [', {}).findings[0]?.code).toBe('config-unreadable');
    expect(migrate('a: [', {}).findings[0]?.fix).toBe('fix the YAML, or write apicontract.config.json by hand');
    expect(migrate('- 1', {}).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    expect(migrate('apis:\n  a:\n    root: 1\n    x-openapi-ts:\n      output: 2\n', {}).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
  });
});

describe('the edges a mutant would cross', () => {
  it('drops every runner word before the binary, and keeps the words before them', () => {
    const scripts = { a: 'bunx openapi-typescript a.yaml -o a.ts', b: 'pnpx openapi-typescript a.yaml -o b.ts', c: 'yarn openapi-typescript a.yaml -o c.ts', d: 'npm exec openapi-typescript a.yaml -o d.ts', e: 'pnpm dlx openapi-typescript a.yaml -o e.ts', f: 'cross-env A=1 npx openapi-typescript a.yaml -o f.ts' };
    expect(migrate(undefined, { 'package.json': pkg(scripts) }).edits[0]?.after).toBe(
      pkg({ a: 'apicontract gen', b: 'apicontract gen', c: 'apicontract gen', d: 'apicontract gen', e: 'apicontract gen', f: 'cross-env A=1 apicontract gen' }),
    );
  });

  it('reads a double-quoted input, an `=` inside a value, a document named like a flag, and `&&` without spaces', () => {
    const result = migrate(undefined, { 'package.json': pkg({ a: 'rm -rf out&&openapi-typescript "my api.yaml" --output=a=b.ts', b: 'openapi-typescript myenum -o c.ts' }) });
    expect(result.config?.input).toBe('my api.yaml');
    expect(result.config?.targets.types?.out).toBe('a=b.ts');
    expect(result.edits[0]?.after).toContain('"a": "rm -rf out&&apicontract gen"');
    expect(result.findings[0]?.message).toBe('myenum is a second input, and one apicontract.config.json reads one');
  });

  it('touches no script that does not run openapi-typescript, even in a package.json it cannot edit', () => {
    const result = migrate(undefined, { 'package.json': '{"scripts":{"a":"openapi-typescript a.yaml -o a.ts","b":"eslint . && tsc"}}' });
    expect(result.findings.map((one) => one.pointer)).toEqual(['package.json#/scripts/a']);
  });

  it('reads redocly apis only from a map, keeps a non-string output as stdout, and says how to fix a flag', () => {
    expect(migrate('apis:\n  - root: a.yaml\n    x-openapi-ts:\n      output: a.ts\n', {}).findings.map((one) => one.code)).toEqual(['nothing-to-migrate']);
    const result = migrate('apis:\n  a:\n    root: a.yaml\n    x-openapi-ts:\n      output: 2\n      bogus: 1\n', {});
    expect(result.config?.targets.types?.out).toBe(STDOUT_OUT);
    expect(result.findings[0]?.fix).toBe('remove it; `apicontract gen --help` lists what the types target takes');
  });

  it('reports YAML it cannot read in full, and nothing else from it', () => {
    const result = migrate('a: [', {});
    expect(result.config).toBeUndefined();
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]?.pointer).toBe('redocly.yaml');
    expect(result.findings[0]?.message).toMatch(/^redocly\.yaml is not YAML this migration reads: ./u);
  });

  it('counts http and https as remote, and only at the start', () => {
    expect(migrate(undefined, { 'package.json': pkg({ a: 'openapi-typescript http://x.dev/a.yaml -o a.ts' }) }).findings.map((one) => one.code)).toEqual(['remote-input']);
    expect(migrate(undefined, { 'package.json': pkg({ a: 'openapi-typescript mirror/https://x.yaml -o a.ts' }) }).findings).toEqual([]);
  });
});

