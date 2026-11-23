/**
 * A plugin that passes every conformance rule, and the extractor that round-trips it. The seven
 * `broken-*.ts` beside it each break one rule of it and nothing else (apicontract-kit R2).
 */
import { type Contract } from '../../core/model.js';
import { type Extractor, type GeneratedFile, type Generator, type Plugin } from '../../host.js';

export const document = {
  openapi: '3.1.0',
  paths: { '/pets': { get: { operationId: 'listPets' } } },
  components: { schemas: { Pet: { type: 'object', properties: { name: { type: 'string' } } } } },
};

/** The operation ids, sorted, one per line. */
export const listing = (contract: Contract): string =>
  contract.operations
    .map((operation) => operation.id)
    .toSorted()
    .map((id) => `${id}\n`)
    .join('');

export const files: GeneratedFile[] = [
  { path: 'operations.txt', owner: 'generated', content: 'listPets\n' },
  { path: 'custom.ts', owner: 'user', content: '// Your code. contractdiff writes this file once and never again.\n' },
];

export const list = (contract: Contract): GeneratedFile[] => [
  { path: 'operations.txt', owner: 'generated', content: listing(contract) },
  { path: 'custom.ts', owner: 'user', content: '// Your code. contractdiff writes this file once and never again.\n' },
];

export const generator: Generator = { description: 'Lists the operations', inputs: ['openapi'], sample: { document, files }, run: list };

export const plugin: Plugin = { name: 'list', generators: { list: generator } };

/** Reads `operations.txt` back into an OpenAPI document with one `get` per line. */
export const extractor: Extractor = {
  description: 'Reads the operation list back',
  sample: { options: {}, document: { openapi: '3.1.0', paths: {} } },
  run: (options) => {
    const written = (options.files as GeneratedFile[] | undefined)?.find((file) => file.path === 'operations.txt')?.content ?? '';
    const ids = written.split('\n').filter((id) => id !== '');
    return { openapi: '3.1.0', paths: Object.fromEntries(ids.map((id) => [`/${id}`, { get: { operationId: id } }])) };
  },
};
