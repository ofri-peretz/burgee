/**
 * A plugin for the spine's tests (apicontract-gen-command): one generator that writes a generated
 * TypeScript file, a generated JSON file and a user file, and one extractor. Loaded through a
 * config's `plugins`, as a user's plugin is.
 */
const upper = (id) => `${id.charAt(0).toUpperCase()}${id.slice(1)}`;

const run = (contract, options) => {
  const schemas = Object.keys(contract.document.components?.schemas ?? {}).toSorted();
  const operations = contract.operations.map((operation) => operation.id).toSorted();
  const banner = typeof options.banner === 'string' ? options.banner : '';
  return {
    files: [
      {
        path: 'types.ts',
        owner: 'generated',
        content: `${banner}${schemas.map((name) => `export type ${name} = unknown;\n`).join('')}`,
        symbols: operations.map((operation) => ({ operation, symbol: upper(operation) })),
      },
      { path: 'schemas.json', owner: 'generated', content: `${JSON.stringify(schemas)}\n` },
      { path: 'handlers.ts', owner: 'user', content: '// implement the handlers here\n', symbols: operations.map((operation) => ({ operation, symbol: operation })) },
    ],
    findings: operations.length === 0 ? [{ code: 'no-operations', pointer: '/paths', message: 'the spec declares no operations', fix: 'add paths to the spec' }] : [],
  };
};

const sampleDocument = { openapi: '3.1.0', components: { schemas: { Id: { type: 'string' } } } };

export const plugin = {
  name: 'spine-test',
  generators: {
    types: {
      description: 'One type per schema, for the tests',
      inputs: ['openapi'],
      sample: {
        document: sampleDocument,
        files: [
          { path: 'types.ts', owner: 'generated', content: 'export type Id = unknown;\n' },
          { path: 'schemas.json', owner: 'generated', content: '["Id"]\n' },
          { path: 'handlers.ts', owner: 'user', content: '// implement the handlers here\n' },
        ],
      },
      run,
    },
  },
  extractors: {
    schemas: {
      description: 'A spec with the title it is given, for the tests',
      sample: { options: {}, document: { openapi: '3.1.0', info: { title: 'extracted', version: '1' }, paths: {} } },
      run: (options) => {
        if (options.empty === true) return undefined;
        const document = { openapi: '3.1.0', info: { title: options.title ?? 'extracted', version: '1' }, paths: {} };
        // `findings`: what the spec could not say, beside it, as a generator returns `{ files, findings }`.
        return options.findings === true ? { document, findings: [{ code: 'type-only', pointer: '/health', message: 'health has no schema', fix: 'give it one' }] } : document;
      },
    },
  },
};
