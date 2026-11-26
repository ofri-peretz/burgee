/**
 * The skill's text piece by piece, on a manifest the test builds by hand: the description's
 * phrasing and its cut at the specification's limit, the YAML scalar, and a program named in
 * two words.
 */
import { describe, expect, it } from 'vitest';

import { type CommandNode, Manifest } from './manifest.js';
import { renderAgents, renderSkill } from './skill.js';

const run = (): undefined => undefined;
const manifestOf = (rootPath: string[], root: Partial<CommandNode>, ...commands: { name: string; summary?: string }[]): Manifest => {
  const m = new Manifest();
  m.rootPath = rootPath;
  m.config = { name: rootPath.join(' ') };
  m.add({ path: rootPath, options: {}, ...root });
  for (const c of commands) m.add({ path: [...rootPath, c.name], options: {}, run, ...(c.summary === undefined ? {} : { summary: c.summary }) });
  return m;
};
/** The `description:` line of the front matter, as written. */
const described = (m: Manifest): string => (renderSkill(m).split('\n')[2] as string).slice('description: '.length);
const said = (description: string, ...summaries: string[]): string =>
  described(manifestOf(['app'], { description }, ...summaries.map((summary, i) => ({ name: `c${String(i)}`, summary }))));

describe('the skill description', () => {
  it('lowers a summary that starts with a word, keeps an acronym, and drops only a final full stop', () => {
    expect(said('Ships things.', 'Deploy the app.', 'API Keys rotate', 'Bump to v1.2')).toBe('Ships things. Use it to deploy the app, API Keys rotate or bump to v1.2.');
  });

  it('joins one use alone and two with or, and skips an empty summary', () => {
    expect(said('Ships things', 'Deploy')).toBe('Ships things. Use it to deploy.');
    expect(said('Ships things', 'Deploy', '', 'Roll back')).toBe('Ships things. Use it to deploy or roll back.');
  });

  it('ends a sentence only where it does not already end, wherever else a dot falls', () => {
    expect(said('Ships v1.2 builds')).toBe('Ships v1.2 builds.');
  });

  it('keeps a description of exactly the limit, and cuts one past it at the last space', () => {
    expect(said('a'.repeat(1023))).toBe(`${'a'.repeat(1023)}.`);
    expect(said('a'.repeat(1024))).toBe(`${'a'.repeat(1023)}…`);
    const cut = said('word '.repeat(300));
    expect(cut.length).toBeLessThanOrEqual(1024);
    expect(cut.endsWith(' word…')).toBe(true);
  });
});

describe('the YAML scalar', () => {
  it('stays plain with a colon that does not end a key', () => {
    expect(said('Talks to host:port')).toBe('Talks to host:port.');
  });

  it('is quoted when it starts with a quote, or runs over a line', () => {
    expect(said('"Quoted" first')).toBe(JSON.stringify('"Quoted" first.'));
    expect(said('Line one\nline two')).toBe(JSON.stringify('Line one\nline two.'));
  });
});

describe('a program named in two words', () => {
  const m = manifestOf(['my', 'app'], { run }, { name: 'go', summary: 'Go' });

  it('names it in full in the heading, the default description, the run line and the commands', () => {
    const lines = renderSkill(m).split('\n');
    expect(lines.slice(0, 5)).toEqual(['---', 'name: my-app', 'description: The my app command line. Use it to go.', '---', '']);
    expect(lines[5]).toBe('# my app');
    expect(lines).toContain('- `my app go`: Go.');
    expect(renderAgents(m).split('\n')[0]).toBe('# AGENTS.md — my app');
  });

  it('lays the contract and the commands out with a blank line before each table and list', () => {
    const lines = renderSkill(m).split('\n');
    const at = lines.indexOf('| Exit | Kind | Retry | What it asks of the caller |');
    expect(lines.slice(at - 2, at + 2)).toEqual([expect.stringMatching(/^- `my app --schema <command>`/), '', '| Exit | Kind | Retry | What it asks of the caller |', '| :-- | :-- | :-- | :-- |']);
    const commands = lines.indexOf('## Commands');
    expect(lines.slice(commands, commands + 3)).toEqual(['## Commands', '', '- `my app`']);
    const after = lines.findIndex((line) => line.startsWith("For any command's options"));
    expect(lines.slice(after - 2, after)).toEqual(['- `my app go`: Go.', '']);
  });
});
