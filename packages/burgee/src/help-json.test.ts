/**
 * F2 — `--help --json` is help *as data*, and the same data `--schema` publishes.
 *
 * The requirement is one sentence — *"`--help --json` prints help as data; text help is
 * rendered from that data"* — and it is the flag people type first. Before the branch existed
 * it printed the same prose as `--help`, so a caller who asked for a machine-readable answer
 * got one they had to parse, which is the exact failure the whole `--json` surface exists to
 * avoid.
 *
 * The audit carried this as `Not built` until 2026-09-22 and had been stale for some time — the
 * branch landed and nothing moved the row. This file is what stops that happening again: the
 * requirement now has a test of its own rather than a sentence in a table, which is the
 * difference between a claim and a check.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'f2',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'ship',
      description: 'send it',
      effects: 'non_idempotent',
      options: { force: { type: 'boolean', description: 'skip the checks' } },
      examples: [{ command: 'f2 ship --force', description: 'skip the checks' }],
      run: () => ({ ok: true }),
    }),
  ],
});

describe('`--help --json` is a document, not prose (F2)', () => {
  it('parses, and carries the schema version the reader keys on', async () => {
    const { stdout, code } = await runBurgee(program, { argv: ['--help', '--json'] });
    const doc = JSON.parse(stdout) as { schemaVersion: number; commands?: string[] };
    expect(code).toBe(0);
    expect(doc.schemaVersion, 'a document with no version is one a reader cannot key on').toBe(1);
    expect(doc.commands, 'the root document names its children so a reader can drill').toContain('ship');
  });

  it('is the same shape as `--schema`, scoped to one command', async () => {
    const help = JSON.parse((await runBurgee(program, { argv: ['ship', '--help', '--json'] })).stdout) as Record<string, unknown>;
    const schema = JSON.parse((await runBurgee(program, { argv: ['--schema'] })).stdout) as { commands?: Record<string, unknown>[] };
    const ship = (schema.commands ?? []).find((c) => c['name'] === 'ship');
    expect(ship, '`--schema` does not name the command `--help --json` just described').toBeDefined();
    // Not a deep equality: the help document adds `schemaVersion` and a `commands` list of
    // children, which is the scoping. Every key the two share has to agree, or there are two
    // document shapes in the package and a reader has to learn both.
    for (const key of Object.keys(ship ?? {})) {
      expect(help[key], `\`${key}\` differs between \`--help --json\` and \`--schema\``).toEqual((ship ?? {})[key]);
    }
  });

  it('prints prose without `--json`, so the flag is what changes the answer', async () => {
    const { stdout } = await runBurgee(program, { argv: ['--help'] });
    expect(() => JSON.parse(stdout), '`--help` alone must stay human-readable').toThrow();
    expect(stdout).toContain('ship');
  });
});
