/**
 * F2 — `--help --json` is help as data.
 *
 * It printed the same prose as `--help`, so a caller who asked for a machine-readable answer
 * got one they had to parse — the exact failure the whole `--json` surface exists to avoid,
 * on the flag people type first. `.sdlc/intents/burgee/design.md` recorded it as `Not built`:
 * *"no JSON help surface; `--help --json` prints the same prose as `--help`."*
 *
 * Every case here was written first and run against the unfixed tree; their failures are in
 * the PR body.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute } from './execute.js';

const io = (): { out: string[]; opts: Parameters<typeof execute>[1] } => {
  const out: string[] = [];
  return { out, opts: { argv: [], env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => true }, exit: () => undefined } };
};

const program = defineProgram({
  name: 'tool',
  version: '1.0.0',
  commands: [
    defineCommand({
      name: 'deploy',
      description: 'Ship it',
      effects: 'non_idempotent',
      options: { force: { type: 'boolean', description: 'skip the prompt' } },
      arguments: [{ name: 'target', required: true }],
      run: () => ({ ok: true }),
    }),
    defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', run: () => ({}) })] }),
  ],
});

const helpJson = async (argv: string[]): Promise<Record<string, unknown>> => {
  const { out, opts } = io();
  await execute(program, { ...opts, argv });
  return JSON.parse(out.join('')) as Record<string, unknown>;
};

describe('--help --json', () => {
  it('is JSON, not prose — which is the whole defect', async () => {
    const { out, opts } = io();
    await execute(program, { ...opts, argv: ['deploy', '--help', '--json'] });
    expect(() => JSON.parse(out.join('')), 'the output must parse').not.toThrow();
  });

  it('describes the command the reader asked about', async () => {
    const doc = await helpJson(['deploy', '--help', '--json']);
    expect(doc['name']).toBe('deploy');
    expect(doc['description']).toBe('Ship it');
  });

  it('carries the options and arguments a caller would otherwise scrape out of the prose', async () => {
    const doc = await helpJson(['deploy', '--help', '--json']);
    expect(Object.keys((doc['options'] ?? {}) as object)).toContain('force');
    expect(JSON.stringify(doc['arguments'])).toContain('target');
  });

  /**
   * One document shape in the package, not a second one invented for help: this is
   * `commandSchemaOf`, which is what `--schema` publishes, scoped to one node.
   */
  it('is the same shape `--schema` publishes, so a reader learns it once', async () => {
    const doc = await helpJson(['deploy', '--help', '--json']);
    expect(doc['schemaVersion']).toBe(1);
    expect(doc, 'the keys --schema uses for a command').toHaveProperty('effects');
  });

  /**
   * `--help` on a group is a menu. Children are names only — a reader who wants a child's
   * detail asks for that child, which is the same walk they would do on the text help.
   */
  it('lists a group’s children by name', async () => {
    const doc = await helpJson(['config', '--help', '--json']);
    expect(doc['commands']).toEqual(['config get']);
  });

  it('leaves plain --help exactly as it was', async () => {
    const { out, opts } = io();
    await execute(program, { ...opts, argv: ['deploy', '--help'] });
    const text = out.join('');
    expect(() => JSON.parse(text), 'still prose').toThrow();
    expect(text).toContain('--force');
  });
});
