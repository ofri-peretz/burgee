import { describe, expect, it } from 'vitest';

import { KINDS, parseCase, PLACEHOLDER, selectCases, SETS } from './cases.js';

const BUG = 'id: bug-12\nkind: bug\npr: 12\nbase: abc1234\nhead: def5678\nanswer: The cache key drops the locale.\nset: test\n';

describe('parseCase', () => {
  it('reads a bug with its answer, and a control without one', () => {
    expect(parseCase('c', BUG)).toEqual({ id: 'bug-12', kind: 'bug', pr: 12, base: 'abc1234', head: 'def5678', answer: 'The cache key drops the locale.', set: 'test' });
    expect(parseCase('c', 'id: c-1\nkind: control\npr: 1\nbase: 0123456789abcdef0123456789abcdef01234567\nhead: abcdef0\nset: tune\n').kind).toBe('control');
    expect(KINDS).toEqual(['bug', 'control']);
    expect(SETS).toEqual(['tune', 'test']);
  });

  it('refuses text that is not YAML, keeping the cause', () => {
    expect(() => parseCase('c.yaml', 'id: [\n')).toThrow(/^c\.yaml is not YAML: .+\. fix: correct the YAML$/s);
    expect(() => parseCase('c.yaml', 'id: [\n')).toThrow(expect.objectContaining({ cause: expect.any(Error) }));
  });

  it.each([
    ['a short sha', BUG.replace('abc1234', 'abc123'), '/base'],
    ['a sha with capitals', BUG.replace('def5678', 'DEF5678'), '/head'],
    ['a sha with a suffix', BUG.replace('def5678', 'def5678x'), '/head'],
    ['a sha that is too long', BUG.replace('abc1234', 'a'.repeat(41)), '/base'],
    ['a zero pr', BUG.replace('pr: 12', 'pr: 0'), '/pr'],
    ['a fractional pr', BUG.replace('pr: 12', 'pr: 1.5'), '/pr'],
    ['an unknown kind', BUG.replace('kind: bug', 'kind: flaky'), '/kind'],
    ['an unknown set', BUG.replace('set: test', 'set: train'), '/set'],
    ['an id with capitals', BUG.replace('id: bug-12', 'id: Bug'), '/id'],
    ['an id with a leading dash', BUG.replace('id: bug-12', 'id: -b'), '/id'],
    ['an id with a space', BUG.replace('id: bug-12', "id: 'b c'"), '/id'],
    ['an empty answer', BUG.replace('answer: The cache key drops the locale.', "answer: ''"), '/answer'],
    ['an unknown key', `${BUG}extra: 1\n`, '/extra'],
  ])('refuses %s, with the pointer', (_, yaml, pointer) => {
    expect(() => parseCase('c.yaml', yaml)).toThrow(new RegExp(`^c\\.yaml is not a valid case:\\n {2}${pointer}: `));
  });

  it('lists every issue, one per line, and names the root', () => {
    expect(() => parseCase('c', '42\n')).toThrow(/^c is not a valid case:\n {2}\/: /);
    expect(() => parseCase('c', 'kind: bug\n')).toThrow(/^c is not a valid case:\n {2}\/id: [^\n]+\n {2}\/pr: /);
  });

  it('needs an answer on a bug and refuses one on a control', () => {
    expect(() => parseCase('c', BUG.replace(/answer:.*\n/, ''))).toThrow('c: a bug case needs its answer, one sentence saying what the bug is. fix: add answer');
    expect(() => parseCase('c', BUG.replace('kind: bug', 'kind: control'))).toThrow('c: a control has no bug, so no answer. fix: remove answer, or make it kind: bug');
  });

  it('refuses an answer that is still the draft placeholder, and says what each invalid field needs', () => {
    expect(PLACEHOLDER).toBe('TODO');
    expect(() => parseCase('c', BUG.replace('The cache key', 'TODO one sentence. The cache key'))).toThrow("c: the answer is still the draft's TODO, and a finding graded against it grades nothing. fix: write one sentence saying what the bug is, from the revert or the fix");
    expect(parseCase('c', BUG.replace('The cache key', 'The TODO cache key')).answer).toBe('The TODO cache key drops the locale.');
    expect(() => parseCase('c', '42\n')).toThrow(/\nfix: correct each field named above$/);
  });
});

describe('selectCases', () => {
  const bug = parseCase('c', BUG);
  const control = { ...bug, id: 'control-1', kind: 'control' as const, answer: undefined, set: 'tune' as const };

  it('keeps every case without a set, and only that set with one', () => {
    expect(selectCases([bug, control], undefined)).toEqual([bug, control]);
    expect(selectCases([bug, control], 'tune')).toEqual([control]);
    expect(selectCases([bug, control], 'test')).toEqual([bug]);
  });

  it('refuses two cases with one id, even across sets', () => {
    expect(() => selectCases([bug, { ...bug, set: 'tune' }], 'tune')).toThrow('two cases are named `bug-12`. fix: give each case its own id');
  });
});
