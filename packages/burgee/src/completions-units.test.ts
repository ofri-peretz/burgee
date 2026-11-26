/**
 * Completion scripts for a program of two words, three levels deep, with aliases on two commands
 * and descriptions that carry the characters each shell reserves: the exact lines each shell gets.
 */
import { describe, expect, it } from 'vitest';

import { completionTree, renderCompletion, renderFigSpec } from './completions.js';
import { Manifest } from './manifest.js';

const run = (): number => 1;
const fixture = (): Manifest => {
  const m = new Manifest();
  m.rootPath = ['my', 'app'];
  m.add({ path: ['my', 'app'], options: {} });
  m.add({ path: ['my', 'app', 'sync-all'], description: "it's [one]: sync", aliases: ['sa'], options: { name: { type: 'string', description: "the [x]: name's", dependsOn: [], exclusive: [] } }, run });
  m.add({ path: ['my', 'app', 'grp'], description: '', aliases: ['g'], options: {} });
  m.add({ path: ['my', 'app', 'grp', 'sub'], options: {} });
  m.add({ path: ['my', 'app', 'grp', 'sub', 'leaf'], options: {}, run });
  return m;
};

describe('the tree the scripts are made from', () => {
  it('names the program by its words joined with dashes, and a command with no words of its own by none', () => {
    const { program, root } = completionTree(fixture());
    expect(program).toBe('my-app');
    expect(root.children.map((c) => c.description)).toEqual(["it's [one]: sync", '']);
  });
});

describe('zsh', () => {
  const zsh = renderCompletion(fixture(), 'zsh');
  it('names each function after the program and the command, every other character an underscore', () => {
    expect(zsh).toContain('sync-all|sa) _my_app_sync_all ;;');
  });
  it('blanks out brackets and colons in a description, and offers any word for a value with no choices', () => {
    expect(zsh).toContain("_values 'command' 'sync-all[it'\\''s  one   sync]'");
    expect(zsh).toContain("_arguments -s '--name[the  x   name'\\''s]:name: '");
  });
});

describe('fish', () => {
  it('asks for a value with no choices and offers none', () => {
    expect(renderCompletion(fixture(), 'fish')).toContain("complete -c my-app -n '__fish_seen_subcommand_from sync-all sa' -l name -r -d 'the [x]: name'\\''s'\n");
  });
});

describe('PowerShell', () => {
  const pwsh = renderCompletion(fixture(), 'pwsh');
  it('doubles a quote in a command’s description and in an option’s', () => {
    expect(pwsh).toContain("@('sync-all', 'Command', 'it''s [one]: sync')");
    expect(pwsh).toContain("@('--name', 'ParameterName', 'the [x]: name''s')");
  });
  it('lists every alias in one table, and reads one typed in a command’s place', () => {
    expect(pwsh).toContain("$alias = @{ 'sa' = 'sync-all'; 'g' = 'grp' }");
    expect(pwsh).toContain('if ($alias.ContainsKey($candidate)) { $candidate = $alias[$candidate] }');
  });
  it('carries no alias table, and no lookup in one, for a program with no alias', () => {
    const m = new Manifest();
    m.rootPath = ['solo'];
    m.add({ path: ['solo', 'go'], options: {}, run });
    expect(renderCompletion(m, 'pwsh')).not.toContain('$alias');
    // Nor a description for a root that was never registered.
    expect('description' in renderFigSpec(m)).toBe(false);
  });
});

describe('Fig', () => {
  const fig = renderFigSpec(fixture());
  it('nests the third level under the second', () => {
    const grp = fig.subcommands?.find((s) => s.name === 'grp' || (Array.isArray(s.name) && s.name.includes('grp')));
    expect(grp?.subcommands?.[0]?.subcommands?.[0]?.name).toBe('leaf');
  });
  it('leaves out a description that is empty, and relations that name nothing', () => {
    const grp = fig.subcommands?.[1];
    expect(grp && 'description' in grp).toBe(false);
    const name = fig.subcommands?.[0]?.options?.[0];
    expect(name).toStrictEqual({ name: ['--name'], description: "the [x]: name's", args: { name: 'value' } });
  });
});
