/**
 * Hey API's documented configurations, copied from its docs, one case per example (read 2026-11-18):
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/configuration.mdx
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/get-started.mdx
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/clients/fetch.mdx
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/plugins/tanstack-query.mdx
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/plugins/zod/v4.mdx
 * - https://github.com/hey-api/openapi-ts/blob/main/web/src/content/docs/docs/openapi/typescript/plugins/msw.mdx
 */
import { type Config } from '../../migrate-shared.js';

export interface Case {
  readonly name: string;
  readonly configText?: string;
  readonly script?: string;
  readonly config: Config | undefined;
  /** Each finding as `code @ pointer`. */
  readonly findings: readonly string[];
}

const registry = 'registry-input @ contractdiff.config.json#/input';
const imports = 'imports-change @ openapi-ts.config#/output';
const both = { types: { generator: 'types', out: 'src/client' }, fetch: { generator: 'fetch', out: 'src/client' } };
const backend = (plugins: string): string => `export default {\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n  plugins: [\n    // ...other plugins\n${plugins}\n  ],\n};\n`;

export const cases: readonly Case[] = [
  {
    name: 'configuration: defineConfig in openapi-ts.config.ts',
    configText: "import { defineConfig } from '@hey-api/openapi-ts';\n\nexport default defineConfig({\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n});\n",
    config: { input: 'hey-api/backend', targets: both },
    findings: [registry, imports],
  },
  {
    name: 'configuration: CommonJS',
    configText: "/** @type {import('@hey-api/openapi-ts').UserConfig} */\nmodule.exports = {\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n};\n",
    config: { input: 'hey-api/backend', targets: both },
    findings: [registry, imports],
  },
  {
    name: 'configuration: ESM',
    configText: "/** @type {import('@hey-api/openapi-ts').UserConfig} */\nexport default {\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n};\n",
    config: { input: 'hey-api/backend', targets: both },
    findings: [registry, imports],
  },
  {
    name: 'configuration: several configs',
    configText: "export default [\n  {\n    input: 'foo.yaml',\n    output: 'src/foo',\n  },\n  {\n    input: 'bar.yaml',\n    output: 'src/bar',\n  },\n];\n",
    config: { input: 'foo.yaml', targets: { types: { generator: 'types', out: 'src/foo' }, fetch: { generator: 'fetch', out: 'src/foo' } } },
    findings: ['second-input @ openapi-ts.config#/1', 'imports-change @ openapi-ts.config#/output'],
  },
  {
    name: 'configuration: several inputs, one output each',
    configText: "export default {\n  input: ['foo.yaml', 'bar.yaml'],\n  output: ['src/foo', 'src/bar'],\n};\n",
    config: { input: 'foo.yaml', targets: { types: { generator: 'types', out: 'src/foo' }, fetch: { generator: 'fetch', out: 'src/foo' } } },
    findings: ['second-input @ openapi-ts.config#/input/1', 'second-output @ openapi-ts.config#/output/1', imports],
  },
  {
    name: 'configuration: several inputs, one output',
    configText: "export default {\n  input: ['foo.yaml', 'bar.yaml'],\n  output: 'src/client',\n};\n",
    config: { input: 'foo.yaml', targets: both },
    findings: ['second-input @ openapi-ts.config#/input/1', imports],
  },
  {
    name: 'get started: the CLI',
    script: 'npx @hey-api/openapi-ts -i hey-api/backend -o src/client',
    config: { input: 'hey-api/backend', targets: both },
    findings: [registry, imports],
  },
  {
    name: 'get started: a Vite plugin is not a config file',
    configText:
      "import { heyApiPlugin } from '@hey-api/vite-plugin';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({\n  plugins: [\n    heyApiPlugin({\n      config: {\n        input: 'hey-api/backend', // sign up at app.heyapi.dev\n        output: 'src/client',\n      },\n    }),\n  ],\n});\n",
    config: undefined,
    findings: ['nothing-to-migrate @ openapi-ts.config#/input'],
  },
  {
    name: 'get started: createClient in a script is not a config file',
    configText: "import { createClient } from '@hey-api/openapi-ts';\n\ncreateClient({\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n});\n",
    config: undefined,
    findings: ['config-unreadable @ openapi-ts.config'],
  },
  {
    name: 'fetch client: the plugin',
    configText: "export default {\n  input: 'hey-api/backend', // sign up at app.heyapi.dev\n  output: 'src/client',\n  plugins: ['@hey-api/client-fetch'],\n};\n",
    config: { input: 'hey-api/backend', targets: { fetch: { generator: 'fetch', out: 'src/client' } } },
    findings: [registry, imports],
  },
  {
    name: 'fetch client: the CLI',
    script: 'npx @hey-api/openapi-ts \\\n  -i hey-api/backend \\\n  -o src/client \\\n  -c @hey-api/client-fetch',
    config: { input: 'hey-api/backend', targets: both },
    findings: [registry, imports],
  },
  {
    name: 'fetch client: runtimeConfigPath',
    configText: backend("    {\n      name: '@hey-api/client-fetch',\n      runtimeConfigPath: './src/hey-api.ts',\n    },"),
    config: { input: 'hey-api/backend', targets: { fetch: { generator: 'fetch', out: 'src/client' } } },
    findings: ['option-dropped @ openapi-ts.config#/plugins/0/runtimeConfigPath', registry, imports],
  },
  {
    name: 'TanStack Query: React',
    configText: backend("    '@tanstack/react-query',"),
    config: { input: 'hey-api/backend', targets: { 'tanstack-query': { generator: 'tanstack-query', out: 'src/client' } } },
    findings: [registry, imports],
  },
  {
    name: 'TanStack Query: Vue',
    configText: backend("    '@tanstack/vue-query',"),
    config: { input: 'hey-api/backend', targets: {} },
    findings: [registry, imports, 'plugin-dropped @ openapi-ts.config#/plugins/0'],
  },
  {
    name: 'Zod',
    configText: backend("    'zod',"),
    config: { input: 'hey-api/backend', targets: { validator: { generator: 'validator', out: 'src/client' } } },
    findings: [registry, imports, 'plugin-translated @ openapi-ts.config#/plugins/0'],
  },
  {
    name: 'Zod: validating the SDK',
    configText: backend("    'zod',\n    {\n      name: '@hey-api/sdk',\n      validator: true,\n    },"),
    config: { input: 'hey-api/backend', targets: { validator: { generator: 'validator', out: 'src/client' }, fetch: { generator: 'fetch', out: 'src/client' } } },
    findings: [registry, imports, 'plugin-translated @ openapi-ts.config#/plugins/0', 'option-dropped @ openapi-ts.config#/plugins/1/validator'],
  },
  {
    name: 'MSW',
    configText: backend("    'msw',"),
    config: { input: 'hey-api/backend', targets: { msw: { generator: 'msw', out: 'src/client' } } },
    findings: [registry, imports],
  },
  {
    name: 'MSW: source',
    configText: backend("    {\n      name: 'msw',\n      source: [],\n    },"),
    config: { input: 'hey-api/backend', targets: { msw: { generator: 'msw', out: 'src/client' } } },
    findings: ['option-dropped @ openapi-ts.config#/plugins/0/source', registry, imports],
  },
];
