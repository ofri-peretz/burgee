import { describe, expect, it } from 'vitest';

import { changed, HOSTILE_ID, hostile, PROBE_ID, PROBE_PROPERTY } from './testing-probe.js';

const probe = { get: { operationId: 'conformanceProbe', responses: { '200': { description: 'the conformance probe' } } } };

describe('changed', () => {
  it.each([[undefined], [null], ['openapi'], [[]], [{ openapi: '3.1.0' }], [{ paths: [] }], [{ paths: null }]])('has nothing to change in %j', (document) => {
    expect(changed(document)).toBeUndefined();
  });

  it('adds one operation, and one property to every named object schema, to a copy', () => {
    const document = {
      openapi: '3.1.0',
      paths: { '/pets': {} },
      components: { schemas: { Pet: { type: 'object', properties: { name: { type: 'string' } } }, Id: { type: 'string' }, Odd: 1 } },
    };
    const before = structuredClone(document);
    expect(changed(document)).toEqual({
      openapi: '3.1.0',
      paths: { '/pets': {}, '/conformance-probe': probe },
      components: {
        schemas: { Pet: { type: 'object', properties: { name: { type: 'string' }, conformanceProbe: { type: 'string' } } }, Id: { type: 'string' }, Odd: 1 },
      },
    });
    expect(document).toEqual(before);
  });

  it('reads Swagger 2 definitions as well', () => {
    expect(changed({ swagger: '2.0', paths: {}, definitions: { Pet: { properties: {} }, Bad: { properties: [] } } })).toEqual({
      swagger: '2.0',
      paths: { '/conformance-probe': probe },
      definitions: { Pet: { properties: { conformanceProbe: { type: 'string' } } }, Bad: { properties: [] } },
    });
  });

  it.each([[{ components: 1 }], [{ components: { schemas: [] } }], [{ definitions: [] }]])('tolerates named schemas that are not a map: %j', (extra) => {
    expect(changed({ paths: {}, ...extra })).toEqual({ paths: { '/conformance-probe': probe }, ...extra });
  });

  it('names its probe', () => {
    expect([PROBE_ID, PROBE_PROPERTY]).toEqual(['conformanceProbe', 'conformanceProbe']);
  });
});

describe('hostile', () => {
  it('adds an operation whose id leaves the output folder', () => {
    expect(hostile({ paths: {} })).toEqual({
      paths: { '/conformance-hostile': { get: { operationId: '../conformance-probe', responses: { '200': { description: 'the conformance probe' } } } } },
    });
    expect(HOSTILE_ID).toBe('../conformance-probe');
  });

  it('has nothing to change without paths', () => {
    expect(hostile({})).toBeUndefined();
  });
});
