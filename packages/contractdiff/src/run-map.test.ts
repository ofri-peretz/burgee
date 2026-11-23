import { describe, expect, it } from 'vitest';

import { digest } from './run-header.js';
import { emptyMap, handlersOf, MAP_FILE, parseMap, recordedFor, serializeMap, updateMap } from './run-map.js';

const refusal = (attempt: () => unknown): { message: string; code: unknown } => {
  try {
    attempt();
  } catch (error) {
    return error as { message: string; code: unknown };
  }
  throw new Error('expected a refusal');
};

describe('parseMap', () => {
  it('is empty when there is no map yet', () => {
    expect(MAP_FILE).toBe('contractdiff.map.json');
    expect(parseMap(undefined)).toEqual({ version: 1, operations: {}, files: {} });
  });

  it('reads back what serializeMap wrote', () => {
    const map = updateMap(emptyMap(), [{ target: 't', files: [{ path: 'a.ts', content: 'A', owner: 'generated', symbols: [{ operation: 'op', symbol: 'Op' }] }] }]);
    expect(parseMap(serializeMap(map))).toEqual(map);
  });

  it.each([
    ['not JSON', '{', 'is not JSON'],
    ['not an object', '[]', 'is not a version 1 contract map'],
    ['null', 'null', 'is not a version 1 contract map'],
    ['another version', '{"version":2,"operations":{},"files":{}}', 'is not a version 1 contract map'],
    ['no operations', '{"version":1,"files":{}}', 'is not a version 1 contract map'],
    ['no files', '{"version":1,"operations":{}}', 'is not a version 1 contract map'],
  ])('refuses a map that is %s, as a config error with a fix line', (_, text, why) => {
    const error = refusal(() => parseMap(text));
    expect(error.message).toBe(`contractdiff.map.json cannot be used:\n  - it ${why}. fix: delete contractdiff.map.json and run \`contractdiff gen\` again; it is regenerated, never edited`);
    expect(error.code).toBe('CONFIG');
  });
});

describe('updateMap', () => {
  const previous = {
    version: 1 as const,
    operations: { listPets: [{ file: 'old/a.ts', symbol: 'Old', target: 'types' }, { file: 'v.ts', symbol: 'listPets', target: 'validator' }], gone: [{ file: 'old/a.ts', symbol: 'Gone', target: 'types' }] },
    files: { 'old/a.ts': { target: 'types', sha: 'aaaaaaaaaaaa' }, 'v.ts': { target: 'validator', sha: 'bbbbbbbbbbbb' } },
  };

  it('replaces the targets that ran, keeps the others, and records generated files only', () => {
    const map = updateMap(previous, [
      {
        target: 'types',
        files: [
          { path: 'gen/z.ts', content: 'Z', owner: 'generated', symbols: [{ operation: 'listPets', symbol: 'ListPets' }, { operation: 'addPet', symbol: 'AddPet' }] },
          { path: 'gen/b.ts', content: 'B', owner: 'generated', symbols: [{ operation: 'listPets', symbol: 'A' }] },
          { path: 'gen/user.ts', content: 'U', owner: 'user', symbols: [{ operation: 'listPets', symbol: 'Handler' }] },
        ],
      },
    ]);
    expect(serializeMap(map)).toBe(
      `${JSON.stringify(
        {
          version: 1,
          operations: {
            addPet: [{ file: 'gen/z.ts', symbol: 'AddPet', target: 'types' }],
            listPets: [
              { file: 'gen/b.ts', symbol: 'A', target: 'types' },
              { file: 'gen/user.ts', symbol: 'Handler', target: 'types', owner: 'user' },
              { file: 'gen/z.ts', symbol: 'ListPets', target: 'types' },
              { file: 'v.ts', symbol: 'listPets', target: 'validator' },
            ],
          },
          files: { 'gen/b.ts': { target: 'types', sha: digest('B') }, 'gen/z.ts': { target: 'types', sha: digest('Z') }, 'v.ts': { target: 'validator', sha: 'bbbbbbbbbbbb' } },
        },
        undefined,
        2,
      )}\n`,
    );
  });

  it('orders entries by target, then file, then symbol', () => {
    const map = updateMap(emptyMap(), [
      { target: 'b', files: [{ path: 'x.ts', content: '', owner: 'generated', symbols: [{ operation: 'o', symbol: 'S2' }, { operation: 'o', symbol: 'S1' }] }] },
      { target: 'a', files: [{ path: 'y.ts', content: '', owner: 'generated', symbols: [{ operation: 'o', symbol: 'S' }] }] },
    ]);
    expect(map.operations.o?.map((e) => `${e.target}:${e.file}:${e.symbol}`)).toEqual(['a:y.ts:S', 'b:x.ts:S1', 'b:x.ts:S2']);
  });

  it('keeps the map unchanged when nothing ran', () => {
    expect(updateMap(previous, [])).toEqual({ ...previous, operations: { gone: previous.operations.gone, listPets: previous.operations.listPets } });
  });
});

describe('recordedFor', () => {
  it('returns the hashes of the given targets only', () => {
    const map = { version: 1 as const, operations: {}, files: { 'a.ts': { target: 'a', sha: '1' }, 'b.ts': { target: 'b', sha: '2' }, 'c.ts': { target: 'c', sha: '3' } } };
    expect([...recordedFor(map, ['a', 'c'])]).toEqual([['a.ts', '1'], ['c.ts', '3']]);
  });
});

describe('handlersOf', () => {
  it('is the symbols the user owns for an operation, and none for an operation the map does not have', () => {
    const map = updateMap(emptyMap(), [
      {
        target: 'nest',
        files: [
          { path: 'pets.controller.base.ts', content: 'B', owner: 'generated', symbols: [{ operation: 'listPets', symbol: 'PetsControllerBase' }] },
          { path: 'pets.controller.ts', content: 'U', owner: 'user', symbols: [{ operation: 'listPets', symbol: 'PetsController.listPets' }] },
        ],
      },
    ]);
    expect(handlersOf(map, 'listPets')).toStrictEqual([{ file: 'pets.controller.ts', symbol: 'PetsController.listPets', target: 'nest', owner: 'user' }]);
    expect(handlersOf(map, 'nope')).toStrictEqual([]);
    expect(handlersOf(map, 'toString')).toStrictEqual([]);
  });
});
