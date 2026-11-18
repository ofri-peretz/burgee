import { describe, expect, it } from 'vitest';

import { basic, packageJson, pathBased } from './__fixtures__/kit/migrate-openapi-fetch.js';
import { migrate } from './migrate-openapi-fetch.js';

const types = { generator: 'types', out: './src/lib/api/v1.d.ts', options: { compat: 'openapi-typescript' } };

describe('the documented examples', () => {
  it('basic usage: the types target, the fetch target beside it, and the import pointed at the generated client', () => {
    const result = migrate(undefined, { 'package.json': packageJson, 'src/api.ts': basic, 'README.md': 'openapi-fetch' });
    expect(result.config).toEqual({ input: './path/to/api/v1.yaml', targets: { types, fetch: { generator: 'fetch', out: 'src/lib/api/client.ts' } } });
    expect(result.edits.map((edit) => edit.path)).toEqual(['package.json', 'src/api.ts']);
    expect(result.edits[1]?.after).toBe(
      basic.replace('import createClient from "openapi-fetch";', 'import { createClient } from "./lib/api/client";').replace('createClient<paths>({', 'createClient({'),
    );
    expect(result.findings).toEqual([
      {
        code: 'call-by-path',
        pointer: 'src/api.ts#L9',
        message: '`.GET(…)` calls by method and path, and the generated client has one method per operation',
        fix: 'call the method named by the operation’s `operationId` instead',
      },
      {
        code: 'call-by-path',
        pointer: 'src/api.ts#L15',
        message: '`.PUT(…)` calls by method and path, and the generated client has one method per operation',
        fix: 'call the method named by the operation’s `operationId` instead',
      },
    ]);
    expect(result.uninstall).toBe('npm uninstall openapi-fetch openapi-typescript');
  });

  it('the path-based client: left as it is, with a finding for its import and its call', () => {
    const result = migrate(undefined, { 'package.json': packageJson, 'src/paths.ts': pathBased });
    expect(result.edits.map((edit) => edit.path)).toEqual(['package.json']);
    expect(result.findings.map((one) => `${one.code} @ ${one.pointer}`)).toEqual(['import-not-rewritten @ src/paths.ts#L1', 'call-by-path @ src/paths.ts#L8']);
    expect(result.findings[0]?.message).toBe('this import of openapi-fetch is not a default `createClient` import');
    expect(result.findings[0]?.fix).toBe('import `createClient` from the generated client instead; it has one method per operation');
  });
});

describe('imports', () => {
  const files = (text: string, path = 'src/deep/api.ts') => ({ 'package.json': packageJson, [path]: text });

  it('keeps a local name, single quotes, and the `.js` style of the file', () => {
    const text = "import makeClient from 'openapi-fetch';\nimport { x } from '../x.js';\nconst a = makeClient<paths, 'application/json'>({});\n";
    expect(migrate(undefined, files(text)).edits[1]?.after).toBe("import { createClient as makeClient } from '../lib/api/client.js';\nimport { x } from '../x.js';\nconst a = makeClient({});\n");
  });

  it('reads a `$` in a local name as itself', () => {
    const text = "import $c from 'openapi-fetch';\nconst a = $c<paths>({});\nconst b = x$c<paths>({});\n";
    expect(migrate(undefined, files(text)).edits[1]?.after).toBe("import { createClient as $c } from '../lib/api/client';\nconst a = $c({});\nconst b = x$c<paths>({});\n");
  });

  it('reports a dynamic import and a require', () => {
    const text = "const a = await import('openapi-fetch');\nconst b = require(\"openapi-fetch\");\n";
    expect(migrate(undefined, files(text, 'src/a.mjs')).findings.map((one) => one.pointer)).toEqual(['src/a.mjs#L1', 'src/a.mjs#L2']);
  });

  it('reads only source files that mention openapi-fetch', () => {
    expect(migrate(undefined, { 'package.json': packageJson, 'a.md': 'client.GET(', 'b.ts': 'client.GET(', 'c.tsx': "import x from 'openapi-fetch'" }).edits.map((edit) => edit.path)).toEqual(['package.json', 'c.tsx']);
  });

  it('puts the client beside types written at the root', () => {
    const result = migrate(undefined, { 'package.json': packageJson.replace('./src/lib/api/v1.d.ts', 'v1.d.ts'), 'a.ts': "import c from 'openapi-fetch';" });
    expect(result.config?.targets.fetch).toEqual({ generator: 'fetch', out: 'client.ts' });
    expect(result.edits[1]?.after).toBe("import { createClient as c } from './client';");
  });
});

it('changes nothing when there are no types to build on', () => {
  const result = migrate(undefined, { 'a.ts': "import c from 'openapi-fetch';" });
  expect(result).toEqual({ config: undefined, edits: [], findings: [expect.objectContaining({ code: 'nothing-to-migrate' })], uninstall: 'npm uninstall openapi-fetch openapi-typescript' });
});
