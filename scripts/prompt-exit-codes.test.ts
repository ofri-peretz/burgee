/**
 * burgee P2 / P3, D-120 — a prompt that cannot be asked exits 2, one that was cancelled exits 4,
 * with no dependency edge between the packages: caique's `resolvePrompts` returns its refusal
 * as `{ code: 'USAGE' | 'CANCELLED', message, fix }`, a burgee handler throws it, and burgee
 * reads the code by name. This test is the only place the two meet, which is the point — the
 * contract is the shape, and the shape is proven here with each package's real code.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram, runCommand } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { resolvePrompts, type PromptableOption } from '../packages/caique/src/binding.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { type Runtime } from '../packages/caique/src/decide.js';

const OPTIONS: Record<string, PromptableOption> = {
  name: { required: true, prompt: { kind: 'text', message: 'Project name?' } },
  target: { required: true, prompt: { kind: 'select', message: 'Target?', choices: [{ value: 'node' }, { value: 'deno' }] } },
};

/** A program whose one command asks through caique, answered from `lines`, on `runtime`. */
function program(runtime: Runtime, lines: string[]): ReturnType<typeof defineProgram> {
  let at = 0;
  const io = { reader: { line: async () => (at < lines.length ? lines[at++] : undefined) }, writer: { write: () => undefined } };
  return defineProgram({
    name: 'init',
    commands: [
      defineCommand({
        name: 'new',
        effects: 'non_idempotent',
        run: async () => {
          const { failure, values } = await resolvePrompts({ options: OPTIONS, values: {}, runtime, io });
          if (failure !== undefined) throw failure;
          return values;
        },
      }),
    ],
  });
}

describe('a prompt refusal reaches an exit code by name (P2, P3)', () => {
  it('a question nobody can answer — no TTY — exits 2, naming the flag to pass instead', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: false } }, []), ['new']);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--name');
  });

  it('a cancelled question exits 4, never 1, with how to avoid it', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: true } }, ['demo']), ['new']);
    expect(r.code).toBe(4);
    expect(r.stderr).toContain('cancelled at --target');
    expect(r.stderr).toContain('fix: pass --target to skip the question');
  });

  it('carries the code into the JSON envelope an agent reads', async () => {
    const r = await runCommand(program({ env: {}, isTTY: { stdin: false } }, []), ['new', '--json']);
    // D-140: a failing `--json` run writes its one envelope to stdout.
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, error: { code: 2 } });
  });

  it('a string code outside the contract is not a claim: it stays a runtime failure', async () => {
    const odd = defineProgram({
      name: 'x',
      commands: [
        defineCommand({
          name: 'go',
          effects: 'read_only',
          run: () => {
            throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
          },
        }),
      ],
    });
    expect((await runCommand(odd, ['go'])).code).toBe(1);
  });
});
