import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { checkContext, contextText, measureContext, tokensOf, type ContextResult } from './context.js';

const scratch = scratchDirs();

function repo(files: Record<string, string>): string {
  const root = scratch('hookset-context-');
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const doc = (frontmatter: string): string => `---\n${frontmatter}\n---\nbody text that is never counted\n`;
const chars = (root: string): Record<string, number> => Object.fromEntries(measureContext(root).entries.map((e) => [e.file, e.chars]));

describe('measureContext: CLAUDE.md and its imports', () => {
  it('measures nothing in a repository with no CLAUDE.md and no .claude/', () => {
    expect(measureContext(repo({ 'README.md': 'x' }))).toEqual({
      tokens: 0,
      memoryFiles: [],
      memoryChars: 0,
      entries: [],
    });
  });

  it('follows @-imports relative to the importing file, once each, and skips a missing one', () => {
    const claude = '@docs/A.md\n@docs/A.md\n@./docs/A.md\n@gone.md\nnot @ignored.md\n';
    const root = repo({
      'CLAUDE.md': claude,
      'docs/A.md': '@B.md\n',
      'docs/B.md': 'b'.repeat(10),
      'ignored.md': 'i'.repeat(100),
    });
    const measured = measureContext(root);
    expect(measured.memoryFiles).toEqual(['CLAUDE.md', 'docs/A.md', 'docs/B.md']);
    expect(measured.memoryChars).toBe(claude.length + 6 + 10);
    expect(measured.tokens).toBe(tokensOf(claude.length + 16));
  });
});

describe('measureContext: skills, commands and subagents', () => {
  it('counts each listed file name and description as `key: value`, sorted by path', () => {
    const root = repo({
      '.claude/skills/one/SKILL.md': doc('name: one\ndescription: two words'),
      '.claude/skills/one/reference.md': doc('name: never-listed'),
      '.claude/commands/go.md': doc('description: go'),
      '.claude/commands/nested/deep.md': doc('name: d'),
      '.claude/commands/notes.txt': doc('name: never-listed'),
      '.claude/agents/a.md': doc('name:a\ndescription:b'),
      '.claude/agents/notes.txt': doc('name: never-listed'),
    });
    expect(measureContext(root).entries.map((e) => e.file)).toEqual([
      '.claude/agents/a.md',
      '.claude/commands/go.md',
      '.claude/commands/nested/deep.md',
      '.claude/skills/one/SKILL.md',
    ]);
    expect(chars(root)).toEqual({
      '.claude/agents/a.md': 'name: a'.length + 'description: b'.length,
      '.claude/commands/go.md': 'description: go'.length,
      '.claude/commands/nested/deep.md': 'name: d'.length,
      '.claude/skills/one/SKILL.md': 'name: one'.length + 'description: two words'.length,
    });
    expect(measureContext(root).tokens).toBe(tokensOf(21 + 15 + 7 + 32));
  });

  it('reads a folded description, CRLF frontmatter, and only keys at the start of a line', () => {
    const root = repo({
      '.claude/commands/folded.md': doc('nickname: long long long\nsubdescription: zzz\ndescription: first\n    second line\n  third\nname: f\n  gg'),
      '.claude/commands/late.md': 'intro\n---\nname: late\n---\n',
      '.claude/commands/crlf.md': '---\r\nname: crlf\r\n---\r\n',
      '.claude/commands/none.md': 'no frontmatter at all\nname: x\n',
      '.claude/commands/empty.md': doc('other: 1'),
    });
    expect(chars(root)).toEqual({
      '.claude/commands/crlf.md': 'name: crlf'.length,
      '.claude/commands/empty.md': 0,
      '.claude/commands/folded.md': 'name: f\n  gg'.length + 'description: first\n    second line\n  third'.length,
      '.claude/commands/late.md': 0,
      '.claude/commands/none.md': 0,
    });
  });

  it('leaves out a user-only skill or command, never a subagent', () => {
    const off = 'name: n\ndisable-model-invocation: true';
    const root = repo({
      '.claude/skills/s/SKILL.md': doc(off),
      '.claude/commands/tight.md': doc('name: n\ndisable-model-invocation:true'),
      '.claude/commands/trailing.md': doc('name: n\ndisable-model-invocation: true  '),
      '.claude/commands/trueish.md': doc('name: n\ndisable-model-invocation: trueish'),
      '.claude/commands/prefixed.md': doc('name: n\nx-disable-model-invocation: true'),
      '.claude/agents/a.md': doc(off),
    });
    expect(measureContext(root).entries).toEqual([
      { file: '.claude/agents/a.md', chars: 7, userOnly: false },
      { file: '.claude/commands/prefixed.md', chars: 7, userOnly: false },
      { file: '.claude/commands/tight.md', chars: 0, userOnly: true },
      { file: '.claude/commands/trailing.md', chars: 0, userOnly: true },
      { file: '.claude/commands/trueish.md', chars: 7, userOnly: false },
      { file: '.claude/skills/s/SKILL.md', chars: 0, userOnly: true },
    ]);
  });
});

const at = (text: string, config?: string): string =>
  repo({
    'CLAUDE.md': text,
    ...(config === undefined ? {} : { '.claude/hookset.json': config }),
  });
const measured = (tokens: number, chars: number) => ({
  tokens,
  memoryFiles: ['CLAUDE.md'],
  memoryChars: chars,
  entries: [],
});

describe('checkContext', () => {
  it('fails with the fix when no ceiling is set, or the ceiling is not a number', () => {
    const expected = {
      ...measured(1, 4),
      ok: false,
      ceiling: undefined,
      updated: false,
      error: 'no context ceiling in .claude/hookset.json',
      fix: 'run `hookset context --update` to set it at the current size',
    };
    expect(checkContext(at('xxxx'))).toEqual(expected);
    expect(checkContext(at('xxxx', '{"context":null}'))).toEqual(expected);
    expect(checkContext(at('xxxx', '{"context":{"tokens":"9"}}'))).toEqual(expected);
  });

  it('passes at the ceiling and fails one token over it', () => {
    expect(checkContext(at('x'.repeat(40), '{"context":{"tokens":10}}'))).toEqual({
      ...measured(10, 40),
      ok: true,
      ceiling: 10,
      updated: false,
    });
    expect(checkContext(at('x'.repeat(44), '{"context":{"tokens":10}}'))).toEqual({
      ...measured(11, 44),
      ok: false,
      ceiling: 10,
      updated: false,
      error: 'always-loaded context is 11 tokens, over the ceiling of 10',
      fix: 'shorten what you added, move a rule into a check, or mark a skill the model should never start itself `disable-model-invocation: true`',
    });
  });

  it('--update sets a first ceiling, lowers one, and keeps the ceiling it equals', () => {
    const root = at('x'.repeat(20));
    expect(checkContext(root, { update: true })).toEqual({
      ...measured(5, 20),
      ok: true,
      ceiling: 5,
      updated: true,
    });
    expect(readFileSync(join(root, '.claude/hookset.json'), 'utf8')).toBe('{\n  "context": {\n    "tokens": 5\n  }\n}\n');

    const lower = at('x'.repeat(20), '{"frozen":["a/**"],"context":{"tokens":10}}');
    expect(checkContext(lower, { update: true }).ceiling).toBe(5);
    expect(JSON.parse(readFileSync(join(lower, '.claude/hookset.json'), 'utf8'))).toEqual({ frozen: ['a/**'], context: { tokens: 5 } });
    expect(checkContext(lower, { update: true })).toEqual({
      ...measured(5, 20),
      ok: true,
      ceiling: 5,
      updated: true,
    });
  });

  it('--update refuses to raise the ceiling and leaves the file alone', () => {
    const root = at('x'.repeat(80), '{"context":{"tokens":10}}');
    expect(checkContext(root, { update: true })).toEqual({
      ...measured(20, 80),
      ok: false,
      ceiling: 10,
      updated: false,
      error: '20 tokens is over the ceiling of 10; --update only lowers it',
      fix: 'cut what was added, or raise context.tokens in .claude/hookset.json by decision',
    });
    expect(readFileSync(join(root, '.claude/hookset.json'), 'utf8')).toBe('{"context":{"tokens":10}}');
  });
});

const entry = (file: string, n: number) => ({
  file,
  chars: n,
  userOnly: n === 0,
});

describe('contextText', () => {
  const base: ContextResult = {
    tokens: 7,
    memoryFiles: [],
    memoryChars: 0,
    entries: [],
    ok: true,
    ceiling: 7,
    updated: false,
  };

  it('says the size at the ceiling, and asks to lock in a cut below it', () => {
    expect(contextText(base)).toBe('✔ always-loaded context: 7 tokens (ceiling 7)');
    expect(contextText({ ...base, ceiling: 8 })).toBe(
      '✔ always-loaded context: 7 tokens (ceiling 8)\n  below the ceiling: run `hookset context --update` to lock in the cut',
    );
  });

  it('says what --update set', () => {
    expect(contextText({ ...base, updated: true })).toBe('ceiling set to 7 tokens');
  });

  it('names the memory files and the five largest descriptions on a failure', () => {
    const failed: ContextResult = {
      ...base,
      ok: false,
      memoryFiles: ['CLAUDE.md', 'AGENTS.md'],
      memoryChars: 400,
      entries: [entry('a', 8), entry('b', 40), entry('c', 0), entry('d', 12), entry('e', 4), entry('f', 20), entry('g', 16)],
      error: 'too big',
      fix: 'cut it',
    };
    expect(contextText(failed)).toBe(
      [
        '✖ too big',
        '  CLAUDE.md and imports: 100 tokens (CLAUDE.md, AGENTS.md)',
        '  largest descriptions:',
        '    10  b',
        '    5  f',
        '    4  g',
        '    3  d',
        '    2  a',
        '  fix: cut it',
      ].join('\n'),
    );
  });

  it('says none when there is no CLAUDE.md and lists no description when none counts', () => {
    expect(
      contextText({
        ...base,
        ok: false,
        entries: [entry('c', 0)],
        error: 'e',
        fix: 'f',
      }),
    ).toBe('✖ e\n  CLAUDE.md and imports: 0 tokens (none)\n  fix: f');
  });

  it('lists a single description of one character', () => {
    expect(contextText({ ...base, ok: false, entries: [entry('c', 0), entry('x', 1)], error: 'e', fix: 'f' })).toBe(
      '✖ e\n  CLAUDE.md and imports: 0 tokens (none)\n  largest descriptions:\n    0  x\n  fix: f',
    );
  });
});
