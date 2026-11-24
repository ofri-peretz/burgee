/**
 * orval's documented configurations, copied from its docs, one case per example (read 2026-11-18):
 * - https://github.com/orval-labs/orval/blob/master/docs/content/docs/quick-start.mdx
 * - https://github.com/orval-labs/orval/blob/master/docs/content/docs/reference/configuration/full-example.mdx
 * - https://github.com/orval-labs/orval/blob/master/docs/content/docs/reference/configuration/output.mdx
 *   (§ client: one case per documented option)
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

const imports = (out: string, project = 'petstore'): string => `imports-change @ orval.config#/${project}/output`;

/** § client: `export default defineConfig({ petstore: { output: { client: '<option>' } } })`, with an input. */
const withClient = (client: string): string => `export default defineConfig({\n  petstore: {\n    input: './petstore.yaml',\n    output: {\n      target: 'src/petstore.ts',\n      client: '${client}',\n    },\n  },\n});\n`;

const fullExample = `import { faker } from '@faker-js/faker';
import { defineConfig } from 'orval';

export default defineConfig({
  petstore: {
    output: {
      mode: 'split',
      target: 'src/petstore.ts',
      schemas: 'src/model',
      client: 'react-query',
      mock: true,
      override: {
        operations: {
          listPets: {
            mutator: 'src/response-type.js',
            mock: {
              properties: () => ({
                id: () => faker.number.int({ min: 1, max: 99999 }),
              }),
            },
          },
          showPetById: {
            mock: {
              data: () => ({
                id: faker.number.int({ min: 1, max: 99 }),
                name: faker.person.firstName(),
                tag: faker.helpers.arrayElement([
                  faker.word.sample(),
                  undefined,
                ]),
              }),
            },
          },
        },
        mock: {
          properties: {
            '/tag|name/': () => faker.person.lastName(),
          },
          delay: 500,
        },
      },
      allParamsOptional: true,
      urlEncodeParameters: true,
    },
    input: {
      target: './petstore.yaml',
      override: {
        transformer: 'src/add-version.js',
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
});
`;

const types = (out = 'src') => ({ types: { generator: 'types', out } });
const at = (client: string, ...generators: string[]): Config => ({
  input: './petstore.yaml',
  targets: { ...types(), ...Object.fromEntries(generators.map((generator) => [generator, { generator, out: 'src' }])) },
});
const dropped = 'client-dropped @ orval.config#/petstore/output/client';
const translated = 'client-translated @ orval.config#/petstore/output/client';

export const cases: readonly Case[] = [
  {
    name: 'quick start: the CLI',
    script: 'orval --input ./petstore.yaml --output ./src/petstore.ts',
    config: { input: './petstore.yaml', targets: { types: { generator: 'types', out: './src' }, fetch: { generator: 'fetch', out: './src' } } },
    findings: ['client-translated @ orval.config#/cli/output/client', imports('./src/petstore.ts', 'cli')],
  },
  {
    name: 'quick start: a config file',
    configText: "import { defineConfig } from 'orval';\n\nexport default defineConfig({\n  petstore: {\n    input: './petstore.yaml',\n    output: './src/petstore.ts',\n  },\n});\n",
    config: { input: './petstore.yaml', targets: { types: { generator: 'types', out: './src' }, fetch: { generator: 'fetch', out: './src' } } },
    findings: [translated, imports('./src/petstore.ts')],
  },
  {
    name: 'quick start: React Query with a models folder',
    configText:
      "import { defineConfig } from 'orval';\n\nexport default defineConfig({\n  petstore: {\n    input: './petstore.yaml',\n    output: {\n      target: './src/api/petstore.ts',\n      schemas: './src/api/model',\n      client: 'react-query',\n    },\n  },\n});\n",
    config: {
      input: './petstore.yaml',
      targets: {
        types: { generator: 'types', out: './src/api/model' },
        fetch: { generator: 'fetch', out: './src/api' },
        'tanstack-query': { generator: 'tanstack-query', out: './src/api' },
      },
    },
    findings: [imports('./src/api/petstore.ts')],
  },
  {
    name: 'the full example',
    configText: fullExample,
    config: {
      input: './petstore.yaml',
      targets: {
        types: { generator: 'types', out: 'src/model' },
        fetch: { generator: 'fetch', out: 'src' },
        'tanstack-query': { generator: 'tanstack-query', out: 'src' },
        msw: { generator: 'msw', out: 'src' },
      },
    },
    findings: [
      'option-dropped @ orval.config#/petstore/hooks',
      'option-dropped @ orval.config#/petstore/input/override',
      'option-dropped @ orval.config#/petstore/output/mode',
      'option-dropped @ orval.config#/petstore/output/override',
      'option-dropped @ orval.config#/petstore/output/allParamsOptional',
      'option-dropped @ orval.config#/petstore/output/urlEncodeParameters',
      imports('src/petstore.ts'),
    ],
  },
  { name: 'client: angular', configText: withClient('angular'), config: at('angular'), findings: [dropped, imports('')] },
  { name: 'client: angular-query', configText: withClient('angular-query'), config: at('angular-query'), findings: [dropped, imports('')] },
  { name: 'client: axios', configText: withClient('axios'), config: at('axios', 'fetch'), findings: [translated, imports('')] },
  { name: 'client: axios-functions', configText: withClient('axios-functions'), config: at('axios-functions', 'fetch'), findings: [translated, imports('')] },
  { name: 'client: react-query', configText: withClient('react-query'), config: at('react-query', 'fetch', 'tanstack-query'), findings: [imports('')] },
  { name: 'client: solid-start', configText: withClient('solid-start'), config: at('solid-start'), findings: [dropped, imports('')] },
  { name: 'client: solid-query', configText: withClient('solid-query'), config: at('solid-query'), findings: [dropped, imports('')] },
  { name: 'client: svelte-query', configText: withClient('svelte-query'), config: at('svelte-query'), findings: [dropped, imports('')] },
  { name: 'client: vue-query', configText: withClient('vue-query'), config: at('vue-query'), findings: [dropped, imports('')] },
  { name: 'client: pinia-colada', configText: withClient('pinia-colada'), config: at('pinia-colada'), findings: [dropped, imports('')] },
  { name: 'client: swr', configText: withClient('swr'), config: at('swr', 'fetch', 'swr'), findings: [imports('')] },
  { name: 'client: zod', configText: withClient('zod'), config: at('zod', 'validator'), findings: [translated, imports('')] },
  { name: 'client: effect', configText: withClient('effect'), config: at('effect'), findings: [dropped, imports('')] },
  { name: 'client: valibot', configText: withClient('valibot'), config: at('valibot'), findings: [dropped, imports('')] },
  { name: 'client: hono', configText: withClient('hono'), config: at('hono', 'hono'), findings: [imports('')] },
  { name: 'client: fetch', configText: withClient('fetch'), config: at('fetch', 'fetch'), findings: [imports('')] },
  { name: 'client: mcp', configText: withClient('mcp'), config: at('mcp', 'mcp'), findings: [imports('')] },
];
