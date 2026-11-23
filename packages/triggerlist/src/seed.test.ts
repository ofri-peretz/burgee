import { describe, expect, it } from 'vitest';

import { fromDecision, fromLockTest, idOf, toYaml } from './seed.js';

const LICENCE = '/**\n * Copyright (c) 2026 Ofri Peretz\n */\n';

describe('fromLockTest', () => {
  it('drafts from the first doc comment after the licence, its first sentence on one line', () => {
    const text = `${LICENCE}\n/**\n * Nobody keeps an inline\n * implementation of a job. More here.\n */\nconst x = 1;\n/** later */`;
    expect(fromLockTest({ path: 'scripts/Inline_Impl-lock.test.ts', text })).toEqual({
      id: 'inline-impl-lock',
      trigger: { paths: ['**'] },
      question: 'Nobody keeps an inline implementation of a job.',
      check: 'npx vitest run --config vitest.root.config.ts scripts/Inline_Impl-lock.test.ts',
      sources: ['scripts/Inline_Impl-lock.test.ts'],
    });
  });

  it('takes a comment with no sentence end whole, and ends at ? or !', () => {
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** Holds the band */' })?.question).toBe('Holds the band');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** Why? Because. */' })?.question).toBe('Why?');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** Stop! Now. */' })?.question).toBe('Stop!');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** v1.2 is kept. */' })?.question).toBe('v1.2 is kept.');
  });

  it('strips the comment stars however the lines are indented, and nothing else', () => {
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '  /**\n   *\n   *   Holds  the\n   *band a * b. Rest. */' })?.question).toBe('Holds the band a * b.');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** a * b. */' })?.question).toBe('a * b.');
  });

  it('drops the `Lock —` opening the headers share', () => {
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/**\n * Lock — every number is sourced. */' })?.question).toBe('every number is sourced.');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** Lock-free code. */' })?.question).toBe('free code.');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** Lock – x. */' })?.question).toBe('x.');
    expect(fromLockTest({ path: 'a-lock.test.ts', text: '/** A Lock — x. */' })?.question).toBe('A Lock — x.');
  });

  it('drafts nothing from a file with only the licence', () => {
    expect(fromLockTest({ path: 'a-lock.test.ts', text: LICENCE })).toBeUndefined();
  });
});

describe('fromDecision', () => {
  it('drafts from the frontmatter id and subject, quoted or not', () => {
    const text = "---\nid: D-20261123-Tools\nsubject: 'Where do tools live?'\ntaken: x\n---\nBody";
    expect(fromDecision({ path: '.sdlc/decisions/d.md', text })).toEqual({
      id: 'd-20261123-tools',
      trigger: { paths: ['**'] },
      question: 'Does the change respect this decision: Where do tools live?',
      check: 'read .sdlc/decisions/d.md',
      sources: ['.sdlc/decisions/d.md'],
    });
    expect(fromDecision({ path: 'd.md', text: '---\nid: x\nsubject: plain words  \n---' })?.question).toBe('Does the change respect this decision: plain words');
    expect(fromDecision({ path: 'd.md', text: "---\nid: x\nsubject: 'opens only\n---" })?.question).toBe("Does the change respect this decision: 'opens only");
    expect(fromDecision({ path: 'd.md', text: "---\nid: x\nsubject: closes only'\n---" })?.question).toBe("Does the change respect this decision: closes only'");
  });

  it('drafts nothing without frontmatter, an id or a subject', () => {
    expect(fromDecision({ path: 'd.md', text: '# no frontmatter' })).toBeUndefined();
    expect(fromDecision({ path: 'd.md', text: '---\nsubject: s\n---' })).toBeUndefined();
    expect(fromDecision({ path: 'd.md', text: '---\nid: x\n---' })).toBeUndefined();
    expect(fromDecision({ path: 'd.md', text: 'x\n---\nid: x\nsubject: s\n---' })).toBeUndefined();
  });
});

describe('idOf', () => {
  it('lowercases and joins words with single dashes, trimming the ends', () => {
    expect(idOf('--A  b__C--')).toBe('a-b-c');
  });
});

describe('toYaml', () => {
  it('prints fresh items as YAML the checklist takes, skipping known ids', () => {
    const item = { id: 'a', trigger: { paths: ['**', 'x'] }, question: 'q "1"', check: 'c', sources: ['s', 't'] };
    expect(toYaml([item, { ...item, id: 'known' }], new Set(['known']))).toBe(
      [
        '# 1 draft item(s) from triggerlist seed. Narrow each trigger before it goes into the checklist.',
        '- id: a',
        '  trigger:',
        '    paths: ["**", "x"]',
        '  question: "q \\"1\\""',
        '  check: "c"',
        '  sources: ["s", "t"]',
      ].join('\n'),
    );
  });
});
