import { describe, expect, it } from 'vitest';

import { CHECKLIST, parseChecklist } from './checklist.js';

const ITEM = `  - id: subprocess
    trigger:
      paths: ['packages/*/src/**/*.ts']
      pattern: 'node:child_process'
    question: Does it spawn through bellpull?
    check: npx vitest run scripts/inline-implementation-lock.test.ts
    sources: [scripts/inline-implementation-lock.test.ts]
`;

describe('parseChecklist', () => {
  it('reads gates and items, with the pattern optional', () => {
    const checklist = parseChecklist('c.yaml', `gates: [lefthook.yml]\nitems:\n${ITEM}  - id: any-doc\n    trigger: { paths: ['**/*.md'] }\n    question: q\n    check: c\n    sources: [s]\n`);
    expect(checklist.gates).toEqual(['lefthook.yml']);
    expect(checklist.items.map((item) => item.id)).toEqual(['subprocess', 'any-doc']);
    expect(checklist.items[0]?.trigger).toEqual({ paths: ['packages/*/src/**/*.ts'], pattern: 'node:child_process' });
    expect(checklist.items[1]?.trigger.pattern).toBeUndefined();
  });

  it('lives in .sdlc by default', () => {
    expect(CHECKLIST).toBe('.sdlc/checklist.yaml');
  });

  it('refuses text that is not YAML, naming the file and keeping the cause', () => {
    expect(() => parseChecklist('c.yaml', 'gates: [\n')).toThrow(/^c\.yaml is not YAML: .+\. fix: correct the YAML$/s);
    expect(() => parseChecklist('c.yaml', 'gates: [\n')).toThrow(expect.objectContaining({ cause: expect.any(Error) }));
  });

  it('lists every issue, one per line', () => {
    expect(() => parseChecklist('c.yaml', 'items: []\nextra: 1\n')).toThrow(
      /^c\.yaml is not a valid checklist:\n {2}\/gates: [^\n]+\n {2}\/extra: [^\n]+$/,
    );
  });

  it.each([
    ['an unknown key', `gates: []\nitems: []\nextra: 1\n`, '  /extra: '],
    ['a document that is not a mapping', '42\n', '\n  /: '],
    ['an item missing its sources', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x] }, question: q, check: c }\n`, '  /items/0/sources: '],
    ['empty sources', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x] }, question: q, check: c, sources: [] }\n`, '/items/0/sources'],
    ['empty paths', `gates: []\nitems:\n  - { id: a, trigger: { paths: [] }, question: q, check: c, sources: [s] }\n`, '/items/0/trigger/paths'],
    ['an empty question', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x] }, question: '', check: c, sources: [s] }\n`, '/items/0/question'],
    ['an empty pattern', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x], pattern: '' }, question: q, check: c, sources: [s] }\n`, '/items/0/trigger/pattern'],
    ['an unknown trigger key', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x], when: y }, question: q, check: c, sources: [s] }\n`, '/items/0/trigger'],
    ['an unknown item key', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x] }, question: q, check: c, sources: [s], extra: 1 }\n`, '/items/0'],
    ['an id with capitals', `gates: []\nitems:\n  - { id: Ab, trigger: { paths: [x] }, question: q, check: c, sources: [s] }\n`, '/items/0/id'],
    ['an id that starts with a dash', `gates: []\nitems:\n  - { id: -a, trigger: { paths: [x] }, question: q, check: c, sources: [s] }\n`, '/items/0/id'],
    ['an id with a trailing space', `gates: []\nitems:\n  - { id: 'a b', trigger: { paths: [x] }, question: q, check: c, sources: [s] }\n`, '/items/0/id'],
    ['an empty gate', `gates: ['']\nitems: []\n`, '/gates/0'],
  ])('refuses %s, with the pointer', (_, yaml, pointer) => {
    expect(() => parseChecklist('c.yaml', yaml)).toThrow(`c.yaml is not a valid checklist:\n`);
    expect(() => parseChecklist('c.yaml', yaml)).toThrow(pointer);
  });

  it('accepts a one-character id and digits', () => {
    expect(parseChecklist('c', `gates: []\nitems:\n  - { id: '9', trigger: { paths: [x] }, question: q, check: c, sources: [s] }\n`).items[0]?.id).toBe('9');
  });

  it('refuses a duplicate id', () => {
    expect(() => parseChecklist('c.yaml', `gates: []\nitems:\n${ITEM}${ITEM}`)).toThrow('c.yaml names the item `subprocess` twice. fix: give each item its own id');
  });

  it('refuses a pattern that is not a regex, keeping the cause', () => {
    let thrown: Error | undefined;
    try {
      parseChecklist('c.yaml', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x], pattern: '(' }, question: q, check: c, sources: [s] }\n`);
    } catch (error) {
      thrown = error as Error;
    }
    expect(thrown?.message).toMatch(/^c\.yaml: `a` has a pattern that is not a regex: .+\. fix: correct trigger\.pattern$/);
    expect(thrown?.cause).toBeInstanceOf(SyntaxError);
  });

  it('compiles patterns as unicode regexes', () => {
    expect(() => parseChecklist('c', `gates: []\nitems:\n  - { id: a, trigger: { paths: [x], pattern: '\\-' }, question: q, check: c, sources: [s] }\n`)).toThrow('not a regex');
  });
});
