import { readdirSync, readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { apply, applyOverlays, detect, OverlayError } from './input-overlay.js';

const FIXTURES = new URL('__fixtures__/inputs/overlay/', import.meta.url);

const yaml = (path: string): unknown => parse(readFileSync(new URL(path, FIXTURES), 'utf8'));

/** The Overlay specification's compliant sets: a document, an overlay, and the document it must produce. */
const sets = readdirSync(new URL('compliant-sets/', FIXTURES), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name)
  .toSorted();

/** The Overlay specification's schema tests that must pass, for 1.0 and 1.1. */
const passing = ['v1.0', 'v1.1'].flatMap((version) =>
  readdirSync(new URL(`tests/${version}/pass/`, FIXTURES))
    .toSorted()
    .map((file) => `tests/${version}/pass/${file}`),
);

const overlay = (...actions: unknown[]): object => ({ overlay: '1.2.0', info: { title: 't', version: '1' }, actions });

const codes = (document: unknown, value: unknown): string[] => apply(document, value).findings.map(({ code, pointer }) => `${code} ${pointer}`);

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(OverlayError);
    return (error as Error).message;
  }
  throw new Error('it did not refuse');
};

describe('detect', () => {
  it('accepts Overlay 1.x, and nothing else', () => {
    for (const version of ['1.0.0', '1.1.0', '1.2.0']) expect(detect({ overlay: version })).toBe(true);
    for (const other of [{ overlay: '2.0.0' }, { overlay: 1 }, { openapi: '3.1.0' }, [], null, 'overlay']) expect(detect(other)).toBe(false);
  });
});

describe('update', () => {
  it('merges into an object: adds, replaces primitives, appends arrays, merges objects', () => {
    const document = { info: { title: 'a', tags: ['x'], contact: { name: 'n' }, keep: 1, empty: null } };
    const result = apply(document, overlay({ target: '$.info', update: { title: 'b', tags: ['y'], contact: { email: 'e' }, added: { z: 1 }, empty: 'now' } }));
    expect(result).toStrictEqual({
      document: { info: { title: 'b', tags: ['x', 'y'], contact: { name: 'n', email: 'e' }, keep: 1, empty: 'now', added: { z: 1 } } },
      findings: [],
    });
    expect(document.info.title).toBe('a');
  });

  it('appends to an array: a list item by item, anything else as one item', () => {
    const document = { a: [1], b: [1] };
    expect(apply(document, overlay({ target: '$.a', update: [2, 3] }, { target: '$.b', update: { c: 1 } })).document).toStrictEqual({ a: [1, 2, 3], b: [1, { c: 1 }] });
  });

  it('replaces a primitive, in an object, in an array, or the whole document', () => {
    expect(apply({ a: 1, list: [1, 2] }, overlay({ target: '$.a', update: 2 }, { target: '$.list[1]', update: 'two' })).document).toStrictEqual({ a: 2, list: [1, 'two'] });
    expect(apply('old', overlay({ target: '$', update: 'new' })).document).toBe('new');
  });

  it('applies to every node the target selects, each with its own copy', () => {
    const result = apply({ paths: { a: { get: {} }, b: { get: {} } } }, overlay({ target: '$.paths.*.get', update: { tags: ['t'] } })).document as Record<string, any>;
    expect(result.paths).toStrictEqual({ a: { get: { tags: ['t'] } }, b: { get: { tags: ['t'] } } });
    expect(result.paths.a.get.tags).not.toBe(result.paths.b.get.tags);
  });

  it('adds a member named `__proto__` as a member, not as a prototype', () => {
    const update = JSON.parse('{"__proto__": {"polluted": true}, "info": {"__proto__": 1}}') as unknown;
    const result = apply({ info: { __proto__: null } }, overlay({ target: '$', update })).document as Record<string, unknown>;
    expect(Object.getOwnPropertyNames(result)).toContain('__proto__');
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses an update of another kind than what it targets', () => {
    expect(refusal(() => apply({ info: { title: 'a' } }, overlay({ target: '$.info', update: 'x' })))).toBe(
      'cannot apply the overlay: `$.info` selects an object, and the update is a primitive. fix: update an object with an object of the members to merge',
    );
    expect(refusal(() => apply({ a: 1 }, overlay({ target: '$.a', update: [1] })))).toBe(
      'cannot apply the overlay: `$.a` selects a primitive, and the update is an array. fix: replace a primitive with a primitive, or target its parent',
    );
    expect(refusal(() => apply({ a: 1 }, overlay({ target: '$.a', update: { b: 1 } })))).toContain('the update is an object');
    expect(refusal(() => apply({ info: { tags: [] } }, overlay({ target: '$', update: { info: { tags: 'x' } } })))).toBe(
      'cannot apply the overlay: `$.info.tags` is an array in the document and a primitive in the update. fix: update a member with a value of the same kind, or remove it first',
    );
    expect(refusal(() => apply({ info: 'x' }, overlay({ target: '$', update: { info: {} } })))).toContain('`$.info` is a primitive in the document and an object in the update');
  });
});

describe('remove', () => {
  it('removes members and items, array items last first so each index stays true', () => {
    const document = { servers: [{ d: 'Dev' }, { d: 'Prod' }, { d: 'Dev' }], info: { title: 'a', drop: 1 } };
    const result = apply(document, overlay({ target: "$.servers[?@.d == 'Dev']", remove: true }, { target: '$.info.drop', remove: true }));
    expect(result.document).toStrictEqual({ servers: [{ d: 'Prod' }], info: { title: 'a' } });
    expect(apply({ list: [0, 1, 2, 3] }, overlay({ target: '$.list[0,2]', remove: true })).document).toStrictEqual({ list: [1, 3] });
  });

  it('ignores an update beside `remove: true`, and refuses to remove the whole document', () => {
    expect(apply({ a: 1 }, overlay({ target: '$.a', remove: true, update: 2 })).document).toStrictEqual({});
    expect(apply({ a: 1 }, overlay({ target: '$.a', remove: false, update: 2 })).document).toStrictEqual({ a: 2 });
    expect(refusal(() => apply({ a: 1 }, overlay({ target: '$', remove: true })))).toBe(
      'cannot apply the overlay: `$` selects the whole document, which cannot be removed. fix: remove its members instead, e.g. `$.paths`',
    );
  });
});

describe('copy', () => {
  it('merges the one node a query selects into each target', () => {
    const document = { paths: { '/foo': { get: { summary: 'foo' } }, '/bar': { put: {} } } };
    expect(apply(document, overlay({ target: '$.paths["/bar"]', copy: '$.paths["/foo"]' })).document).toStrictEqual({
      paths: { '/foo': { get: { summary: 'foo' } }, '/bar': { put: {}, get: { summary: 'foo' } } },
    });
  });

  it('refuses a copy that selects other than one node, and an action with both update and copy', () => {
    expect(refusal(() => apply({ a: {}, b: {} }, overlay({ target: '$.a', copy: '$.*' })))).toBe(
      'cannot apply the overlay: `actions[0].copy` selects 2 nodes. fix: copy from a query that selects exactly one node',
    );
    expect(refusal(() => apply({ a: {} }, overlay({ target: '$.a', copy: '$.none' })))).toContain('selects 0 nodes');
    expect(refusal(() => apply({ a: {} }, overlay({ target: '$.a', copy: '$.a', update: {} })))).toBe(
      'cannot apply the overlay: `actions[0]` has both `update` and `copy`. fix: split it into two actions',
    );
  });
});

describe('what an overlay reports', () => {
  it('a target that selects nothing, and an action that does nothing', () => {
    const result = apply({ a: 1 }, overlay({ target: '$.missing', update: 1 }, { target: '$.a', description: 'nothing', copy: 3 }));
    expect(result.findings).toStrictEqual([
      {
        code: 'target-matched-nothing',
        pointer: '#/actions/0/target',
        message: '`$.missing` selects nothing in the document, so the action changes nothing',
        fix: 'update the target to match the document, or remove the action',
      },
      {
        code: 'action-without-effect',
        pointer: '#/actions/1',
        message: 'the action on `$.a` has no `update`, `copy` or `remove: true`, so it changes nothing',
        fix: 'say what the action does, or remove it',
      },
    ]);
  });
});

describe('reusable actions (1.2)', () => {
  it('applies the referenced action with the reference’s own target and fields over it', () => {
    const value = {
      ...overlay(
        { $ref: '#/components/actions/tag', target: '$.paths.*.get' },
        { $ref: '#/components/actions/tag', target: '$.info', update: { x: 1 } },
        { $ref: '#/components/actions/a~1b', target: '$.info' },
        { $ref: '#/components/actions/empty', target: '$.info' },
      ),
      components: { actions: { tag: { fields: { update: { tags: ['t'] } } }, 'a/b': { fields: { update: { y: 2 } } }, empty: {} } },
    };
    const result = apply({ info: {}, paths: { a: { get: {} } } }, value);
    expect(result.document).toStrictEqual({ info: { x: 1, y: 2 }, paths: { a: { get: { tags: ['t'] } } } });
    expect(result.findings.map(({ code }) => code)).toStrictEqual(['action-without-effect']);
  });

  it('refuses a reference outside components.actions, or to nothing', () => {
    expect(refusal(() => apply({}, overlay({ $ref: '#/info', target: '$' })))).toBe(
      'cannot apply the overlay: `actions[0].$ref` is `#/info`. fix: reference a reusable action as `#/components/actions/<name>`',
    );
    expect(refusal(() => apply({}, overlay({ $ref: '#/components/actions/none', target: '$' })))).toBe(
      'cannot apply the overlay: `actions[0].$ref` names `#/components/actions/none`, which the overlay does not define. fix: define it under `components.actions`',
    );
  });
});

describe('refusals', () => {
  it('names what is wrong with the overlay and how to fix it', () => {
    expect(refusal(() => apply({}, { openapi: '3.1.0' }))).toBe('cannot apply the overlay: it has no `overlay: 1.x` member. fix: pass an OpenAPI Overlay 1.0, 1.1 or 1.2 document');
    expect(refusal(() => apply({}, { overlay: '1.0.0' }))).toBe('cannot apply the overlay: it has no `actions` list. fix: list the actions to apply under `actions`');
    expect(refusal(() => apply({}, overlay('x')))).toBe('cannot apply the overlay: `actions[0]` is not an action object. fix: write each action as `{ target, update | copy | remove }`');
    expect(refusal(() => apply({}, overlay({ update: {} })))).toBe('cannot apply the overlay: `actions[0]` has no `target`. fix: say which nodes it applies to, e.g. `target: $.info`');
    expect(new OverlayError('r', 'f')).toMatchObject({ name: 'OverlayError', message: 'cannot apply the overlay: r. fix: f' });
  });
});

describe('applyOverlays', () => {
  it('applies overlays in order, each to the result of the one before, and leaves the document as it was', () => {
    const document = { info: { title: 'a' } };
    const result = applyOverlays(document, [overlay({ target: '$.info', update: { title: 'b' } }), overlay({ target: "$.info[?@ == 'b']", remove: true })]);
    expect(result).toStrictEqual({ info: {} });
    expect(document).toStrictEqual({ info: { title: 'a' } });
    expect(applyOverlays(document, [overlay({ target: '$.info.title', update: 'b' }), overlay({ target: '$.info', update: { v: 2 } })])).toStrictEqual({
      info: { title: 'b', v: 2 },
    });
    expect(applyOverlays(document, [])).toBe(document);
  });
});

describe('the Overlay specification’s own documents', () => {
  it('produces every compliant set’s output from its document and overlay', () => {
    expect(sets).toHaveLength(8);
    for (const set of sets) {
      const result = apply(yaml(`compliant-sets/${set}/openapi.yaml`), yaml(`compliant-sets/${set}/overlay.yaml`));
      expect(result.document, set).toStrictEqual(yaml(`compliant-sets/${set}/output.yaml`));
      expect(result.findings, set).toStrictEqual([]);
    }
  });

  it('applies every overlay the 1.0 and 1.1 schema tests pass, at least 20 documents read in all', () => {
    expect(passing).toHaveLength(25);
    expect(sets.length + passing.length).toBeGreaterThanOrEqual(20);
    const target = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/foo': { get: { parameters: [{ name: 'dummy', in: 'query' }] } }, '/bar': { get: {} } } };
    const tally: Record<string, number> = {};
    for (const file of passing) {
      const value = yaml(file);
      expect(detect(value), file).toBe(true);
      for (const { code } of apply(target, value).findings) tally[code] = (tally[code] ?? 0) + 1;
    }
    expect(tally).toStrictEqual({ 'action-without-effect': 10, 'target-matched-nothing': 4 });
  });
});
