/**
 * `--schema` drilled by argv (`schema-surface.ts`): which command `drilling` reads out of argv,
 * where `completion` is drilled into, the budget, and what `fieldOf` says when a step is missing.
 */
import { describe, expect, it } from 'vitest';

import { fieldOf, schemaSurface } from './schema-surface.js';

import { defineCommand, defineProgram } from './index.js';

const ok = (): string => 'ok';

const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({ name: 'go', description: 'go somewhere', effects: 'read_only', options: { name: { type: 'string' } }, run: ok }),
    defineCommand({ name: 'remote', commands: [defineCommand({ name: 'add', effects: 'read_only', run: ok })] }),
  ],
});

/** What `--schema` answers for `argv`, as the name it prints (or `program` for the whole document). */
async function drilled(argv: string[], manifest = program): Promise<string> {
  const doc = (await schemaSurface(manifest, argv)) as { name?: string; commands?: unknown };
  return doc.commands === undefined ? String(doc.name) : 'program';
}

/** The refusal `fn` threw, as message and hint. */
async function refused(fn: () => unknown): Promise<{ message: string; hint: string | undefined }> {
  try {
    await fn();
  } catch (error) {
    const { message, hint } = error as { message: string; hint?: string };
    return { message, hint };
  }
  throw new Error('nothing was refused');
}

describe('fieldOf', () => {
  it('names the command, then the steps walked, and the fields there', async () => {
    expect(await refused(() => fieldOf({ x: 1 }, 'y', 'go'))).toEqual({ message: '"go" has no field "y"', hint: 'fields here: x' });
    expect(await refused(() => fieldOf({ x: { z: 1 } }, 'x.y', 'go'))).toEqual({ message: '"x" has no field "y"', hint: 'fields here: z' });
    expect((await refused(() => fieldOf({ x: { y: {} } }, 'x.y.z', 'go'))).message).toBe('"x.y" has no field "z"');
  });

  it('does not step into an array by its index', async () => {
    expect(await refused(() => fieldOf({ a: [1] }, 'a.0', 'go'))).toEqual({ message: '"a" has no field "0"', hint: 'fields here: none — it is a value' });
  });
});

describe('schemaSurface reads the command out of argv', () => {
  it('takes the command wherever --schema stands, and nothing after --', async () => {
    expect(await drilled(['go', '--schema'])).toBe('go');
    expect(await drilled(['go', '--schema', '--', 'remote'])).toBe('go');
  });

  it('owns one token for --field=x and two for --field x', async () => {
    expect(await schemaSurface(program, ['--schema', '--field=name', 'go'])).toBe('go');
    expect(await schemaSurface(program, ['--schema', '--field', 'name', 'go'])).toBe('go');
    // The flag typed first owns its tokens too.
    expect(await schemaSurface(program, ['--field', 'name', 'go', '--schema'])).toBe('go');
  });

  it('refuses --field without a command, and names a nested one by its words', async () => {
    expect(await refused(() => schemaSurface(program, ['--schema', '--field', 'name']))).toEqual({
      message: '--field drills into one command',
      hint: 'name the command first: --schema <command> --field <path>',
    });
    expect((await refused(() => schemaSurface(program, ['remote', 'add', '--schema', '--field', 'nope']))).message).toBe('"remote add" has no field "nope"');
  });

  it('drills into the engine completion only as the one word completion', async () => {
    expect(await drilled(['completion', '--schema'])).toBe('completion');
    expect(await drilled(['nope', 'completion', '--schema'])).toBe('program');
    expect(await drilled(['completion', 'extra', '--schema'])).toBe('program');
    expect(await drilled(['nope', '--schema'])).toBe('program');
  });

  it("prints a program's own completion, not the engine's", async () => {
    const own = defineProgram({ name: 'app', commands: [defineCommand({ name: 'completion', description: 'mine', effects: 'read_only', run: ok })] });
    expect(await schemaSurface(own, ['completion', '--schema'])).toMatchObject({ name: 'completion', description: 'mine' });
  });

  it('summarises a program over 48,000 characters, and says the budget', async () => {
    const commands = Array.from({ length: 200 }, (_, i) => defineCommand({ name: `c${i}`, description: 'x'.repeat(300), effects: 'read_only', run: ok }));
    const big = defineProgram({ name: 'big', commands });
    expect(await schemaSurface(big, ['--schema'])).toMatchObject({ budget: 48_000 });
  });
});
