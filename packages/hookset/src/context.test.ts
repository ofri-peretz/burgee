import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkContext, contextText, measureContext } from './context.js';

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'hookset-context-'));
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

const skill = (name: string, extra = ''): string => `---\nname: ${name}\ndescription: ${'d'.repeat(40)}\n${extra}---\nbody\n`;

describe('measureContext', () => {
  it('follows CLAUDE.md @-imports once each', () => {
    const root = repo({ 'CLAUDE.md': '@AGENTS.md\n@AGENTS.md\n', 'AGENTS.md': 'a'.repeat(400) });
    const measured = measureContext(root);
    expect(measured.memoryFiles).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(measured.memoryTokens).toBe(Math.round((22 + 400) / 4));
  });

  it('counts a skill name and description, and leaves a user-only skill out', () => {
    const root = repo({
      '.claude/skills/one/SKILL.md': skill('one'),
      '.claude/skills/two/SKILL.md': skill('two', 'disable-model-invocation: true\n'),
    });
    const [one, two] = measureContext(root).entries;
    expect(one?.tokens).toBe(Math.round((4 + 2 + 3 + 11 + 2 + 40) / 4));
    expect(two).toEqual({ file: '.claude/skills/two/SKILL.md', tokens: 0, userOnly: true });
  });

  it('always counts a subagent: it has no user-only switch', () => {
    const root = repo({ '.claude/agents/a.md': skill('a', 'disable-model-invocation: true\n') });
    expect(measureContext(root).entries[0]?.userOnly).toBe(false);
  });
});

describe('checkContext', () => {
  it('fails with a fix when no ceiling is set', () => {
    const result = checkContext(repo({ 'CLAUDE.md': 'x' }));
    expect(result.ok).toBe(false);
    expect(result.fix).toContain('--update');
  });

  it('passes at the ceiling and fails one token over it', () => {
    const root = repo({ 'CLAUDE.md': 'x'.repeat(40), '.claude/hookset.json': '{"context":{"tokens":10}}' });
    expect(checkContext(root).ok).toBe(true);
    writeFileSync(join(root, 'CLAUDE.md'), 'x'.repeat(46));
    const over = checkContext(root);
    expect(over.ok).toBe(false);
    expect(contextText(over)).toContain('over the ceiling of 10');
  });

  it('--update lowers the ceiling, keeps other keys, and refuses to raise it', () => {
    const root = repo({ 'CLAUDE.md': 'x'.repeat(20), '.claude/hookset.json': '{"frozen":["a/**"],"context":{"tokens":10}}' });
    expect(checkContext(root, { update: true }).ok).toBe(true);
    expect(JSON.parse(readFileSync(join(root, '.claude/hookset.json'), 'utf8'))).toEqual({ frozen: ['a/**'], context: { tokens: 5 } });
    writeFileSync(join(root, 'CLAUDE.md'), 'x'.repeat(80));
    const raised = checkContext(root, { update: true });
    expect(raised.ok).toBe(false);
    expect(raised.updated).toBe(false);
  });
});
