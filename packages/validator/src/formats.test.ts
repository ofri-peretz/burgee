import { isIPv4, isIPv6 } from 'node:net';

import { describe, expect, it } from 'vitest';

import { verdict } from './__fixtures__/readers.js';
import { emit, emitWith } from './emit.js';
import { base64, date, datetime, email, httpUrl, ipv4, ipv6, url, uuid } from './formats.js';
import { check, date as dateSchema, type Format, issues, parse, string } from './index.js';

/**
 * Wave 2, group 6: the built-in formats. Each table is what the format says of the values the
 * five libraries split on (benchmarks/results/validator/parity-2026-11-13/semantics.md §7 to §10)
 * and of the edges of its own reference, with the reason beside each verdict. They are ours to
 * state: the libraries agree on almost none of them.
 */

type Row = [value: string, accepted: boolean, why: string];

/** Holds a format to a table, through every reader. */
const holds = (format: Format, rows: readonly Row[]): void => {
  const schema = string({ format });
  for (const [value, accepted, why] of rows) expect(verdict(schema, value), `${JSON.stringify(value)}: ${why}`).toBe(accepted);
};

/** What a format says of each value, asked of the format alone. */
const says = (format: { readonly pattern: RegExp }, values: readonly string[]): boolean[] => values.map((value) => format.pattern.test(value));

const LONG = 50_000;
/** Generous for a machine under load: a pattern that backtracks takes minutes on these, a linear one a millisecond. */
const BOUND_MS = 2000;

/** Strings made to make a careless pattern backtrack: long runs of what each format repeats, ending in what it refuses. */
const HOSTILE: string[] = [
  'a'.repeat(LONG + 1),
  `${'a'.repeat(LONG)}!`,
  `a@${'a'.repeat(LONG)}`,
  `a@${'a.'.repeat(LONG / 2)}`,
  `a@${'a-'.repeat(LONG / 2)}`,
  `${'a.'.repeat(LONG / 2)}@`,
  `${'!'.repeat(LONG)}@`,
  '1'.repeat(LONG + 1),
  '1.'.repeat(LONG / 2),
  ':'.repeat(LONG),
  '1:'.repeat(LONG / 2),
  `::${'1:'.repeat(LONG / 2)}`,
  'f'.repeat(LONG + 1),
  `${'f'.repeat(LONG)}-`,
  '0-'.repeat(LONG / 2),
  `${'A'.repeat(LONG)}=`,
  `${'AAAA'.repeat(LONG / 4)}!`,
  '='.repeat(LONG),
  `2020-01-01T00:00:00.${'0'.repeat(LONG)}`,
  `2020-01-01T00:00:00.${'0'.repeat(LONG)}z!`,
  `${'2020-'.repeat(LONG / 5)}`,
  `https://${'a'.repeat(LONG)} `,
  `${' '.repeat(LONG)}https://a`,
  `https:${'/'.repeat(LONG)}`,
];

const ALL: [string, Format][] = [
  ['date', date],
  ['date-time', datetime],
  ['email', email],
  ['uuid', uuid],
  ['ipv4', ipv4],
  ['ipv6', ipv6],
  ['base64', base64],
  ['url', url],
  ['http-url', httpUrl],
];

describe('the built-in formats', () => {
  it.each(ALL)('%s is data: a frozen name and a pattern, or a test', (name, format) => {
    expect(format.name).toBe(name);
    expect(Object.isFrozen(format)).toBe(true);
    expect('pattern' in format ? format.pattern instanceof RegExp : typeof format.test).toBe('pattern' in format ? true : 'function');
    expect(string({ format }).rule?.name).toBe(name);
  });

  it.each(ALL)('%s decides each of 24 hostile strings of some 50,000 characters in time proportional to its length', (_, format) => {
    const schema = string({ format });
    const started = performance.now();
    for (const text of HOSTILE) expect(check(schema, text)).toBe(false);
    expect(performance.now() - started).toBeLessThan(BOUND_MS);
  });

  it('are patterns, which the emitter writes as text, but for the two that ask the URL parser', () => {
    for (const format of [date, datetime, email, uuid, ipv4, ipv6, base64]) {
      expect(emit(string({ format }))).toContain('new RegExp(');
      expect(format.pattern.flags).toBe('u');
    }
    for (const format of [url, httpUrl]) {
      expect(() => emit(string({ format }))).toThrow('cannot emit a schema that names a function as text alone');
      expect(emitWith(string({ format })).hooks).toEqual([format.test]);
    }
  });

  it('report under the keyword format, by name', () => {
    expect(issues(string({ format: email }), 'nope')).toEqual([{ path: '', keyword: 'format', message: 'expected a string in the format email, got string "nope". fix: send one in the format email' }]);
    expect(issues(string({ format: datetime }), '2020')[0]?.message).toBe('expected a string in the format date-time, got string "2020". fix: send one in the format date-time');
  });
});

describe('email: the WHATWG HTML standard, "valid email address" (§4.10.5.1.5)', () => {
  const LABEL = 'a'.repeat(63);

  it('fmt.email: accepts a@b.co and refuses not-an-email', () => {
    holds(email, [
      ['a@b.co', true, 'the plain form'],
      ['not-an-email', false, 'no @'],
    ]);
  });

  it('says of each value the libraries split on', () => {
    holds(email, [
      ['A@B.CO', true, 'case is not looked at'],
      ['a+tag@b.co', true, 'a plus is an atext character'],
      ['a@b', true, 'the standard asks for no dot in the domain; zod, valibot, arktype and ajv refuse'],
      ['a@localhost', true, 'the same'],
      ['a@b.c', true, 'a label of one letter; only ajv of the four agrees'],
      ['a..b@c.co', true, 'the standard allows a dot anywhere in the local part; only arktype agrees'],
      ['.a@b.co', true, 'the same'],
      ['a.@b.co', true, 'the same'],
      ["o'neil@b.co", true, 'an apostrophe is an atext character; zod and ajv agree'],
      ['a@-b.co', false, 'a label starts with a letter or a digit'],
      ['a@b-.co', false, 'and ends with one'],
      ['a@b.co.', false, 'no empty last label'],
      ['a@b..co', false, 'no empty label'],
      ['a@.b', false, 'no empty first label'],
      [' a@b.co', false, 'a space is no part of an address'],
      ['a@b.co ', false, 'the same'],
      ['a b@c.co', false, 'the same'],
      ['a@b.co\n', false, 'nor a line break after it'],
      ['ü@b.co', false, 'ASCII only: an internationalised address is another format'],
      ['a@bücher.de', false, 'the same, for the domain'],
      ['"a b"@c.co', false, 'no quoted local part: the wilful violation of RFC 5322'],
      ['a@[127.0.0.1]', false, 'no address literal'],
      ['a(comment)@b.co', false, 'no comment'],
    ]);
  });

  it('says of the edges of the grammar', () => {
    holds(email, [
      ["a.!#$%&'*+/=?^_`{|}~-@b", true, 'every character the local part may hold'],
      ['@b.co', false, 'an empty local part'],
      ['a@', false, 'an empty domain'],
      ['a@@b.co', false, 'two @'],
      ['a@b@c', false, 'two @'],
      ['a,b@c.co', false, 'a comma is no atext character'],
      ['a@b_c.co', false, 'an underscore is no part of a label'],
      ['a@b.c-d', true, 'a hyphen inside a label'],
      ['a@1.2', true, 'a label of digits'],
      ['a@a-b-c.d--e', true, 'hyphens inside labels, doubled too'],
      [`a@${LABEL}`, true, 'a label of 63 characters'],
      [`a@${LABEL}a`, false, 'a label of 64'],
      [`a@b.${LABEL}.c`, true, 'a later label of 63'],
      [`a@b.${LABEL}a.c`, false, 'a later label of 64'],
      [`a@${'a'.repeat(62)}-`, false, 'a label of 63 that ends in a hyphen'],
      ['a@a', true, 'a label of one'],
      ['a@ab', true, 'a label of two'],
      ['a@-', false, 'a label that is only a hyphen'],
      ['', false, 'nothing'],
    ]);
  });
});

describe('uuid: RFC 9562, with the version and the variant it defines', () => {
  const V4 = '550e8400-e29b-41d4-a716-446655440000';

  it('fmt.uuid: accepts a canonical version 4 UUID and refuses one of 35 characters', () => {
    holds(uuid, [
      [V4, true, 'version 4, variant a'],
      [V4.slice(1), false, '35 characters'],
    ]);
  });

  it('says of each value the libraries split on', () => {
    holds(uuid, [
      ['550E8400-E29B-41D4-A716-446655440000', true, 'upper case: the text form is read in either'],
      ['550e8400-e29b-11d4-a716-446655440000', true, 'version 1'],
      ['018f4b3c-6f7a-7abc-8def-0123456789ab', true, 'version 7'],
      ['00000000-0000-0000-0000-000000000000', true, 'the Nil UUID, §5.9'],
      ['ffffffff-ffff-ffff-ffff-ffffffffffff', true, 'the Max UUID, §5.10'],
      ['550e8400-e29b-01d4-a716-446655440000', false, 'version 0 is not defined; valibot and ajv accept any nibble'],
      ['550e8400-e29b-91d4-a716-446655440000', false, 'version 9 is not defined'],
      ['550e8400-e29b-41d4-c716-446655440000', false, 'variant c is Microsoft’s, not this RFC’s'],
      ['550e8400e29b41d4a716446655440000', false, 'no hyphens'],
      ['{550e8400-e29b-41d4-a716-446655440000}', false, 'braces'],
      ['urn:uuid:550e8400-e29b-41d4-a716-446655440000', false, 'a URN is another thing; only ajv accepts'],
      ['50e8400-e29b-41d4-a716-446655440000', false, 'a first group of seven'],
    ]);
  });

  it('says of every version and variant nibble, and of the edges of the form', () => {
    const versions = [...'0123456789abcdefABCDEF'].map((nibble) => `550e8400-e29b-${nibble}1d4-a716-446655440000`);
    expect(says(uuid, versions)).toEqual([...'0123456789abcdefABCDEF'].map((nibble) => '12345678'.includes(nibble)));
    const variants = [...'0123456789abcdefABCDEF'].map((nibble) => `550e8400-e29b-41d4-${nibble}716-446655440000`);
    expect(says(uuid, variants)).toEqual([...'0123456789abcdefABCDEF'].map((nibble) => '89abAB'.includes(nibble)));
    holds(uuid, [
      ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', true, 'the Max UUID in upper case'],
      ['FFFFFFFF-ffff-FFFF-ffff-FFFFffffFFFF', true, 'and in both'],
      ['00000000-0000-0000-0000-000000000001', false, 'not Nil, and of no version'],
      ['ffffffff-ffff-ffff-ffff-fffffffffffe', false, 'not Max, and of no version'],
      ['0000000-0000-0000-0000-000000000000', false, 'Nil with a group short'],
      ['00000000-000-0000-0000-000000000000', false, 'the same, the second group'],
      ['00000000-0000-000-0000-000000000000', false, 'the third'],
      ['00000000-0000-0000-000-000000000000', false, 'the fourth'],
      ['00000000-0000-0000-0000-00000000000', false, 'the fifth'],
      ['fffffff-ffff-ffff-ffff-ffffffffffff', false, 'Max with a group short'],
      ['ffffffff-fff-ffff-ffff-ffffffffffff', false, 'the second group'],
      ['ffffffff-ffff-fff-ffff-ffffffffffff', false, 'the third'],
      ['ffffffff-ffff-ffff-fff-ffffffffffff', false, 'the fourth'],
      ['ffffffff-ffff-ffff-ffff-fffffffffff', false, 'the fifth'],
      ['550e8400-e29b-41d4-a716-44665544000', false, 'a last group of eleven'],
      ['550e8400-e29b-41d4-a716-4466554400000', false, 'a last group of thirteen'],
      ['550e8400-e29-41d4-a716-446655440000', false, 'a second group of three'],
      ['550e8400-e29b-41d-a716-446655440000', false, 'a third group of three'],
      ['550e8400-e29b-41d4-a71-446655440000', false, 'a fourth group of three'],
      ['g50e8400-e29b-41d4-a716-446655440000', false, 'a letter that is no hex digit, in the first group'],
      ['550e8400-g29b-41d4-a716-446655440000', false, 'in the second'],
      ['550e8400-e29b-41g4-a716-446655440000', false, 'in the third'],
      ['550e8400-e29b-41d4-a71g-446655440000', false, 'in the fourth'],
      ['550e8400-e29b-41d4-a716-44665544000g', false, 'in the fifth'],
      [`x${V4}`, false, 'something before it'],
      [`${V4}x`, false, 'something after it'],
      [`${V4}\n`, false, 'a line break after it'],
      ['x00000000-0000-0000-0000-000000000000', false, 'something before Nil'],
      ['ffffffff-ffff-ffff-ffff-ffffffffffffx', false, 'something after Max'],
      ['', false, 'nothing'],
    ]);
  });
});

const OCTETS = ['0', '9', '10', '99', '100', '199', '200', '249', '250', '255', '256', '260', '300', '999', '00', '01', '010', '1000', '', 'a', '-1', '1a', ' 1'];

describe('ipv4: RFC 3986 §3.2.2, four decimal octets with no leading zero', () => {
  it('fmt.ipv4: accepts 192.168.0.1 and refuses 256.1.1.1', () => {
    holds(ipv4, [
      ['192.168.0.1', true, 'four octets'],
      ['256.1.1.1', false, 'an octet above 255'],
    ]);
  });

  it('says of the edges of the grammar', () => {
    holds(ipv4, [
      ['0.0.0.0', true, 'the lowest'],
      ['255.255.255.255', true, 'the highest'],
      ['249.250.199.200', true, 'an octet from each range'],
      ['1.2.3', false, 'three octets'],
      ['1.2.3.4.5', false, 'five'],
      ['01.2.3.4', false, 'a leading zero, which some parsers read as octal'],
      ['1.2.3.04', false, 'the same, in the last octet'],
      ['1..3.4', false, 'an empty octet'],
      ['1.2.3.', false, 'a dot and no octet'],
      ['.1.2.3', false, 'the same, in front'],
      ['1.2.3.4 ', false, 'a space after it'],
      [' 1.2.3.4', false, 'a space before it'],
      ['1.2.3.4\n', false, 'a line break after it'],
      ['x1.2.3.4', false, 'something before it'],
      ['1.2.3.4x', false, 'something after it'],
      ['1,2,3,4', false, 'commas'],
      ['a.b.c.d', false, 'letters'],
      ['0x7f.0.0.1', false, 'hex'],
      ['2130706433', false, 'one number'],
      ['::1', false, 'an IPv6 address'],
      ['', false, 'nothing'],
    ]);
  });

  it('agrees with the platform’s own reader on every octet, at every place', () => {
    let accepted = 0;
    for (const place of [0, 1, 2, 3]) {
      for (const octet of OCTETS) {
        const text = [1, 2, 3, 4].map((other, index) => (index === place ? octet : String(other))).join('.');
        expect(ipv4.pattern.test(text), text).toBe(isIPv4(text));
        if (isIPv4(text)) accepted += 1;
      }
    }
    expect(accepted).toBe(40);
  });
});

/** Each of the grammar's alternatives that ends in an IPv4 address, by how many groups stand between `::` and it. */
const BEFORE_V4 = ['1:2:3:4:5:6:', '::2:3:4:5:6:', '::3:4:5:6:', '1::3:4:5:6:', '::4:5:6:', '1:2::4:5:6:', '::5:6:', '1:2:3::5:6:', '::6:', '1:2:3:4::6:', '::', '1:2:3:4:5::'];
const GROUPS = ['0', 'f', 'F', 'ffff', 'FFFF', 'aB09', 'fffff', '00000', 'g', '', '1.2.3.4', '-1', ' 1'];
const WHOLE = ['1:2:3:4:5:6:7:8', '::2:3:4:5:6:7:8', '1::3:4:5:6:7:8', '1:2::4:5:6:7:8', '1:2:3::5:6:7:8', '1:2:3:4::6:7:8', '1:2:3:4:5::7:8', '1:2:3:4:5:6::8', '1:2:3:4:5:6:7::', '::8', '1::', '::7:8', '1:2::', '1::8', '1:2:3::8', '1::6:7:8', '1:2:3:4:5:6:1.2.3.4', '1::5:6:1.2.3.4'];

/** `before` groups and then `after` groups, written each way: in full or around a run, and ending in a group or in an IPv4 address. */
const written = (before: number, after: number): string[] => {
  const left = Array.from({ length: before }, () => 'a');
  return [[], ['1.2.3.4']].flatMap((last) => {
    const right = [...Array.from({ length: after }, () => 'B'), ...last];
    return [[...left, ...right].join(':'), `${left.join(':')}::${right.join(':')}`];
  });
};

describe('ipv6: RFC 3986 §3.2.2 `IPv6address`, the text form of RFC 4291 §2.2', () => {
  it('fmt.ipv6: accepts ::1 and refuses 192.168.0.1', () => {
    holds(ipv6, [
      ['::1', true, 'loopback'],
      ['192.168.0.1', false, 'an IPv4 address'],
    ]);
  });

  it('says of the forms an address is written in', () => {
    holds(ipv6, [
      ['::', true, 'the unspecified address'],
      ['2001:db8::1', true, 'one run of zeros, shortened'],
      ['2001:0db8:85a3:0000:0000:8a2e:0370:7334', true, 'eight groups in full'],
      ['2001:DB8::1', true, 'upper case'],
      ['::ffff:192.168.0.1', true, 'an IPv4 address as the last two groups'],
      ['64:ff9b::192.0.2.33', true, 'the same, after a prefix'],
      ['1:2:3:4:5:6:1.2.3.4', true, 'six groups and an IPv4 address'],
      ['1:2:3:4:5:6:7:1.2.3.4', false, 'seven groups and an IPv4 address: ten in all'],
      ['1.2.3.4::', false, 'an IPv4 address anywhere but last'],
      ['1:2:3:4:5:6:7', false, 'seven groups'],
      ['1:2:3:4:5:6:7:8:9', false, 'nine'],
      ['1::2::3', false, 'two runs shortened: which is how long is not known'],
      [':::1', false, 'three colons'],
      ['1:2:3:4:5:6:7:8::', false, 'eight groups and a run of none'],
      ['fe80::1%eth0', false, 'a zone, which is no part of the address'],
      ['[::1]', false, 'brackets, which belong to a URL'],
      ['12345::', false, 'a group of five digits'],
      ['g::', false, 'a letter that is no hex digit'],
      ['::256.1.1.1', false, 'an IPv4 address with an octet above 255'],
      ['::01.1.1.1', false, 'or with a leading zero'],
      ['::1 ', false, 'a space after it'],
      [' ::1', false, 'a space before it'],
      ['::1\n', false, 'a line break after it'],
      ['x::1', false, 'something before it'],
      ['::1x', false, 'something after it'],
      ['x1:2:3:4:5:6:7:8', false, 'something before eight groups'],
      [':', false, 'one colon'],
      ['1:', false, 'a group and a colon'],
      [':1', false, 'a colon and a group'],
      ['', false, 'nothing'],
    ]);
  });

  it('agrees with the platform’s own reader on every count of groups before and after a run, with and without an IPv4 address', () => {
    let accepted = 0;
    for (let before = 0; before <= 9; before++) {
      for (let after = 0; after <= 9; after++) {
        for (const text of written(before, after)) {
          expect(ipv6.pattern.test(text), text).toBe(isIPv6(text));
          if (isIPv6(text)) accepted += 1;
        }
      }
    }
    expect(accepted).toBe(73);
  });

  it('agrees with it on every group, at every place, in every alternative of the grammar', () => {
    let asked = 0;
    for (const whole of WHOLE) {
      const groups = whole.split(':');
      for (const place of groups.keys()) {
        for (const group of GROUPS) {
          const text = groups.map((other, index) => (index === place ? group : other)).join(':');
          expect(ipv6.pattern.test(text), text).toBe(isIPv6(text));
          asked += 1;
        }
      }
    }
    expect(asked).toBe(1469);
  });

  it('agrees with it on every octet of the IPv4 address, at every place, in every alternative that has one', () => {
    let accepted = 0;
    for (const before of BEFORE_V4) {
      for (const place of [0, 1, 2, 3]) {
        for (const octet of OCTETS) {
          const text = before + [1, 2, 3, 4].map((other, index) => (index === place ? octet : String(other))).join('.');
          expect(ipv6.pattern.test(text), text).toBe(isIPv6(text));
          if (isIPv6(text)) accepted += 1;
        }
      }
    }
    expect(accepted).toBe(BEFORE_V4.length * 40);
  });
});

/** Whether the calendar has the day: the engine is asked, and must give back the day it was given. */
const isDay = (text: string): boolean => {
  const midnight = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(text);
};

const two = (count: number): string => String(count).padStart(2, '0');
const YEARS = ['0000', '0004', '0100', '0400', '1200', '1600', '1900', '1996', '2000', '2019', '2020', '2021', '2024', '2100', '2400', '2600', '9999'];

describe('date: RFC 3339 §5.6 `full-date`, on a day the calendar has (§5.7)', () => {
  it('says of the forms a date is written in', () => {
    holds(date, [
      ['2020-01-31', true, 'the form'],
      ['2020-1-31', false, 'a month of one digit'],
      ['2020-01-1', false, 'a day of one digit'],
      ['20-01-31', false, 'a year of two digits'],
      ['12020-01-31', false, 'a year of five'],
      ['20200131', false, 'the basic form, which RFC 3339 leaves out'],
      ['2020/01/31', false, 'slashes'],
      ['2020-01-31T00:00:00Z', false, 'a date-time'],
      [' 2020-01-31', false, 'a space before it'],
      ['2020-01-31 ', false, 'a space after it'],
      ['2020-01-31\n', false, 'a line break after it'],
      ['x2020-01-31', false, 'something before it'],
      ['2020-02-29', true, 'the 29th of February in a leap year'],
      ['2021-02-29', false, 'and in a year that is not one'],
      ['1900-02-29', false, 'a century year is a leap year only when 400 divides it'],
      ['2000-02-29', true, 'as it does 2000'],
      ['x2000-02-29', false, 'something before a leap day'],
      ['2000-02-29x', false, 'something after one'],
      ['2020-04-31', false, 'the 31st of a month of 30 days'],
      ['2020-13-01', false, 'no such month'],
      ['2020-00-01', false, 'no such month'],
      ['2020-01-00', false, 'no such day'],
      ['2020-01-32', false, 'no such day'],
      ['', false, 'nothing'],
    ]);
  });

  it('agrees with the calendar on every day of every month, 00 to 32 and 00 to 13, in 17 years that differ in their leap days', () => {
    let days = 0;
    for (const year of YEARS) {
      for (let month = 0; month <= 13; month++) {
        for (let day = 0; day <= 32; day++) {
          const text = `${year}-${two(month)}-${two(day)}`;
          expect(date.pattern.test(text), text).toBe(isDay(text));
          expect(datetime.pattern.test(`${text}T00:00:00Z`), text).toBe(isDay(text));
          if (isDay(text)) days += 1;
        }
      }
    }
    // Ten of the seventeen are leap years: 0000, 0004, 0400, 1200, 1600, 1996, 2000, 2020, 2024 and 2400.
    expect(days).toBe(17 * 365 + 10);
  });
});

describe('date-time: RFC 3339 §5.6 `date-time`', () => {
  it('fmt.datetime: accepts 2020-01-01T00:00:00Z and refuses 2020-01-01', () => {
    holds(datetime, [
      ['2020-01-01T00:00:00Z', true, 'the form'],
      ['2020-01-01', false, 'a date and no time'],
    ]);
  });

  it('says of each value the libraries split on', () => {
    holds(datetime, [
      ['2020-01-01T00:00:00.123Z', true, 'a fraction of a second'],
      ['2020-01-01T00:00:00.123456789Z', true, 'of any length'],
      ['2020-01-01T00:00:00+02:00', true, 'a numeric offset; zod refuses unless asked'],
      ['2020-01-01T00:00:00+0200', false, 'an offset without its colon: ISO 8601, not RFC 3339'],
      ['2020-01-01T00:00:00', false, 'no offset; arktype accepts'],
      ['2020-01-01T00:00Z', false, 'no seconds; arktype accepts'],
      ['2020-01-01 00:00:00Z', false, 'a space for the T: allowed to an application by the note in §5.6, and not in the grammar'],
      ['2020-01-01t00:00:00z', true, 'lower case, which the same note says the grammar reads; only ajv agrees'],
      ['2020-02-30T00:00:00Z', false, 'a day February does not have; valibot and arktype accept'],
      ['2020-01-01T24:00:00Z', false, 'no such hour'],
      ['2020-01-01T23:59:60Z', true, 'a leap second, written in UTC; only ajv agrees'],
      ['20200101T000000Z', false, 'the basic form'],
    ]);
  });

  it('says of the edges of the grammar', () => {
    holds(datetime, [
      ['1998-12-31T23:59:60Z', true, 'the leap second of 1998'],
      ['1998-12-31T23:59:60.5z', true, 'with a fraction, lower case'],
      ['1998-12-31T23:59:60.123456Z', true, 'with a fraction of any length'],
      ['1998-12-31T23:59:60+00:00', true, 'at an offset of zero'],
      ['1998-12-31T23:59:60-00:00', true, 'the same, unknown local offset'],
      ['1998-12-31T15:59:60-08:00', false, 'the same instant at another offset: a pattern cannot work out the minute, so it is refused'],
      ['1998-12-31T23:59:60+01:00', false, 'a 60th second at an offset that is not zero'],
      ['1998-12-31T23:59:60+00:01', false, 'the same'],
      ['1998-12-31T23:58:60Z', false, 'a 60th second in a minute that is not the last'],
      ['1998-12-31T22:59:60Z', false, 'or in an hour that is not'],
      ['1998-12-31T23:59:60', false, 'a leap second and no offset'],
      ['1998-12-31T23:59:60.Z', false, 'a leap second and a fraction with no digits'],
      ['1998-12-31T23:59:61Z', false, 'a 61st second'],
      ['2020-01-01T00:00:00-23:59', true, 'the largest offset'],
      ['2020-01-01T00:00:00+24:00', false, 'an offset of 24 hours'],
      ['2020-01-01T00:00:00+02:60', false, 'an offset of 60 minutes'],
      ['2020-01-01T00:00:00+2:00', false, 'an offset hour of one digit'],
      ['2020-01-01T00:00:00+02', false, 'an offset with no minutes'],
      ['2020-01-01T00:00:00 +02:00', false, 'a space before the offset'],
      ['2020-01-01T00:60:00Z', false, 'no such minute'],
      ['2020-01-01T00:00:00.Z', false, 'a fraction with no digits'],
      ['2020-01-01T00:00:00,5Z', false, 'a comma for the point: ISO 8601, not RFC 3339'],
      ['2020-01-01T0:00:00Z', false, 'an hour of one digit'],
      ['2020-01-01T00:00:00ZZ', false, 'two zones'],
      ['2020-01-01T00:00:00Z ', false, 'a space after it'],
      [' 2020-01-01T00:00:00Z', false, 'a space before it'],
      ['2020-01-01T00:00:00Z\n', false, 'a line break after it'],
      ['x2020-01-01T00:00:00Z', false, 'something before it'],
      ['2020-01-01T00:00:00Zx', false, 'something after it'],
      ['2020-01-01TT00:00:00Z', false, 'two Ts'],
      ['2020-01-0100:00:00Z', false, 'no T'],
      ['2020-02-29T00:00:00Z', true, 'a leap day'],
      ['2021-02-29T00:00:00Z', false, 'the 29th of February in a year that has none'],
      ['2000-02-29t12:00:00+05:30', true, 'a leap day of a century year, with an offset of half an hour'],
      ['', false, 'nothing'],
    ]);
  });

  it('accepts every hour to 23, minute and second to 59, and offset to 23:59, and no other', () => {
    let accepted = 0;
    for (let count = 0; count <= 61; count++) {
      const rows: [string, boolean][] = [
        [`2020-01-01T${two(count)}:00:00Z`, count <= 23],
        [`2020-01-01T00:${two(count)}:00Z`, count <= 59],
        [`2020-01-01T00:00:${two(count)}Z`, count <= 59],
        [`2020-01-01T00:00:00+${two(count)}:00`, count <= 23],
        [`2020-01-01T00:00:00-00:${two(count)}`, count <= 59],
        [`2020-01-01T23:59:${two(count)}Z`, count <= 60],
        [`2020-01-01T23:59:60+00:${two(count)}`, count === 0],
        [`2020-01-01T23:59:60-${two(count)}:00`, count === 0],
      ];
      for (const [text, yes] of rows) {
        expect(datetime.pattern.test(text), text).toBe(yes);
        if (yes) accepted += 1;
      }
    }
    expect(accepted).toBe(24 + 60 + 60 + 24 + 60 + 61 + 1 + 1);
  });

  // parity.md decision 12: coercion reads what this format accepts, less what no engine promises to read or no Date can hold.
  it('is what coercion to a date reads, but for lower case and a leap second', () => {
    const When = dateSchema({ coerce: true });
    const read = (text: string): boolean => parse(When, text).ok;
    for (const text of ['2020-01-01T00:00:00Z', '2020-01-01T00:00:00.123456789Z', '2020-01-01T00:00:00+02:00', '2020-02-29T23:59:59-23:59', '2020-01-01', '2000-02-29']) {
      expect([read(text), datetime.pattern.test(text) || date.pattern.test(text)], text).toEqual([true, true]);
    }
    for (const text of ['2020-02-30T00:00:00Z', '2021-02-29', '2020-01-01T24:00:00Z', '2020-01-01T00:00:00+0200', '2020-01-01T00:00:00', '2020-01-01 00:00:00Z', '2020-13-01', '20200101']) {
      expect([read(text), datetime.pattern.test(text) || date.pattern.test(text)], text).toEqual([false, false]);
    }
    for (const text of ['2020-01-01t00:00:00z', '2020-01-01T00:00:00z', '1998-12-31T23:59:60Z']) {
      expect([read(text), datetime.pattern.test(text)], text).toEqual([false, true]);
    }
  });
});

describe('base64: RFC 4648 §4, padded, with no line breaks', () => {
  it('fmt.base64: accepts aGVsbG8= and refuses a$b', () => {
    holds(base64, [
      ['aGVsbG8=', true, 'five bytes: one pad'],
      ['a$b', false, 'a character outside the alphabet'],
    ]);
  });

  it('says of the edges of the grammar', () => {
    holds(base64, [
      ['', true, 'no bytes at all'],
      ['YQ==', true, 'one byte: two pads'],
      ['YWI=', true, 'two bytes: one pad'],
      ['YWJj', true, 'three bytes: no pad'],
      ['YWJjZA==', true, 'four bytes'],
      ['+/+/', true, 'the two characters that are not letters or digits'],
      ['AZaz09+/', true, 'both ends of each range'],
      ['aGVsbG8', false, 'the pad left off, §3.2'],
      ['aGVsbG8==', false, 'one pad too many'],
      ['YQ=', false, 'one pad where two are owed'],
      ['YQ', false, 'none where two are owed'],
      ['Y', false, 'one character, which encodes nothing'],
      ['Y===', false, 'three pads'],
      ['=', false, 'a pad alone'],
      ['====', false, 'four pads'],
      ['YQ==YQ==', false, 'a pad that is not at the end'],
      ['YW=j', false, 'the same'],
      ['YWJjZ', false, 'five characters'],
      ['YW Jj', false, 'a space'],
      ['YWJj\n', false, 'a line break, §3.1'],
      ['YWJj\nYWJj', false, 'the same, inside'],
      ['YWJ-', false, 'the URL-safe alphabet of §5'],
      ['YWJ_', false, 'the same'],
      ['YWJ@', false, 'the character before A'],
      ['YWJ[', false, 'the character after Z'],
      ['YWJ`', false, 'the character before a'],
      ['YWJ{', false, 'the character after z'],
      ['YWJ:', false, 'the character after 9'],
      ['YWJ.', false, 'the character before /'],
      ['YWJ,', false, 'the character after +'],
      ['Y@==', false, 'one outside the alphabet before two pads'],
      ['YW@=', false, 'and before one'],
      ['@WJj', false, 'and first'],
      ['xYWJj', false, 'five characters, the fifth in front'],
    ]);
  });
});

const NUL = String.fromCodePoint(0);

describe('url: the WHATWG URL standard, any scheme, as the platform’s parser reads it with no base', () => {
  it('fmt.url: accepts https://example.com/x and refuses "not a url"', () => {
    holds(url, [
      ['https://example.com/x', true, 'an absolute URL'],
      ['not a url', false, 'no scheme'],
    ]);
  });

  it('says of each value the libraries split on', () => {
    holds(url, [
      ['https://example.com', true, 'no path'],
      ['https://example.com/a?b=1#c', true, 'a query and a fragment'],
      ['http://localhost', true, 'a host of one label'],
      ['http://localhost:3000', true, 'a port'],
      ['HTTP://EXAMPLE.COM', true, 'upper case'],
      ['http://1.2.3.4', true, 'an address for a host'],
      ['ftp://example.com', true, 'any scheme'],
      ['mailto:a@b.co', true, 'any scheme: use httpUrl for a link'],
      ['urn:isbn:0451450523', true, 'the same'],
      ['javascript:alert(1)', true, 'the same, and the reason to use httpUrl for a link'],
      ['example.com', false, 'no scheme, and there is no base to read it against'],
      ['//example.com', false, 'the same'],
      ['/relative/path', false, 'the same'],
      ['https://', false, 'an empty host; only ajv accepts'],
      ['https://exa mple.com', false, 'a space in the host'],
      ['https://例え.jp', true, 'a host that is not ASCII: the parser encodes it; only ajv refuses'],
      ['https://example.com/a b', true, 'a space in the path: the parser encodes it; only ajv refuses'],
    ]);
  });

  it('refuses a string the parser would have to cut before reading it', () => {
    holds(url, [
      [' https://example.com', false, 'a space before it, which the parser strips'],
      ['https://example.com ', false, 'a space after it'],
      [`${NUL}https://example.com`, false, 'a control before it'],
      [`https://example.com${NUL}`, false, 'a control after it'],
      ['\thttps://example.com', false, 'a tab before it'],
      ['https://example.com\n', false, 'a line break after it'],
      ['ht\ntps://example.com', false, 'a line break inside, which the parser removes'],
      ['https://exa\tmple.com', false, 'a tab inside'],
      ['https://example.com/a\rb', false, 'a carriage return inside'],
      ['https://example.com/a!b', true, 'the character after a space, inside'],
      ['!https://example.com', false, 'and before it: no scheme starts with it'],
      ['a:', true, 'a scheme and nothing more is an absolute URL'],
      ['', false, 'nothing'],
    ]);
  });
});

describe('http-url: the same, with the scheme http or https and a host', () => {
  it('says which URLs may be offered as a link', () => {
    holds(httpUrl, [
      ['https://example.com/x', true, 'https'],
      ['http://localhost:3000', true, 'http'],
      ['HTTP://EXAMPLE.COM', true, 'a scheme is read in either case'],
      ['HttpS://example.com', true, 'the same'],
      ['https://例え.jp', true, 'a host that is not ASCII'],
      ['https://example.com/a b', true, 'a space in the path'],
      ['https://user:pw@host/', true, 'credentials'],
      ['http://[::1]:80/', true, 'an IPv6 address for a host'],
      ['ftp://example.com', false, 'another scheme'],
      ['mailto:a@b.co', false, 'another scheme'],
      ['javascript:alert(1)', false, 'another scheme'],
      ['xhttp://example.com', false, 'a scheme that only ends in http'],
      ['httpss://example.com', false, 'or only starts with it'],
      ['http:example.com', false, 'no slashes: the parser forgives it, a reader does not'],
      ['http:/example.com', false, 'one slash'],
      ['https:///x', false, 'three slashes: the parser takes x for the host'],
      ['http://', false, 'no host'],
      ['http://?x', false, 'a query for a host'],
      ['http://#x', false, 'a fragment for a host'],
      ['http://\\x', false, 'a backslash for a slash'],
      ['http:// x', false, 'a space for a host'],
      ['https://exa mple.com', false, 'a space in the host'],
      [' https://example.com', false, 'a space before it'],
      ['https://example.com\n', false, 'a line break after it'],
      ['not a url', false, 'no scheme'],
      ['', false, 'nothing'],
    ]);
  });
});
