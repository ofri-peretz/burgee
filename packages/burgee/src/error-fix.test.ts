/**
 * E3 — an error carries the exact thing to run next, not only advice about it.
 *
 * The requirement reads: *"Every error carries `code`, `message`, `hint`, and where possible
 * `fix`: **the exact command or flag to run next**."* burgee's design records it `Not built` —
 * the envelope was `{code, message, hint}`, and `hint` is prose.
 *
 * The distinction is the whole point, and it is sharpest for the caller this package exists
 * for. An agent can **execute** a `fix`. A `hint` it has to read, interpret, and guess at —
 * which is one more turn, and the turn where it invents a flag that does not exist. Every
 * *plugin* error in the family already carries `fix`; the engine's own did not.
 *
 * Written first, run against the unfixed tree; the failures are in the PR body.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute } from './execute.js';

const program = defineProgram({
  name: 'tool',
  version: '1.0.0',
  commands: [defineCommand({ name: 'deploy', effects: 'non_idempotent', options: { force: { type: 'boolean' }, dryRun: { type: 'boolean' } }, run: () => ({ ok: true }) })],
});

const failWith = async (argv: string[]): Promise<{ text: string; json: Record<string, unknown> | undefined }> => {
  const out: string[] = [];
  const err: string[] = [];
  await execute(program, { argv, env: {}, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, exit: () => undefined });
  const text = `${out.join('')}${err.join('')}`;
  // The failure envelope goes to **stdout**, where `--json` promises the envelope whether the
  // run worked or not; it was on stderr until D-140. `ok: false` is what keeps it from being
  // read as a result.
  let json: Record<string, unknown> | undefined;
  try {
    json = JSON.parse(out.join('')) as Record<string, unknown>;
  } catch {
    json = undefined;
  }
  return { text, json };
};

describe('an error says what to run, not only what went wrong', () => {
  it('carries the nearest declared flag as `fix` in the envelope', async () => {
    const { json } = await failWith(['deploy', '--forc', '--json']);
    const error = (json?.['error'] ?? {}) as Record<string, unknown>;
    expect(error['fix'], 'the exact flag, executable without interpretation').toBe('--force');
  });

  it('spells the fix as the flag is typed, never as the key it is declared under', async () => {
    // The candidates were the canonical keys, so a near miss on `--dry-run` was "fixed" to
    // `--dryRun`, which the parser refuses in turn: an agent that ran the fix failed twice.
    const { json } = await failWith(['deploy', '--dryrun', '--json']);
    expect(json?.['error']).toMatchObject({ fix: '--dry-run' });
  });

  it('keeps `hint` as the prose beside it — they are different things', async () => {
    const { json } = await failWith(['deploy', '--forc', '--json']);
    const error = (json?.['error'] ?? {}) as Record<string, unknown>;
    expect(error['hint'], 'advice a person reads').toMatch(/did you mean/);
    expect(error['fix'], 'and the thing a machine runs').toBe('--force');
    expect(error['fix']).not.toBe(error['hint']);
  });

  it('prints the fix for a person too', async () => {
    const { text } = await failWith(['deploy', '--forc']);
    expect(text).toContain('--force');
  });

  /**
   * `fix` is *where possible*, and a typo with no near match is where it is not. Inventing one
   * would be worse than omitting it: an agent that executes a guessed flag burns the turn the
   * field exists to save.
   */
  it('omits `fix` when there is nothing exact to offer', async () => {
    const { json } = await failWith(['deploy', '--zzzzzzzz', '--json']);
    const error = (json?.['error'] ?? {}) as Record<string, unknown>;
    expect(error['fix'], 'no near match, so no fix — never a guess').toBeUndefined();
    expect(error['hint'], 'but still advice').toBeDefined();
  });
});
