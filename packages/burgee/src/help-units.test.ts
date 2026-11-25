/**
 * `renderHelp` read line by line (`help.ts`): the annotations, the children it lists, the
 * default width, the example layout and the colours. `help-snapshot.test.ts` pins whole screens;
 * these pin the parts a screen can get wrong without moving the rest.
 */
import { width } from 'linegauge';
import { describe, expect, it } from 'vitest';

import { renderHelp } from './help-entry.js';
import { wrap } from './help.js';

import { defineCommand, defineProgram } from './index.js';

const ok = (): string => 'ok';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'remote',
      description: 'manage remotes',
      commands: [
        defineCommand({
          name: 'add',
          description: 'add a remote',
          effects: 'read_only',
          options: {
            tag: { type: 'string', description: 'a tag', multiple: true },
            name: { type: 'string', description: 'the name', dependsOn: ['url'], exclusive: ['mirror'] },
            url: { type: 'string', description: 'the url' },
            mirror: { type: 'boolean', description: 'mirror it', deprecated: false },
            secret: { type: 'string', description: 'kept out of help', env: 'APP_SECRET', hidden: true },
            token: { type: 'string', description: 'shown in help', env: 'APP_TOKEN' },
          },
          examples: [{ command: 'app remote add --url u' }, { command: 'app remote add --name n --url u', description: Array.from({ length: 12 }, () => 'abcd').join(' ') }],
          run: ok,
        }),
      ],
    }),
    defineCommand({ name: 'other', commands: [defineCommand({ name: 'inner', description: 'not a child of remote', effects: 'read_only', run: ok })] }),
  ],
});

const node = (path: string[]) => {
  const found = program.find(path);
  if (found === undefined) throw new Error(`fixture: ${path.join(' ')}`);
  return found;
};

const lineOf = (text: string, term: string): string => text.split('\n').find((l) => l.trimStart().startsWith(term)) ?? '';

describe('renderHelp, line by line', () => {
  it('shows a nested command by its words joined with spaces', () => {
    expect(renderHelp(program, node(['app', 'remote', 'add'])).split('\n')[0]).toMatch(/^Usage: remote add /);
  });

  it('lists the children of the command asked for, and none of its cousins', () => {
    const help = renderHelp(program, node(['app', 'remote']));
    expect(help).toContain('add');
    expect(help).not.toContain('inner');
  });

  it('writes requires, conflicts with and repeatable with single spaces, and no note for deprecated: false', () => {
    const help = renderHelp(program, node(['app', 'remote', 'add']));
    expect(lineOf(help, '--name')).toMatch(/the name \(requires --url\) \(conflicts with --mirror\)$/);
    expect(lineOf(help, '--tag')).toMatch(/a tag \(repeatable\)$/);
    expect(lineOf(help, '--mirror')).toMatch(/mirror it$/);
  });

  it('lists the env var of a shown option only', () => {
    const help = renderHelp(program, node(['app', 'remote', 'add']));
    expect(help).toContain('APP_TOKEN');
    expect(help).not.toContain('APP_SECRET');
  });

  it('puts an example with no description on its own line, and wraps a described one inside the width', () => {
    const lines = renderHelp(program, node(['app', 'remote', 'add']), { width: 40 }).split('\n');
    const bare = lines.indexOf('  $ app remote add --url u');
    expect(bare).toBeGreaterThan(-1);
    expect(lines[bare + 1]).toBe('  $ app remote add --name n --url u');
    for (const line of lines.slice(bare + 2)) expect(width(line)).toBeLessThanOrEqual(40);
  });

  it('wraps at 100 columns when no width is given', () => {
    // Twenty four-letter words and `x` make a line of 101 columns: one too many.
    const description = `${Array.from({ length: 20 }, () => 'abcd').join(' ')} x y`;
    const wide = defineProgram({ name: 'app', commands: [defineCommand({ name: 'wide', description, effects: 'read_only', run: ok })] });
    const lines = renderHelp(wide, wide.find(['app', 'wide']) as never).split('\n');
    expect(lines).toContain('x y');
    expect(Math.max(...lines.map((l) => width(l)))).toBeLessThanOrEqual(100);
  });

  it('paints headings and commands bold, flags cyan and values dim, whatever stream it is written to', () => {
    const help = renderHelp(program, node(['app', 'remote']), { color: true });
    expect(help).toContain('\u001B[1mUsage:\u001B[22m');
    expect(help).toContain('\u001B[1madd\u001B[22m');
    expect(help).toContain('\u001B[36m--json\u001B[39m');
    const add = renderHelp(program, node(['app', 'remote', 'add']), { color: true });
    expect(add).toContain('\u001B[2mAPP_TOKEN\u001B[22m');
  });

  it('keeps a line that fits as written, trailing space and all', () => {
    expect(wrap('abc def ', 8)).toEqual(['abc def ']);
    expect(wrap('abc def ', 9)).toEqual(['abc def ']);
  });
});
