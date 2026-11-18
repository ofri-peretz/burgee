import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { locusOf, ruleId, RULES } from './diff-rules.js';

describe('the oasdiff table', () => {
  it('is pinned: a changed row changes this hash, and the corpus lane re-grades it (D1)', () => {
    expect(RULES).toHaveLength(91);
    expect(createHash('sha256').update(JSON.stringify(RULES)).digest('hex').slice(0, 16)).toBe('aa9ce35eaa06c114');
  });

  it('has one oasdiff id per rule and place, every id kebab-case', () => {
    expect(new Set(RULES.map(([rule, locus]) => `${rule}@${locus}`)).size).toBe(RULES.length);
    for (const [, , id] of RULES) expect(id).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it.each(RULES.map(([rule, locus, id]) => [rule, locus, id] as const))('%s in a %s is oasdiff %s', (rule, locus, id) => {
    const direction = locus.startsWith('response') ? 'response' : 'request';
    const payload = { operation: undefined, 'request-parameter': 'param:query:q', 'request-body': 'body:application/json', 'request-property': 'body:application/json', 'response-body': 'response:200:application/json', 'response-property': 'response:200:application/json' }[locus];
    const pointer = locus.endsWith('property') ? '/properties/a' : '';
    expect(ruleId(rule, direction, payload, pointer)).toEqual({ id, scheme: 'oasdiff' });
  });
});

describe('locusOf', () => {
  it.each([
    ['request', undefined, '', 'operation'],
    ['response', undefined, '', 'operation'],
    ['request', 'param:query:q', '/enum', 'request-parameter'],
    ['request', 'body:application/json', '', 'request-body'],
    ['request', 'body:application/json', '/properties/a', 'request-property'],
    ['response', 'response:200:application/json', '', 'response-body'],
    ['response', 'response:200:application/json', '/items', 'response-property'],
    ['publish', 'message', '', undefined],
    ['tool-call', 'arguments', '/properties/a', undefined],
  ] as const)('a %s change to %s at %j is in %s', (direction, payload, pointer, locus) => {
    expect(locusOf(direction, payload, pointer)).toBe(locus);
  });
});

describe('ruleId', () => {
  it('falls back to ours, ac-prefixed, where oasdiff has no id', () => {
    expect(ruleId('keyword-changed', 'request', 'body:application/json', '/multipleOf')).toEqual({ id: 'ac-keyword-changed', scheme: 'apicontract' });
    expect(ruleId('enum-value-removed', 'response', 'response:200:application/json', '')).toEqual({ id: 'ac-enum-value-removed', scheme: 'apicontract' });
  });

  it('gives a non-HTTP payload ours even where the change has an oasdiff id over HTTP', () => {
    expect(ruleId('type-narrowed', 'tool-call', 'arguments', '')).toEqual({ id: 'ac-type-narrowed', scheme: 'apicontract' });
    expect(ruleId('operation-removed', 'tool-call', undefined, '')).toEqual({ id: 'ac-operation-removed', scheme: 'apicontract' });
  });
});
