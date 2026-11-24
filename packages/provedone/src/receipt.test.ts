import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { checkedLine, digest, fold, prBlock, TRAILER_WIDTH, trailers, verdict, type Receipt } from './receipt.js';

const receipt: Receipt = {
  checks: [
    { command: 'npm test', exit: 0, digest: 'sha256:aaa' },
    { command: 'npm run\n  lint', exit: 2, digest: 'sha256:bbb' },
  ],
  captures: ['shots/home.png'],
  notChecked: ['the docs site', 'mobile\nwidth'],
};

describe('digest', () => {
  it('is the first 12 hex of the sha256, prefixed', () => {
    expect(digest('hello')).toBe(`sha256:${createHash('sha256').update('hello').digest('hex').slice(0, 12)}`);
    expect(digest('hello')).toMatch(/^sha256:[\da-f]{12}$/u);
  });
});

describe('trailers', () => {
  it('writes one Verified-by per check, then each capture, then each gap, each on one line', () => {
    expect(trailers(receipt)).toEqual(['Verified-by: npm test -> exit 0 (sha256:aaa)', 'Verified-by: npm run lint -> exit 2 (sha256:bbb)', 'Captured: shots/home.png', 'Not-checked: the docs site', 'Not-checked: mobile width']);
  });

  it('writes Verified-by: none with its reason in place of the checks', () => {
    expect(
      trailers({
        checks: receipt.checks,
        captures: [],
        notChecked: [],
        none: '  comment\nonly ',
      }),
    ).toEqual(['Verified-by: none (comment only)']);
  });

  it('folds a long trailer into continuation lines that fit commitlint and still pass the gate', () => {
    const gap = 'the Windows runner, the macOS runner, the docs site at mobile width, and the published tarball contents';
    const lines = trailers({ checks: [], captures: [], notChecked: [gap], none: 'workflow only' });
    expect(lines.slice(1)).toEqual(['Not-checked: the Windows runner, the macOS runner, the docs site at mobile width, and the published', ' tarball contents']);
    expect(lines.every((line) => line.length <= TRAILER_WIDTH)).toBe(true);
    expect(verdict(lines.join('\n')).ok).toBe(true);
  });
});

// 100 is commitlint's default footer-max-line-length, written out so the test pins the number.
const filler = (length: number): string => 'a'.repeat(length);

describe('fold', () => {
  it('is 100 columns wide', () => {
    expect(TRAILER_WIDTH).toBe(100);
  });

  it('leaves a breakable line of exactly 100 columns alone', () => {
    const line = `Captured: ${filler(88)} b`;
    expect(line).toHaveLength(100);
    expect(fold(line)).toEqual([line]);
  });

  it('breaks a line of 101 columns at the last space', () => {
    const line = `Captured: ${filler(89)} b`;
    expect(line).toHaveLength(101);
    expect(fold(line)).toEqual([`Captured: ${filler(89)}`, ' b']);
  });

  it('keeps the key with its first word, and never splits a word longer than the width', () => {
    const word = 'x'.repeat(105);
    expect(fold(`Verified-by: ${word} -> exit 0`)).toEqual([`Verified-by: ${word}`, ' -> exit 0']);
    expect(fold(`Captured: a ${word}`)).toEqual(['Captured: a', ` ${word}`]);
  });
});

describe('checkedLine', () => {
  it('names each command and how it ended, what was looked at, and what was not checked', () => {
    expect(checkedLine(receipt)).toBe('Checked: `npm test` (pass), `npm run lint` (exit 2); looked at `shots/home.png`. Not checked: the docs site; mobile width.');
  });

  it('lists every capture', () => {
    expect(checkedLine({ checks: [], captures: ['a.png', 'b.txt'], notChecked: [] })).toBe('Checked: ; looked at `a.png`, `b.txt`. Not checked: nothing.');
  });

  it('says nothing was left unchecked, and leaves out captures when there are none', () => {
    expect(
      checkedLine({
        checks: [receipt.checks[0] as Receipt['checks'][number]],
        captures: [],
        notChecked: [],
      }),
    ).toBe('Checked: `npm test` (pass). Not checked: nothing.');
  });

  it('says nothing was checked, and why, on none', () => {
    expect(
      checkedLine({
        checks: [],
        captures: [],
        notChecked: [],
        none: 'docs only',
      }),
    ).toBe('Checked: nothing (docs only). Not checked: nothing.');
  });
});

describe('prBlock', () => {
  it('is the heading, the Checked: line and the trailers', () => {
    expect(prBlock({ checks: [], captures: [], notChecked: ['x'], none: 'r' })).toBe('## How this was checked\n\nChecked: nothing (r). Not checked: x.\n\nVerified-by: none (r)\nNot-checked: x');
  });

  it('passes its own gate', () => {
    expect(verdict(prBlock(receipt)).ok).toBe(true);
  });
});

describe('verdict', () => {
  it('passes a receipt', () => {
    expect(verdict('feat(x): y\n\nbody\n\nVerified-by: npm test -> exit 0 (sha256:a)\n')).toEqual({ ok: true, reason: 'receipt' });
  });

  it('passes a none with a reason, and reads the key in any case', () => {
    expect(verdict('docs: y\n\nverified-by: None (comment only)')).toEqual({
      ok: true,
      reason: 'unverified, with a reason',
    });
  });

  it('reads a command that merely contains "none" as a command', () => {
    expect(verdict('x\n\nVerified-by: check none')).toEqual({ ok: true, reason: 'receipt' });
  });

  it('accepts space inside the parentheses', () => {
    expect(verdict('x\n\nVerified-by: none ( spaced out )')).toEqual({ ok: true, reason: 'unverified, with a reason' });
  });

  it('calls a mix of a none and a check a receipt', () => {
    expect(verdict('x\n\nVerified-by: none (a)\nVerified-by: npm test')).toEqual({ ok: true, reason: 'receipt' });
  });

  it('blocks a message with no Verified-by line, with a fix naming stamp', () => {
    const v = verdict('feat: y\n\nVerified: npm test\n Verified-by: indented');
    expect(v).toMatchObject({ ok: false, reason: 'no Verified-by: line' });
    expect(v.fix).toContain('provedone stamp --run');
    expect(v.fix).toContain('Verified-by: none (<why it needs no check>)');
  });

  it('does not read comment lines', () => {
    expect(verdict('feat: y\n# Verified-by: npm test').ok).toBe(false);
  });

  it.each(['none', 'none ()', 'none (  )', 'none reason', 'none (x', 'NONE', 'none (x) and more', 'none none (x)'])('blocks "Verified-by: %s", which gives no reason', (value) => {
    expect(verdict(`x\n\nVerified-by: ${value}`)).toEqual({
      ok: false,
      reason: `"Verified-by: ${value}" gives no reason`,
      fix: 'write it as `Verified-by: none (<why it needs no check>)`',
    });
  });

  it('blocks an empty Verified-by line, even beside a good one', () => {
    expect(verdict('x\n\nVerified-by: npm test\nVerified-by:   ')).toMatchObject({ ok: false, reason: 'an empty Verified-by: line' });
  });

  it('passes a merge commit, and only on its subject line', () => {
    expect(verdict("# comment\nMerge branch 'main' into x")).toEqual({
      ok: true,
      reason: 'merge commit',
    });
    expect(verdict('feat: x\n\nMerge later').ok).toBe(false);
    expect(verdict('feat: Merge x').ok).toBe(false);
    expect(verdict('\nMerge x').ok).toBe(false);
    expect(verdict('').ok).toBe(false);
    expect(verdict('# only a comment')).toMatchObject({
      ok: false,
      reason: 'no Verified-by: line',
    });
  });
});
