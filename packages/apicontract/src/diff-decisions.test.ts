import { readFileSync } from 'node:fs';

import { parse } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { compareContracts, type Finding } from './diff-contract.js';
import { checkDecisions, decisionsOf, isDate, keyOf, readDecisions } from './diff-decisions.js';
import { read as readJsonSchema } from './input-jsonschema.js';
import { read } from './openapi.js';

const fixture = (name: string): Contract => read(parse(readFileSync(new URL(`__fixtures__/diff-decisions/${name}.yaml`, import.meta.url), 'utf8')));

const BODY = 'response:200:application/json';

/** The problems a contract's markers have, as [id, where it is] rows. */
const problems = (name: string) =>
  readDecisions(fixture(name)).problems.map((finding) => [finding.id, finding.source, finding.payload ?? '', finding.pointer, finding.before, finding.after]);

describe('decisionsOf (R1, R2)', () => {
  it('reads a marker on a schema member, an operation and a parameter, and nothing off the three', () => {
    const decisions = decisionsOf(fixture('placed'));
    expect([...decisions.keys()].sort()).toEqual(
      [keyOf('getBalance', '', ''), keyOf('getBalance', BODY, '/properties/amount'), keyOf('getBalance', 'param:query:limit', '')].sort(),
    );
    expect(decisions.get(keyOf('getBalance', BODY, '/properties/amount'))).toStrictEqual({
      change: 'ADR-1',
      operation: 'getBalance',
      payload: BODY,
      pointer: '/properties/amount',
    });
    expect(decisions.get(keyOf('getBalance', '', ''))).toMatchObject({
      change: 'ADR-2',
    });
    expect(decisions.get(keyOf('getBalance', 'param:query:limit', ''))).toMatchObject({ change: 'ADR-3' });
    expect(readDecisions(fixture('placed')).problems).toEqual([]);
  });

  it('reads deprecated, x-sunset and x-replaced-by beside x-change', () => {
    const decision = decisionsOf(fixture('replacement-missing')).get(keyOf('getBalance', BODY, '/properties/amount'));
    expect(decision).toStrictEqual({
      deprecated: true,
      sunset: '2027-03-01',
      replacedBy: 'amountCents',
      operation: 'getBalance',
      payload: BODY,
      pointer: '/properties/amount',
    });
  });

  it('knows every member it walked, marked or not', () => {
    const { members } = readDecisions(fixture('base'));
    expect(members.has(keyOf('getBalance', BODY, '/properties/note'))).toBe(true);
    expect(members.has(keyOf('getBalance', BODY, ''))).toBe(true);
    expect(members.has(keyOf('getBalance', '', ''))).toBe(true);
    expect(members.has(keyOf('getBalance', BODY, '/properties/missing'))).toBe(false);
  });

  it('reads a marker in an allOf branch where it is and as merged into its parent, and through a $ref cycle', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/a': {
          get: {
            operationId: 'a',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Node' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Node: {
            allOf: [
              {
                properties: {
                  next: { $ref: '#/components/schemas/Node' },
                  id: { 'x-change': 'ADR-5' },
                },
              },
            ],
          },
        },
      },
    };
    const keys = [...decisionsOf(read(document)).keys()];
    expect(keys).toContain(keyOf('a', 'response:200:application/json', '/properties/id'));
    expect(keys).toContain(keyOf('a', 'response:200:application/json', '/allOf/0/properties/id'));
  });

  it('puts a marker on a JSON Schema event at its root, where the operation and the payload are the same document', () => {
    const event = readJsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'gift_sent',
      type: 'object',
      'x-change': 'ADR-12',
      properties: { giftId: { 'x-sunset': '2027-03-01' } },
    });
    expect([...decisionsOf(event).keys()].sort()).toEqual([keyOf('gift_sent', '', ''), keyOf('gift_sent', 'value', ''), keyOf('gift_sent', 'value', '/properties/giftId')].sort());
    expect(readDecisions(event).problems).toEqual([]);
  });
});

describe('a marker off its positions is decision-misplaced (R2)', () => {
  it('on info, where it describes no member', () => {
    expect(problems('misplaced')).toEqual([['ac-decision-misplaced', '#/info', '', '', 'x-change', 'ADR-1']]);
  });

  it('but not inside an example or a default, which are data', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/a': {
          get: {
            operationId: 'a',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      example: { 'x-change': 'ADR-1' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(readDecisions(read(document)).problems).toEqual([]);
  });

  it('says where to move it', () => {
    expect(readDecisions(fixture('misplaced')).problems[0]?.fix).toBe(
      '`x-change` at #/info is not on a schema member, an operation or a parameter. fix: move it onto the member it describes, or remove it',
    );
  });
});

describe('a near-miss spelling is decision-misspelled (R3)', () => {
  it('names the right marker, and ignores other x- keys', () => {
    expect(problems('misspelled')).toEqual([
      ['ac-decision-misspelled', '#/components/schemas/Balance/properties/amount', '', '', 'x-sunst', 'x-sunset'],
      ['ac-decision-misspelled', '#/components/schemas/Balance/properties/currency', '', '', 'x-chnage', 'x-change'],
    ]);
    expect(readDecisions(fixture('misspelled')).problems.map((finding) => finding.fix)).toEqual([
      '`x-sunst` at #/components/schemas/Balance/properties/amount is not a marker. fix: rename it `x-sunset`',
      '`x-chnage` at #/components/schemas/Balance/properties/currency is not a marker. fix: rename it `x-change`',
    ]);
  });

  it('is reported at the level it is asked at, and no marker is read from the misspelled key', () => {
    expect(readDecisions(fixture('misspelled'), 'error').problems.every((finding) => finding.verdict === 'breaking')).toBe(true);
    expect(readDecisions(fixture('misspelled')).problems.every((finding) => finding.verdict === 'unknown')).toBe(true);
    expect(decisionsOf(fixture('misspelled')).size).toBe(0);
  });
});

describe('a bad value is decision-invalid (R4)', () => {
  it('for an empty x-change, an impossible date and a replacement that is neither a name nor a pointer', () => {
    expect(problems('invalid')).toEqual([
      ['ac-decision-invalid', '#/paths/~1v3~1wallet/get', BODY, '/properties/amount', '2027-02-30', undefined],
      ['ac-decision-invalid', '#/paths/~1v3~1wallet/get', BODY, '/properties/amount', 'a/b', undefined],
      ['ac-decision-invalid', '#/paths/~1v3~1wallet/get', BODY, '/properties/currency', '', undefined],
    ]);
    expect(readDecisions(fixture('invalid')).problems.map((finding) => finding.fix)).toEqual([
      'getBalance response:200:application/json /properties/amount has a bad `x-sunset`. fix: write `x-sunset: 2027-03-01`: a real date as YYYY-MM-DD',
      "getBalance response:200:application/json /properties/amount has a bad `x-replaced-by`. fix: write `x-replaced-by:` as a sibling member's name (`amountCents`) or a JSON Pointer to one (`/properties/amountCents`)",
      'getBalance response:200:application/json /properties/currency has a bad `x-change`. fix: write `x-change: <the decision>`: an ADR id, a ticket or a URL, as non-empty text',
    ]);
    expect(decisionsOf(fixture('invalid')).size).toBe(0);
  });

  it('accepts a date that exists, and refuses what is not one', () => {
    expect(['2027-03-01', '2028-02-29'].every((value) => isDate(value))).toBe(true);
    expect(['2027-02-29', '2027-13-01', '2027-3-1', '2027-03-01T00:00', 2027, undefined, '0000-00-00'].some((value) => isDate(value))).toBe(false);
  });

  it('accepts a sibling name and a JSON Pointer, and a ticket of any shape', () => {
    const document = {
      openapi: '3.1.0',
      paths: {
        '/a': {
          get: {
            operationId: 'a',
            'x-change': 'https://example.com/adr/91',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      properties: {
                        x: { 'x-replaced-by': '/properties/a~1b' },
                        y: { 'x-replaced-by': 'z' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    expect(readDecisions(read(document)).problems).toEqual([]);
  });
});

const compare = (before: string, after: string, today = '2027-01-01', level: 'warn' | 'error' = 'warn') => {
  const [old, nu] = [fixture(before), fixture(after)];
  return checkDecisions(old, nu, compareContracts(old, nu), { today, level });
};

/** [id, payload, pointer] of each decision finding. */
const rows = (findings: readonly Finding[]) => findings.map((finding) => [finding.id, finding.payload ?? '', finding.pointer]);

describe('a breaking change needs a decision (R5)', () => {
  it('fails without one: the enum value ILS was added to a response, and nobody wrote down why', () => {
    const findings = compare('base', 'undecided');
    expect(rows(findings)).toEqual([['ac-decision-missing', BODY, '/properties/currency']]);
    expect(findings[0]).toMatchObject({
      verdict: 'unknown',
      scheme: 'apicontract',
      operation: 'getBalance',
      source: '#/paths/~1v3~1wallet/get',
      document: 'new',
      before: undefined,
      after: 'ILS',
      fix: 'breaking change (`response-property-enum-value-added`) at getBalance response:200:application/json /properties/currency with no decision. fix: add `x-change: <the decision>` to getBalance response:200:application/json /properties/currency, or an ancestor or its operation, naming who decided it; or revert the change',
    });
  });

  it('passes with an x-change on the member', () => {
    expect(compare('base', 'decided')).toEqual([]);
  });

  it('passes with an x-change on an ancestor, up to the payload root', () => {
    expect(compare('base', 'decided-above')).toEqual([]);
  });

  it('passes with an x-change on the operation', () => {
    const [old, nu] = [fixture('base'), fixture('undecided')];
    const document = structuredClone(nu.document) as { paths: Record<string, { get: Record<string, unknown> }> };
    (document.paths['/v3/wallet'] as { get: Record<string, unknown> }).get['x-change'] = 'ADR-1';
    expect(checkDecisions(old, read(document), compareContracts(old, read(document)), { today: '2027-01-01', level: 'warn' })).toEqual([]);
  });

  it('is graded at the level it is asked at', () => {
    expect(compare('base', 'undecided', '2027-01-01', 'error')[0]?.verdict).toBe('breaking');
  });

  it('holds a removal to the old side, which has no member on the new one to carry a marker', () => {
    expect(rows(compare('base', 'removed'))).toEqual([['ac-decision-missing', BODY, '/properties/amount']]);
  });
});

describe('a removal on schedule needs no new marker (R8)', () => {
  it('passes when the old member was deprecated and its sunset is on or before today', () => {
    expect(compare('sunsetting', 'removed', '2027-03-01')).toEqual([]);
    expect(compare('sunsetting', 'removed', '2027-04-01')).toEqual([]);
  });

  it('fails before the sunset date, and when the old member was never deprecated', () => {
    expect(rows(compare('sunsetting', 'removed', '2027-02-28'))).toEqual([['ac-decision-missing', BODY, '/properties/amount']]);
    expect(rows(compare('base', 'removed', '2027-04-01'))).toEqual([['ac-decision-missing', BODY, '/properties/amount']]);
  });
});
