/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * D5 — the Fig spec says what the program is, and the parser agrees with it.
 *
 * `commander-completions` records that "nothing validates the Fig spec". It was pinned by
 * snapshot only, and a snapshot pins a typo as firmly as it pins a fact: rename a key to
 * `subCommands` and the spec still matches itself, still serialises, and silently offers
 * nothing.
 *
 * **This is not Fig schema conformance.** That needs `@withfig/autocomplete-types`, and a
 * dependency — even a dev one — is a decision somebody makes on purpose in a repository
 * whose first principle is not having any. Writing the allowed-key table from memory would
 * be worse than not checking: a wrong allow-list rejects valid specs and blesses invalid
 * ones, and nobody would know which.
 *
 * So it checks the half that needs no outside knowledge, which is also the half that breaks:
 * **the spec and the parser describe the same program.** Every flag it offers is accepted,
 * every subcommand it names is runnable, and nothing is offered twice.
 */
import { describe, expect, it } from 'vitest';

import { renderFigSpec } from './completions.js';
import { defineCommand, defineProgram, ExitCode } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'say hello',
      options: { shout: { type: 'boolean' }, greeting: { type: 'string', choices: ['Hello', 'Hi'] } },
      run: () => 'ok',
    }),
    defineCommand({
      name: 'config',
      description: 'configuration',
      commands: [defineCommand({ name: 'get', description: 'read one', options: { raw: { type: 'boolean' } }, run: () => 'ok' })],
    }),
  ],
});

interface Fig {
  name: string;
  description?: string;
  subcommands?: Fig[];
  options?: { name: string[]; description?: string; args?: { name: string; suggestions?: string[] } }[];
}

const spec = renderFigSpec(program) as Fig;

/** Every node of the spec, with the command path that reaches it. */
function nodes(at: Fig, path: string[] = []): { node: Fig; path: string[] }[] {
  return [{ node: at, path }, ...(at.subcommands ?? []).flatMap((c) => nodes(c, [...path, c.name]))];
}

const all = nodes(spec);
/** The reserved surfaces, which every program answers and no command declares. */
const RESERVED = new Set(['--json', '--help', '--version', '--explain', '--schema', '--mcp', '--config', '--no-config']);

describe('the Fig spec describes the program the parser runs', () => {
  it('names the program at the root, and reaches every command', () => {
    expect(spec.name).toBe('app');
    expect(all.map((n) => n.path.join(' ')).toSorted()).toEqual(['', 'config', 'config get', 'greet']);
  });

  it('gives every node a name and every option at least one spelling', () => {
    for (const { node, path } of all) {
      expect(node.name, `a node under "${path.join(' ')}" has no name`).toBeTruthy();
      for (const o of node.options ?? []) expect(o.name.length, `an option of "${node.name}" has no spelling`).toBeGreaterThan(0);
    }
  });

  it('offers no spelling twice within one command', () => {
    for (const { node } of all) {
      const spellings = (node.options ?? []).flatMap((o) => o.name);
      expect(new Set(spellings).size, `${node.name} offers a duplicate: ${spellings.join(' ')}`).toBe(spellings.length);
    }
  });

  it('gives args only to options that take one', () => {
    const greet = all.find((n) => n.node.name === 'greet')?.node;
    const byName = new Map((greet?.options ?? []).map((o) => [o.name.at(-1) ?? '', o]));
    expect(byName.get('--greeting')?.args).toMatchObject({ suggestions: ['Hello', 'Hi'] });
    expect(byName.get('--shout')?.args).toBeUndefined();
    expect(byName.get('--no-shout')?.args).toBeUndefined();
  });

  it('offers no flag the parser refuses', async () => {
    const greet = all.find((n) => n.node.name === 'greet')?.node;
    const flags = (greet?.options ?? []).flatMap((o) => o.name).filter((f) => f.startsWith('--') && !RESERVED.has(f));
    expect(flags).toContain('--no-shout');
    const runs = flags.map((flag) => runBurgee(program, { argv: flag === '--greeting' ? ['greet', flag, 'Hi'] : ['greet', flag] }).then((r) => ({ flag, r })));
    const results = await Promise.all(runs);
    for (const { flag, r } of results) {
      expect(r.code, `the Fig spec offers ${flag}, which the parser answers with ${String(r.code)}`).not.toBe(ExitCode.USAGE);
    }
  });
});
