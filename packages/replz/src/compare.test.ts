import { describe, expect, it } from 'vitest';

import { COMPARE, compareText, digest, firstDifference, judge, normalised, type Output, parseCompareConfig } from './compare.js';

const out = (stdout: string, code: number | null = 0, stderr = ''): Output => ({ code, stdout, stderr });

const approval = (entry: string) => `command: a\ninputs: b\napproved: [${entry}]\n`;
const causeOf = (yaml: string): unknown => {
  try {
    parseCompareConfig('c.yaml', yaml);
  } catch (error) {
    return (error as Error).cause;
  }
  return undefined;
};

describe('parseCompareConfig', () => {
  it('is read from .sdlc/replz/compare.yaml by default', () => {
    expect(COMPARE).toBe('.sdlc/replz/compare.yaml');
  });

  it('refuses an empty command, a digest with a character too many or one that is not hex, an approval with no reason or a field it does not know, and a document that is not a mapping', () => {
    const valid = '{ input: x, base: 0123456789ab, head: 0123456789ab, reason: r';
    expect(() => parseCompareConfig('c.yaml', 'command: ""\ninputs: b\n')).toThrow(/command/);
    expect(() => parseCompareConfig('c.yaml', approval(`${valid} }`))).not.toThrow();
    expect(() => parseCompareConfig('c.yaml', approval('{ input: x, base: 0123456789abc, head: 0123456789ab, reason: r }'))).toThrow(/approved\/0\/base/);
    expect(() => parseCompareConfig('c.yaml', approval('{ input: x, base: z123456789ab, head: 0123456789ab, reason: r }'))).toThrow(/approved\/0\/base/);
    expect(() => parseCompareConfig('c.yaml', approval('{ input: x, base: 0123456789ab, head: 0123456789ab, reason: "" }'))).toThrow(/approved\/0\/reason/);
    expect(() => parseCompareConfig('c.yaml', approval(`${valid}, by: me }`))).toThrow(/approved\/0/);
    expect(() => parseCompareConfig('c.yaml', 'command: ""\ninputs: ""\n')).toThrow(/\n {2}\/?command: [^\n]+\n {2}\/?inputs: /);
    expect(() => parseCompareConfig('c.yaml', 'just text')).toThrow(/^c\.yaml is not a valid replz compare config:\n {2}\/: \S/);
  });

  it('keeps the parse error as the cause of a refusal', () => {
    expect(causeOf('command: [')).toBeInstanceOf(Error);
    expect(causeOf('command: a\ninputs: b\nnormalize: ["("]\n')).toBeInstanceOf(SyntaxError);
  });

  it('reads the command and inputs, and defaults normalize and approved to empty', () => {
    expect(parseCompareConfig('c.yaml', 'command: node bin.js\ninputs: cases\n')).toEqual({ command: 'node bin.js', inputs: 'cases', normalize: [], approved: [] });
  });

  it('keeps setup, patterns and approvals', () => {
    const yaml = [
      'setup: npm ci',
      'command: run',
      'inputs: in',
      'normalize: ["\\\\d+ms"]',
      'approved:',
      '  - { input: a.txt, base: 0123456789ab, head: ba9876543210, reason: reworded }',
    ].join('\n');
    expect(parseCompareConfig('c.yaml', yaml)).toEqual({
      setup: 'npm ci',
      command: 'run',
      inputs: 'in',
      normalize: ['\\d+ms'],
      approved: [{ input: 'a.txt', base: '0123456789ab', head: 'ba9876543210', reason: 'reworded' }],
    });
  });

  it('refuses YAML that does not parse, a field it does not know, a short digest and a pattern that is not a regular expression', () => {
    expect(() => parseCompareConfig('c.yaml', 'command: [')).toThrow(/^c\.yaml is not YAML: .*\. fix: correct the YAML$/s);
    expect(() => parseCompareConfig('c.yaml', 'command: a\ninputs: b\nextra: 1\n')).toThrow(/^c\.yaml is not a valid replz compare config:\n.*extra.*\nfix: correct each field named above$/s);
    expect(() => parseCompareConfig('c.yaml', 'command: a\ninputs: b\napproved: [{ input: x, base: abc, head: 0123456789ab, reason: r }]\n')).toThrow(/approved\/0\/base/);
    expect(() => parseCompareConfig('c.yaml', 'command: a\ninputs: b\nnormalize: ["("]\n')).toThrow(/^c\.yaml: normalize pattern \( is not a regular expression: .*\. fix: correct the pattern$/s);
  });
});

describe('normalised', () => {
  it('holds the exit code and both streams, with each pattern replaced by its number', () => {
    expect(normalised(out('took 12ms at /tmp/x1', 3, 'warn 4ms'), ['\\d+ms', '/tmp/\\w+'])).toBe('exit 3\n--- stdout\ntook <0> at <1>\n--- stderr\nwarn <0>');
  });

  it('says when the command was killed rather than exiting', () => {
    expect(normalised(out('', null), [])).toBe('exit null\n--- stdout\n\n--- stderr\n');
  });
});

describe('digest', () => {
  it('is the first twelve hex digits of the sha256', () => {
    expect(digest('abc')).toBe('ba7816bf8f01');
  });
});

describe('firstDifference', () => {
  it('names the first line that differs, counted from 1, and an end where one side is shorter', () => {
    expect(firstDifference('a\nb\nc', 'a\nB\nc')).toEqual({ line: 2, base: 'b', head: 'B' });
    expect(firstDifference('a', 'a\nmore')).toEqual({ line: 2, base: '(end)', head: 'more' });
    expect(firstDifference('a\nless', 'a')).toEqual({ line: 2, base: 'less', head: '(end)' });
    expect(firstDifference('a', 'a')).toEqual({ line: 2, base: '(end)', head: '(end)' });
  });
});

describe('judge', () => {
  const runs = [
    { input: 'same.txt', base: out('ok 1ms'), head: out('ok 9ms') },
    { input: 'moved.txt', base: out('old'), head: out('new') },
    { input: 'broke.txt', base: out('fine'), head: out('fine', 1) },
  ];
  const moved = { base: digest(normalised(out('old'), [])), head: digest(normalised(out('new'), [])) };

  it('counts outputs equal after normalising as the same, and every other one as changed', () => {
    const report = judge(runs, { normalize: ['\\d+ms'], approved: [] });
    expect(report).toMatchObject({ inputs: 3, same: 1, approved: [], stale: [] });
    expect(report.differs.map((one) => [one.input, one.at.line])).toEqual([
      ['moved.txt', 3],
      ['broke.txt', 1],
    ]);
    expect(report.differs[0]).toMatchObject(moved);
  });

  it('passes a change a person approved for those two exact outputs, and reports an approval nothing matched as stale', () => {
    const stale = { input: 'gone.txt', base: '000000000000', head: '111111111111', reason: 'old' };
    const wrongHead = { input: 'broke.txt', base: moved.base, head: moved.head, reason: 'wrong input' };
    const report = judge(runs, { normalize: ['\\d+ms'], approved: [{ input: 'moved.txt', ...moved, reason: 'renamed' }, stale, wrongHead] });
    expect(report).toMatchObject({ same: 1, approved: ['moved.txt'], stale: [stale, wrongHead] });
    const halves = [
      { input: 'moved.txt', base: moved.base, head: moved.base, reason: 'right base, wrong head' },
      { input: 'moved.txt', base: moved.head, head: moved.head, reason: 'wrong base, right head' },
      { input: 'broke.txt', ...moved, reason: 'right outputs, wrong input' },
    ];
    expect(judge(runs, { normalize: ['\\d+ms'], approved: halves }).differs.map((one) => one.input)).toEqual(['moved.txt', 'broke.txt']);
    expect(report.differs.map((one) => one.input)).toEqual(['broke.txt']);
  });
});

describe('compareText', () => {
  it('heads the counts, shows each change with the entry that approves it, and lists stale approvals', () => {
    const text = compareText(
      {
        inputs: 3,
        same: 1,
        approved: ['a'],
        differs: [{ input: 'b.txt', base: '0123456789ab', head: 'ba9876543210', at: { line: 2, base: 'x', head: 'y' } }],
        stale: [{ input: 'c.txt', base: '000000000000', head: '111111111111', reason: 'r' }],
      },
      { base: 'origin/main', head: 'HEAD' },
    );
    expect(text).toBe(
      [
        '3 input(s) through origin/main and HEAD: 1 the same, 1 approved, 1 changed',
        '',
        'b.txt: line 2 changed',
        '  - x',
        '  + y',
        '  approve: { input: "b.txt", base: 0123456789ab, head: ba9876543210, reason: <why> }',
        '',
        'stale approval for c.txt (000000000000 -> 111111111111): no run matched it, so it can go',
      ].join('\n'),
    );
  });

  it('prints only the counts when nothing changed', () => {
    expect(compareText({ inputs: 1, same: 1, approved: [], differs: [], stale: [] }, { base: 'b', head: 'h' })).toBe('1 input(s) through b and h: 1 the same, 0 approved, 0 changed');
  });
});
