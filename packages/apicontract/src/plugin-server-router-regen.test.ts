/**
 * N1 (apicontract-servers success criteria) for `hono`, `fastify` and `express`: generate through
 * `gen`, edit the file the user owns, change the spec (add an operation, add a field, remove a
 * field), generate again, and not one byte the user owns has changed. The new operation reaches the
 * user as a member of `Handlers` that `handlers.ts` lacks, which is a type error, not a rewritten file.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { SAMPLE_DOCUMENT } from './plugin-server-sample.js';
import { gen } from './run-gen.js';

const scratch = scratchDirs();

const OUT = 'src/api';

/** A project generating the types, the validators and one server target into one folder. */
const project = (target: string, spec: unknown): string => {
  const root = realpathSync(scratch(`apicontract-${target}-`));
  writeFileSync(join(root, 'openapi.json'), JSON.stringify(spec));
  const targets = { types: { generator: 'types', out: OUT }, validator: { generator: 'validator', out: OUT }, [target]: { generator: target, out: OUT } };
  writeFileSync(join(root, 'apicontract.config.json'), JSON.stringify({ input: 'openapi.json', targets }));
  return root;
};

/** The sample with one more operation, one field added to `Pet` and one removed from it. */
const changed = (): unknown => {
  const spec = structuredClone(SAMPLE_DOCUMENT) as Omit<typeof SAMPLE_DOCUMENT, 'paths'> & { paths: Record<string, Record<string, unknown>> };
  spec.paths['/pets/{petId}'] = {
    ...spec.paths['/pets/{petId}'],
    delete: {
      operationId: 'deletePet',
      tags: ['pets'],
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer' }, example: 1 }],
      responses: { '204': { description: 'Deleted' } },
    },
  };
  spec.components.schemas.Pet = { type: 'object', required: ['id', 'tag'], properties: { id: { type: 'integer' }, tag: { type: 'string' } } } as never;
  return spec;
};

describe.each(['hono', 'fastify', 'express'])('regenerating a %s server (N1)', (target) => {
  it('leaves every user byte as it was and surfaces the new operation as a handler the user has not written', async () => {
    const root = project(target, SAMPLE_DOCUMENT);
    const first = await gen({ cwd: root });
    const owned = first.files.filter((file) => file.owner === 'user').map((file) => file.path);
    expect(owned).toEqual([`${OUT}/handlers.ts`]);

    // The user edits every file they own.
    const edited = new Map(owned.map((path) => [path, `${readFileSync(join(root, path), 'utf8')}\n// my change: ${path}\n`]));
    for (const [path, text] of edited) writeFileSync(join(root, path), text);

    writeFileSync(join(root, 'openapi.json'), JSON.stringify(changed()));
    const second = await gen({ cwd: root });

    // N1 = 0: no byte the user owns changed, and the run said it left them alone.
    const n1 = [...edited].filter(([path, text]) => readFileSync(join(root, path), 'utf8') !== text).length;
    expect(n1).toBe(0);
    expect(second.files.filter((file) => file.owner === 'user')).toEqual([{ path: `${OUT}/handlers.ts`, owner: 'user', action: 'skip', target }]);

    // The generated side did move: a new member of `Handlers`, a new route, a new contract test, the new field and not the removed one.
    const routes = readFileSync(join(root, OUT, 'routes.ts'), 'utf8');
    expect(routes).toContain('  deletePet(input: DeletePetInput): DeletePetOutput | Promise<DeletePetOutput>;\n');
    expect(routes).toContain('    operation: "deletePet",\n    method: "delete",\n');
    expect(second.files).toContainEqual({ path: `${OUT}/deletePet.contract.test.ts`, owner: 'generated', action: 'write', target });
    const types = readFileSync(join(root, OUT, 'types.ts'), 'utf8');
    const pet = /\n {8}Pet: \{[^}]*\}/u.exec(types)?.[0];
    expect(pet).toContain('tag: string;');
    expect(pet).not.toContain('name');

    // ... which the user's object does not implement: the compiler reports it there, in their file.
    const user = readFileSync(join(root, OUT, 'handlers.ts'), 'utf8');
    expect(user).toContain('export const handlers: Handlers = {');
    expect(user).not.toContain('deletePet');
  });
});
