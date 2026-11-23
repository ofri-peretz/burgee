import { describe, expect, it } from 'vitest';

import { type Contract, type Operation } from './core/model.js';
import { compareContracts } from './diff-contract.js';
import { compareSecurity, securityOf } from './diff-security.js';

const OP: Operation = { id: 'g', source: '#/paths/~1a/get', payloads: [] };

/** A one-operation contract: `own` is the operation's `security`, `root` the document's; `undefined` leaves it out. */
const side = (own: unknown, root?: unknown, format = 'openapi'): Contract => ({
  format,
  document: { ...(root === undefined ? {} : { security: root }), paths: { '/a': { get: own === undefined ? {} : { security: own } } } },
  operations: [OP],
});

const change = (old: Contract, nu: Contract) => compareSecurity(old, nu, OP, OP);
const rule = (old: Contract, nu: Contract) => change(old, nu)?.rule;

describe('the security an operation asks for', () => {
  it('reads the operation own list, else the document one, else none', () => {
    expect(securityOf(side([{ a: [] }], [{ b: [] }]), OP)).toEqual([{ a: [] }]);
    expect(securityOf(side(undefined, [{ b: [] }]), OP)).toEqual([{ b: [] }]);
    expect(securityOf(side([], [{ b: [] }]), OP)).toEqual([]);
    expect(securityOf(side(undefined), OP)).toEqual([]);
    expect(securityOf(side('x', 'y'), OP)).toEqual([]);
    expect(securityOf({ format: 'openapi', document: null, operations: [] }, { ...OP, source: '#/nowhere' })).toEqual([]);
  });

  it('turns callers away when it asks for credentials it did not, or other ones', () => {
    expect(change(side(undefined), side([{ key: [] }]))).toEqual({ rule: 'security-narrowed', before: [], after: [{ key: [] }], effect: 'narrows' });
    // Inherited from the document, and an operation that opts out with [] lets everyone in again.
    expect(rule(side(undefined), side(undefined, [{ key: [] }]))).toBe('security-narrowed');
    expect(rule(side([], [{ key: [] }]), side(undefined, [{ key: [] }]))).toBe('security-narrowed');
    expect(rule(side([{ key: [] }]), side([{ token: [] }]))).toBe('security-narrowed');
    expect(rule(side([{ key: [] }]), side([{ key: [], token: [] }]))).toBe('security-narrowed');
    expect(rule(side([{ key: [] }, { token: [] }]), side([{ token: [] }]))).toBe('security-narrowed');
    expect(rule(side([{ oauth: ['read'] }]), side([{ oauth: ['read', 'write'] }]))).toBe('security-narrowed');
  });

  it('lets more callers in when it asks for less, and says nothing when every caller still gets in', () => {
    expect(change(side([{ key: [] }]), side([]))).toEqual({ rule: 'security-widened', before: [{ key: [] }], after: [], effect: 'widens' });
    expect(rule(side([{ key: [], token: [] }]), side([{ key: [] }]))).toBe('security-widened');
    expect(rule(side([{ key: [] }]), side([{ key: [] }, { token: [] }]))).toBe('security-widened');
    expect(rule(side([{ oauth: ['read', 'write'] }]), side([{ oauth: ['read'] }]))).toBe('security-widened');
    expect(rule(side([{ key: [] }]), side(undefined, [{ key: [] }]))).toBeUndefined();
    expect(rule(side([{ oauth: ['b', 'a'] }]), side([{ oauth: ['a', 'b'] }]))).toBeUndefined();
    // An alternative that is not an object asks for nothing; scopes that are not a list ask for none.
    expect(rule(side(['x']), side([{}]))).toBeUndefined();
    expect(rule(side([{ key: 'x' }]), side([{ key: [] }]))).toBeUndefined();
  });

  it('is read for OpenAPI and Swagger 2.0 only', () => {
    expect(rule(side(undefined, undefined, 'swagger2'), side([{ key: [] }], undefined, 'swagger2'))).toBe('security-narrowed');
    expect(rule(side(undefined, undefined, 'asyncapi'), side([{ key: [] }]))).toBeUndefined();
    expect(rule(side(undefined), side([{ key: [] }], undefined, 'asyncapi'))).toBeUndefined();
  });

  it('reports a requirement added as breaking for a caller, with a fix, and one dropped as not', () => {
    const [added] = compareContracts(side(undefined), side([{ key: [] }])).findings;
    expect(added).toMatchObject({ id: 'ac-security-narrowed', verdict: 'breaking', operation: 'g', direction: 'request', pointer: '', fix: 'keep letting into g every caller the old security requirement let in, or release this as a major version' });
    expect(compareContracts(side([{ key: [] }]), side(undefined)).findings.map((finding) => [finding.id, finding.verdict])).toEqual([['ac-security-widened', 'non-breaking']]);
  });
});
