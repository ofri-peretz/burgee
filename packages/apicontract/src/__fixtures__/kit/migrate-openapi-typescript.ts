/**
 * openapi-typescript's documented configurations, copied from its CLI page, one case per example.
 * Source: https://github.com/openapi-ts/openapi-typescript/blob/main/docs/cli.md
 * (read 2026-11-18 at 323e9a567c7ff3ddad7bc7a1bfa39b859e94b296).
 */
import { type Config } from '../../migrate-shared.js';

export interface Case {
  readonly name: string;
  readonly configText?: string;
  readonly files: Readonly<Record<string, string>>;
  readonly config: Config | undefined;
  /** Each finding as `code @ pointer`. */
  readonly findings: readonly string[];
  /** `package.json` after the migration, when it changes. */
  readonly packageJson?: string;
}

const pkg = (script: string): string => `{\n  "scripts": {\n    "types": ${JSON.stringify(script)}\n  }\n}\n`;

const compat = { compat: 'openapi-typescript' } as const;

export const cases: readonly Case[] = [
  {
    // § Single schema
    name: 'a single local schema',
    files: { 'package.json': pkg('npx openapi-typescript schema.yaml -o schema.ts') },
    config: { input: 'schema.yaml', targets: { types: { generator: 'types', out: 'schema.ts', options: compat } } },
    findings: [],
    packageJson: pkg('contractdiff gen'),
  },
  {
    // § Single schema, remote
    name: 'a remote schema',
    files: { 'package.json': pkg('npx openapi-typescript https://petstore3.swagger.io/api/v3/openapi.yaml -o petstore.d.ts') },
    config: { input: 'https://petstore3.swagger.io/api/v3/openapi.yaml', targets: { types: { generator: 'types', out: 'petstore.d.ts', options: compat } } },
    findings: ['remote-input @ contractdiff.config.json#/input'],
    packageJson: pkg('contractdiff gen'),
  },
  {
    // § Multiple schemas: redocly.yaml, and `npx openapi-typescript` with no input
    name: 'multiple schemas in redocly.yaml',
    configText: [
      'apis:',
      '  core@v2:',
      '    root: ./openapi/openapi.yaml',
      '    x-openapi-ts:',
      '      output: ./openapi/openapi.ts',
      '  external@v1:',
      '    root: ./openapi/external.yaml',
      '    x-openapi-ts:',
      '      output: ./openapi/external.ts',
      '      additional-properties: true # CLI flags are also supported, either in kebab-case or camelCase format',
      '',
    ].join('\n'),
    files: { 'package.json': pkg('npx openapi-typescript') },
    config: { input: './openapi/openapi.yaml', targets: { types: { generator: 'types', out: './openapi/openapi.ts', options: compat } } },
    findings: ['second-input @ redocly.yaml#/apis/external@v1'],
    packageJson: pkg('contractdiff gen'),
  },
  {
    // § Redocly config
    name: 'a redocly.yaml somewhere else',
    files: { 'package.json': pkg('npx openapi-typescript --redocly ./path/to/redocly.yaml') },
    config: undefined,
    findings: ['option-dropped @ package.json#/scripts/types', 'nothing-to-migrate @ package.json#/scripts'],
    packageJson: pkg('contractdiff gen'),
  },
  {
    // § Auth
    name: 'auth headers in redocly.yaml',
    configText: [
      'resolve:',
      '  http:',
      '    headers:',
      '      - matches: https://api.example.com/v2/**',
      '        name: X-API-KEY',
      '        envVariable: SECRET_KEY',
      '      - matches: https://example.com/*/test.yaml',
      '        name: Authorization',
      '        envVariable: SECRET_AUTH',
      '',
    ].join('\n'),
    files: { 'package.json': pkg('openapi-typescript https://api.example.com/v2/openapi.yaml -o src/api.ts') },
    config: { input: 'https://api.example.com/v2/openapi.yaml', targets: { types: { generator: 'types', out: 'src/api.ts', options: compat } } },
    findings: ['option-dropped @ redocly.yaml#/resolve', 'remote-input @ contractdiff.config.json#/input'],
    packageJson: pkg('contractdiff gen'),
  },
  {
    // § Flags: every row of the table, `--check` becoming `gen --check`
    name: 'every documented flag',
    files: {
      'package.json': pkg(
        'openapi-typescript api.yaml --output api.ts --additional-properties --alphabetize --array-length --default-non-nullable=false --properties-required-by-default --empty-objects-unknown --enum --enum-values --conditional-enums --dedupe-enums --check --exclude-deprecated -t --immutable --path-params-as-types --root-types --root-types-no-schema-prefix --root-types-keep-casing --make-paths-enum --generate-path-params --read-write-markers',
      ),
    },
    config: {
      input: 'api.yaml',
      targets: {
        types: {
          generator: 'types',
          out: 'api.ts',
          options: {
            ...compat,
            additionalProperties: true,
            alphabetize: true,
            arrayLength: true,
            defaultNonNullable: false,
            propertiesRequiredByDefault: true,
            emptyObjectsUnknown: true,
            enum: true,
            enumValues: true,
            conditionalEnums: true,
            dedupeEnums: true,
            excludeDeprecated: true,
            exportType: true,
            immutable: true,
            pathParamsAsTypes: true,
            rootTypes: true,
            rootTypesNoSchemaPrefix: true,
            rootTypesKeepCasing: true,
            makePathsEnum: true,
            generatePathParams: true,
            readWriteMarkers: true,
          },
        },
      },
    },
    findings: [],
    packageJson: pkg('contractdiff gen --check'),
  },
  {
    // § Single schema, printing to stdout as the page's `(stdout)` default
    name: 'output to stdout',
    files: { 'package.json': pkg('openapi-typescript schema.yaml') },
    config: { input: 'schema.yaml', targets: { types: { generator: 'types', out: 'schema.ts', options: compat } } },
    findings: ['stdout-output @ package.json#/scripts/types'],
    packageJson: pkg('contractdiff gen'),
  },
];
