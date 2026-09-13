/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * S2/S6 — the constraints between options reach `--schema`.
 *
 * `validate.ts` has enforced `relations` since the surface shipped and the schema never
 * published them, so the only way an agent could learn that `--csv` conflicts with
 * `--table` was to send both and read exit 2. Under E1 an exit 2 means *rewrite the
 * command*, which is exactly the instruction most likely to produce the same pair again.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { PREDICATE, schemaOf } from './schema.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'export',
      options: { csv: { type: 'boolean' }, table: { type: 'boolean' }, out: { type: 'string' }, force: { type: 'boolean' } },
      relations: [{ exactlyOneOf: ['csv', 'table'] }, { implies: ['out', 'force'] }],
      run: () => 'ok',
    }),
    defineCommand({ name: 'plain', options: { x: { type: 'string' } }, run: () => 'ok' }),
    // Declared and empty — the case that separates "omit when absent" from "omit when empty".
    defineCommand({ name: 'empty', options: { x: { type: 'string' } }, relations: [], run: () => 'ok' }),
  ],
});

const commandOf = (name: string) => schemaOf(program).commands.find((c) => c.name === name);

describe('relations reach the schema', () => {
  it('publishes what validate enforces', () => {
    expect(commandOf('export')?.relations).toEqual([{ exactlyOneOf: ['csv', 'table'] }, { implies: ['out', 'force'] }]);
  });

  it.each(['plain', 'empty'])('omits the key for %s, so silence is unambiguous', (name) => {
    // Present-but-empty would read as "no constraints"; absent reads as "none declared".
    // They mean the same thing here, and an absent key costs no bytes in every command
    // that has none — which is most of them.
    // `relations: []` is the same statement as no relations, and an empty array in every
    // command that has none is bytes an agent reads on every discovery.
    expect(commandOf(name)).not.toHaveProperty('relations');
  });

  it('survives the round trip an agent actually makes', async () => {
    const r = await runBurgee(program, { argv: ['export', '--schema'] });
    expect(JSON.parse(r.stdout)).toMatchObject({ relations: [{ exactlyOneOf: ['csv', 'table'] }, { implies: ['out', 'force'] }] });
  });
});

/** Hoisted: the predicate captures nothing, and the point is that it is a function. */
const isProd = (values: Record<string, unknown>): boolean => values['target'] === 'prod';

describe('a predicate cannot be published, and says so', () => {
  const withPredicate = defineProgram({
    name: 'app',
    commands: [
      defineCommand({
        name: 'deploy',
        options: { target: { type: 'string' }, approve: { type: 'boolean' } },
        relations: [{ implies: ['target', isProd] }],
        run: () => 'ok',
      }),
    ],
  });

  it('marks it rather than letting JSON turn it into null', () => {
    // The failure this prevents: `JSON.stringify` drops a function inside an array to
    // `null` without a word, handing an agent `["target", null]` — which reads as a
    // malformed constraint rather than an unevaluable one.
    const relations = schemaOf(withPredicate).commands[0]?.relations;
    expect(relations).toEqual([{ implies: ['target', PREDICATE] }]);
    expect(JSON.stringify(relations)).not.toContain('null');
  });

  it('the marker cannot collide with an option name', () => {
    // Option names are kebab identifiers; this one has parentheses.
    expect(PREDICATE).toMatch(/[()]/);
  });
});
