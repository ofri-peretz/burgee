/**
 * R2, R3 — a whole command resolved in one pass.
 *
 * The cases that matter are the ones about *order* and *stopping*: `--interactive` asks
 * several things at once, and a person answering them needs the sequence to match the help
 * they just read; and a refusal has to stop the walk rather than collect six of them, since
 * the caller is about to exit and the first is the one they can act on.
 */
import { describe, expect, it } from 'vitest';

import { type Reader, type Writer } from './ask.js';
import { resolvePrompts, type PromptableOption } from './binding.js';
import { type Runtime } from './decide.js';

function io(lines: (string | undefined)[]): { reader: Reader; writer: Writer; transcript: () => string } {
  const out: string[] = [];
  let at = 0;
  return {
    reader: { line: () => Promise.resolve(at < lines.length ? lines[at++] : undefined) },
    writer: { write: (t: string) => out.push(t) },
    transcript: () => out.join(''),
  };
}

const tty: Runtime = { env: {}, isTTY: { stdin: true } };
const headless: Runtime = { env: {}, isTTY: { stdin: false } };

const OPTIONS: Record<string, PromptableOption> = {
  name: { required: true, prompt: { kind: 'text', message: 'Project name?' } },
  force: { prompt: { kind: 'confirm', message: 'Overwrite?' } },
  target: { required: true, prompt: { kind: 'select', message: 'Target?', choices: [{ value: 'node' }, { value: 'deno' }] } },
  quiet: {},
};

describe('R2 · only what has to be asked', () => {
  it('skips every option that already has a value', async () => {
    const world = io([]);
    const r = await resolvePrompts({ options: OPTIONS, values: { name: 'x', target: 'node' }, runtime: tty, io: world });
    expect(r.failure).toBeUndefined();
    expect(r.values).toEqual({ name: 'x', target: 'node' });
    expect(world.transcript()).toBe('');
  });

  it('asks the required ones and leaves the optional alone', async () => {
    const world = io(['demo', '1']);
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: tty, io: world });
    expect(r.values).toEqual({ name: 'demo', target: 'node' });
    expect(r.values['force']).toBeUndefined();
  });

  it('does not mutate the values it was given', async () => {
    const values = {};
    await resolvePrompts({ options: OPTIONS, values, runtime: tty, io: io(['demo', '1']) });
    expect(values).toEqual({});
  });
});

describe('R3 · order, and stopping', () => {
  it('asks in declaration order, which is the order the help listed', async () => {
    const world = io(['demo', 'y', '2']);
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: tty, flags: { interactive: true }, io: world });
    expect(r.values).toEqual({ name: 'demo', force: true, target: 'deno' });
    const asked = world.transcript();
    expect(asked.indexOf('Project name?')).toBeLessThan(asked.indexOf('Overwrite?'));
    expect(asked.indexOf('Overwrite?')).toBeLessThan(asked.indexOf('Target?'));
  });

  it('stops at the first refusal rather than collecting them', async () => {
    const world = io([]);
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: headless, io: world });
    expect(r.failure).toMatchObject({ option: 'name', code: 'USAGE' });
    expect(r.failure?.message).toContain('--name');
    expect(r.failure?.fix).toContain('Project name?');
    // Nothing was asked, and nothing after `name` was even considered.
    expect(world.transcript()).toBe('');
  });

  it('--yes answers the confirm and still asks for what it cannot invent', async () => {
    const world = io(['demo', '1']);
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: tty, flags: { yes: true, interactive: true }, io: world });
    expect(r.values).toEqual({ name: 'demo', force: true, target: 'node' });
    expect(world.transcript()).not.toContain('Overwrite?');
  });

  it('under --json it refuses without asking, whatever the terminal says', async () => {
    const world = io(['demo']);
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: tty, flags: { json: true }, io: world });
    expect(r.failure).toMatchObject({ option: 'name', code: 'USAGE' });
    expect(world.transcript()).toBe('');
  });
});

describe('R4 · cancelling', () => {
  it('reports the option it was cancelled at, and how to avoid the question', async () => {
    const world = io(['demo']); // answers `name`, then the stream ends at `target`
    const r = await resolvePrompts({ options: OPTIONS, values: {}, runtime: tty, io: world });
    expect(r.failure).toMatchObject({ option: 'target', code: 'CANCELLED' });
    expect(r.failure?.fix).toContain('--target');
    // What was answered before the cancellation is still returned, not discarded.
    expect(r.values['name']).toBe('demo');
  });
});

describe('a spec that cannot be drawn is a usage error, not an empty list', () => {
  it('names the option and says the spec is at fault', async () => {
    const options: Record<string, PromptableOption> = { pick: { required: true, prompt: { kind: 'select', message: 'Which?' } } };
    const r = await resolvePrompts({ options, values: {}, runtime: tty, io: io(['1']) });
    expect(r.failure).toMatchObject({ option: 'pick', code: 'USAGE' });
    expect(r.failure?.message).toContain('cannot be drawn');
    expect(r.failure?.fix).toContain('where the option is declared');
  });

  it('is caught before the terminal is even consulted', async () => {
    const options: Record<string, PromptableOption> = { pick: { required: true, prompt: { kind: 'select', message: 'Which?' } } };
    const world = io([]);
    const r = await resolvePrompts({ options, values: {}, runtime: headless, io: world });
    // Headless would also refuse — but the malformed spec is the more useful message.
    expect(r.failure?.message).toContain('cannot be drawn');
  });
});

describe('options with no prompt are left entirely alone', () => {
  it('never appears in the values it did not have', async () => {
    const r = await resolvePrompts({ options: { quiet: {} }, values: {}, runtime: headless, io: io([]) });
    expect(r).toEqual({ values: {} });
  });
});
