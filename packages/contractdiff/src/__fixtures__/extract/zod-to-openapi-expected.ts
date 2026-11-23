/**
 * The documents zod-to-openapi says its examples produce, transcribed from its YAML as it is (source
 * URLs in `zod-to-openapi.ts`). `info`, `servers` and `securitySchemes` are left out: an operation map
 * has none of them, and the grade compares `paths`.
 */
const User = {
  type: 'object',
  properties: { id: { type: 'string', example: '1212121' }, name: { type: 'string', example: 'John Doe' }, age: { type: 'number', example: 42 } },
  required: ['id', 'name', 'age'],
};

/** README.md, "Purpose and quick example". */
export const readme = {
  components: { schemas: { User } },
  paths: {
    '/users/{id}': {
      get: {
        summary: 'Get a single user',
        parameters: [{ in: 'path', name: 'id', schema: { type: 'string' }, required: true }],
        responses: { '200': { description: 'Object with user data', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } } },
      },
    },
  },
};

/** example/openapi-docs.yml. */
export const example = {
  components: {
    schemas: { UserId: { type: 'string', example: '1212121' }, User },
    parameters: { UserId: { schema: { $ref: '#/components/schemas/UserId' }, required: true, name: 'id', in: 'path' } },
  },
  paths: {
    '/users/{id}': {
      get: {
        description: 'Get user data by its id',
        summary: 'Get a single user',
        parameters: [{ $ref: '#/components/parameters/UserId' }],
        responses: {
          '200': { description: 'Object with user data.', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '204': { description: 'No content - successful operation' },
        },
      },
    },
  },
};
