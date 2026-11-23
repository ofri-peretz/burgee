// A plugin contributing one lint rule, for command-lint's plugin tests.
const document = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/pets': { get: { operationId: 'listPets', responses: { 200: { description: 'ok' } } } } } };
export const plugin = {
  name: 'summary-rule',
  rules: {
    'operation-summary-says-what': {
      description: 'Every operation has a summary',
      given: { select: 'operation' },
      then: { field: 'summary', function: 'truthy' },
      fix: 'add a one-line `summary`',
      sample: { document, findings: [{ pointer: '#/paths/~1pets/get', message: '`summary` is missing' }] },
    },
  },
};
