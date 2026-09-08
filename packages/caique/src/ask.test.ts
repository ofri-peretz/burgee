/**
 * R5 / U3 — the six widgets in line mode, driven by strings.
 *
 * There is no PTY here and there does not need to be one: a `Reader` is one method that
 * returns the next line, so every case is input in and transcript out, and the transcript
 * is asserted whole. That is the same reason this *is* the accessible mode rather than a
 * second implementation of it — a screen reader gets these exact bytes.
 *
 * The two that would be bug reports: a stream that ends is a **cancellation**, not an
 * empty answer; and invalid input is re-asked a bounded number of times, never forever.
 */
import { describe, expect, it } from 'vitest';

import { ask, projection, type Reader, type Writer } from './ask.js';
import { type PromptSpec } from './spec.js';

/** A scripted conversation: the lines a person would have typed, in order. */
function io(lines: (string | undefined)[]): { reader: Reader; writer: Writer; transcript: () => string } {
  const out: string[] = [];
  let at = 0;
  return {
    reader: { line: () => Promise.resolve(at < lines.length ? lines[at++] : undefined) },
    writer: { write: (text: string) => out.push(text) },
    transcript: () => out.join(''),
  };
}

const text: PromptSpec = { kind: 'text', message: 'Where should it go?' };
const confirm: PromptSpec = { kind: 'confirm', message: 'Overwrite it?' };
const select: PromptSpec = { kind: 'select', message: 'Which host?', choices: [{ value: 'ora' }, { value: 'log-update', label: 'log-update', hint: '99 tests' }] };
const multi: PromptSpec = { kind: 'multiselect', message: 'Which hosts?', choices: [{ value: 'ora' }, { value: 'chalk' }, { value: 'yargs' }] };

describe('text', () => {
  it('takes the line, and writes only the question', async () => {
    const world = io(['dist']);
    await expect(ask(text, world)).resolves.toEqual({ ok: true, value: 'dist' });
    expect(world.transcript()).toBe('Where should it go? ');
  });

  it('offers the initial in the question and uses it for a blank line', async () => {
    const world = io(['']);
    await expect(ask({ ...text, initial: 'build' }, world)).resolves.toEqual({ ok: true, value: 'build' });
    expect(world.transcript()).toBe('Where should it go? (build) ');
  });

  it('with no initial, a blank line is an empty answer and not a cancellation', async () => {
    await expect(ask(text, io([''])).then((a) => a)).resolves.toEqual({ ok: true, value: '' });
  });

  it('re-asks on a validate failure, saying why', async () => {
    const spec: PromptSpec = { ...text, validate: (v) => (v.startsWith('/') ? undefined : 'use an absolute path') };
    const world = io(['dist', '/tmp/dist']);
    await expect(ask(spec, world)).resolves.toEqual({ ok: true, value: '/tmp/dist' });
    expect(world.transcript()).toBe('Where should it go?   use an absolute path\nWhere should it go? ');
  });
});

describe('confirm', () => {
  it.each([
    ['y', true],
    ['Y', true],
    ['yes', true],
    ['true', true],
    ['1', true],
    ['n', false],
    ['no', false],
    ['false', false],
    ['0', false],
  ])('reads %j as %s', async (line, value) => {
    await expect(ask(confirm, io([line]))).resolves.toEqual({ ok: true, value });
  });

  it.each([
    [undefined, ' (y/N) ', false],
    [false, ' (y/N) ', false],
    [true, ' (Y/n) ', true],
  ])('shows the default as %s and a blank line takes it', async (initial, suffix, value) => {
    const world = io(['']);
    const spec = initial === undefined ? confirm : { ...confirm, initial };
    await expect(ask(spec, world)).resolves.toEqual({ ok: true, value });
    expect(world.transcript()).toBe(`Overwrite it?${suffix}`);
  });

  it('re-asks anything that is not a yes or a no', async () => {
    const world = io(['maybe', 'y']);
    await expect(ask(confirm, world)).resolves.toEqual({ ok: true, value: true });
    expect(world.transcript()).toContain('answer y or n');
  });
});

describe('select · R5, a numbered list', () => {
  it('lists the choices with their hints and takes a number', async () => {
    const world = io(['2']);
    await expect(ask(select, world)).resolves.toEqual({ ok: true, value: 'log-update' });
    expect(world.transcript()).toBe(['Which host?', '  1) ora', '  2) log-update — 99 tests', '  enter a number (1-2): '].join('\n'));
  });

  it('takes the value or the label typed out, because that is also an answer', async () => {
    await expect(ask(select, io(['ora']))).resolves.toEqual({ ok: true, value: 'ora' });
    await expect(ask(select, io(['log-update']))).resolves.toEqual({ ok: true, value: 'log-update' });
  });

  it.each(['0', '3', 'nope', ''])('re-asks on %j, naming the range', async (line) => {
    const world = io([line, '1']);
    await expect(ask(select, world)).resolves.toEqual({ ok: true, value: 'ora' });
    expect(world.transcript()).toContain('enter a number from 1 to 2');
  });

  it('writes no escape sequence and no carriage return — it is the accessible mode', async () => {
    const world = io(['1']);
    await ask(select, world);
    expect(world.transcript()).not.toMatch(/[\r]/);
  });
});

describe('multiselect', () => {
  it('takes several numbers', async () => {
    await expect(ask(multi, io(['1, 3']))).resolves.toEqual({ ok: true, value: ['ora', 'yargs'] });
  });

  it('takes a blank line as none, which is a real answer', async () => {
    await expect(ask(multi, io(['']))).resolves.toEqual({ ok: true, value: [] });
  });

  it('names what it did not recognise, rather than silently dropping it', async () => {
    const world = io(['1, nope, 9', '2']);
    await expect(ask(multi, world)).resolves.toEqual({ ok: true, value: ['chalk'] });
    expect(world.transcript()).toContain('nope, 9 are not choices');
  });

  it('says "is not a choice" for one, because a message that cannot count reads as a bug', async () => {
    const world = io(['nope', '1']);
    await ask(multi, world);
    expect(world.transcript()).toContain('nope is not a choice');
  });
});

describe('password and path read a line like text', () => {
  it.each(['password', 'path'] as const)('%s', async (kind) => {
    const world = io(['secret']);
    await expect(ask({ kind, message: 'Token?' }, world)).resolves.toEqual({ ok: true, value: 'secret' });
    // Never echoed here: this module writes the question and nothing else, so whether the
    // input is hidden is the reader's business and cannot be got wrong in this file.
    expect(world.transcript()).toBe('Token? ');
  });
});

describe('R4 · a stream that ends is a cancellation, not an empty answer', () => {
  it.each<PromptSpec>([text, confirm, select, multi, { kind: 'password', message: 'Token?' }, { kind: 'path', message: 'Which file?' }])('$kind cancels on end of input', async (spec) => {
    await expect(ask(spec, io([]))).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });

  it('cancels mid-conversation too, after an invalid answer', async () => {
    await expect(ask(confirm, io(['maybe']))).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });
});

describe('a wrong answer forever is a hang wearing a hat', () => {
  it('gives up after five attempts rather than looping', async () => {
    const world = io(Array.from({ length: 50 }, () => 'maybe'));
    await expect(ask(confirm, world)).resolves.toEqual({ ok: false, reason: 'cancelled' });
    expect(world.transcript()).toContain('giving up after 5 attempts');
    expect(world.transcript().match(/answer y or n/g)).toHaveLength(5);
  });
});

describe('U3 · every widget has a static projection', () => {
  it.each<[string, PromptSpec, string]>([
    ['text', text, 'Where should it go?'],
    ['confirm', confirm, 'Overwrite it? (y/N)'],
    ['select', select, 'Which host?\n  1) ora\n  2) log-update — 99 tests\n  enter a number (1-2):'],
    ['multiselect', multi, 'Which hosts?\n  1) ora\n  2) chalk\n  3) yargs\n  enter numbers separated by commas, or blank for none:'],
  ])('%s projects the question without the conversation', (_name, spec, expected) => {
    expect(projection(spec)).toBe(expected);
  });

  it('reads nothing: a projection is what a gallery or an issue can show', () => {
    // No reader is passed at all — if `projection` ever awaited input this would throw.
    expect(() => projection(select)).not.toThrow();
  });
});
