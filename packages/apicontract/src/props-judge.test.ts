import { describe, expect, it } from 'vitest';

import { draftOf, rooted, validatorJudge } from './props-judge.js';

describe('the judge', () => {
  it('reads a contract dialect from its document', () => {
    expect(draftOf({ document: { openapi: '3.0.3' } })).toBe('openapi-3.0');
    expect(draftOf({ document: { openapi: '3.1.0' } })).toBe('2020-12');
    expect(draftOf({ document: { $schema: 'http://json-schema.org/draft-07/schema#' } })).toBe('draft-07');
    expect(draftOf({ document: [] })).toBe('2020-12');
    expect(draftOf({ document: { $schema: 'https://json-schema.org/draft/2020-12/schema' } })).toBe('2020-12');
  });

  it('carries the definitions a payload points into beside it, without overwriting its own', () => {
    expect(rooted(true, {})).toEqual({});
    expect(rooted(false, {})).toEqual({ not: {} });
    expect(rooted({ $ref: '#/components/schemas/A' }, { components: { schemas: {} }, paths: {} })).toEqual({ components: { schemas: {} }, $ref: '#/components/schemas/A' });
    expect(rooted({ $defs: { mine: {} } }, { $defs: { theirs: {} }, definitions: {} })).toEqual({ definitions: {}, $defs: { mine: {} } });
    expect(rooted({ type: 'string' }, 'not a document')).toEqual({ type: 'string' });
    expect(Object.keys(rooted({ type: 'string' }, { components: {} }) as object)).toEqual(['components', 'type']);
  });

  it('gives the places a value is refused at, and none when it is accepted', () => {
    expect(validatorJudge({ type: 'string' }, '2020-12').paths(1)).toEqual(['']);
    expect(validatorJudge({ type: 'string' }, '2020-12').paths('x')).toEqual([]);
    expect(validatorJudge({ type: 'string' }, '2020-12').accepts('x')).toBe(true);
  });
});
