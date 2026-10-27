/**
 * R1 — `promptFor`: a command's missing option or positional, asked for where a person is and
 * refused, naming how to pass it, where nobody is (R2, R6). The handler never sees a missing value.
 *
 * The context here is a literal of the shape burgee hands a handler; `scripts/prompt-exit-codes.test.ts`
 * runs the same wrapper through burgee's real engine, where the refusal reaches an exit code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Reader, type Writer } from './ask.js';
import { type PromptContext, promptFor, PromptRefusal } from './prompt-for.js';

/** The terminal `promptFor` opens when it is given none, faked: what was opened, written and closed. */
const terminal = vi.hoisted(() => ({ opened: 0, closed: 0, lines: [] as (string | undefined)[], written: [] as string[], stdinIsTTY: false }));
vi.mock('./terminal.js', () => ({
  createIo: () => {
    terminal.opened += 1;
    return {
      reader: { line: () => Promise.resolve(terminal.lines.shift()) },
      writer: { write: (text: string) => terminal.written.push(text) },
      close: () => {
        terminal.closed += 1;
      },
    };
  },
}));
vi.mock('./runtime.js', () => ({ promptStreams: () => ({ input: { isTTY: terminal.stdinIsTTY }, output: {} }) }));

afterEach(() => {
  Object.assign(terminal, { opened: 0, closed: 0, lines: [], written: [], stdinIsTTY: false });
});

function io(lines: (string | undefined)[]): { reader: Reader; writer: Writer; transcript: () => string } {
  const out: string[] = [];
  return {
    reader: { line: () => Promise.resolve(lines.shift()) },
    writer: { write: (t: string) => out.push(t) },
    transcript: () => out.join(''),
  };
}

/** A context as burgee builds one: a person at a terminal unless the case says otherwise. */
const ctx = (over: Partial<PromptContext> = {}): PromptContext => ({ options: {}, args: {}, positionals: [], env: {}, interactive: true, json: false, ...over });

/** A command that hands back what its handler was given. */
const greet = () => ({
  arguments: [{ name: 'name' }],
  options: { greeting: { type: 'string' }, dryRun: { type: 'boolean', required: true } },
  run: (c: PromptContext) => ({ options: c.options, args: c.args, positionals: c.positionals }),
});

const ASK_NAME = { kind: 'text', message: 'Who should I greet?' } as const;

describe('R1 · promptFor(command, name, spec) asks for what is missing, before the handler runs', () => {
  it('asks a person at a terminal for a missing positional, and the handler sees the answer by name and in place', async () => {
    const world = io(['ada']);
    const cmd = promptFor(greet(), 'name', ASK_NAME, { io: world });
    await expect(cmd.run(ctx({ options: { dryRun: false } }))).resolves.toEqual({ options: { dryRun: false }, args: { name: 'ada' }, positionals: ['ada'] });
    expect(world.transcript()).toContain('Who should I greet?');
  });

  it('asks for a missing required option the same way', async () => {
    const cmd = promptFor(greet(), 'dryRun', { kind: 'confirm', message: 'Dry run?' }, { io: io(['y']) });
    await expect(cmd.run(ctx({ args: { name: 'ada' }, positionals: ['ada'] }))).resolves.toMatchObject({ options: { dryRun: true } });
  });

  it('never asks for a value that came from anywhere, and hands the handler the context it was given', async () => {
    const world = io([]);
    const cmd = promptFor(greet(), 'name', ASK_NAME, { io: world });
    await expect(cmd.run(ctx({ args: { name: 'grace' }, positionals: ['grace'], options: { dryRun: true } }))).resolves.toEqual({ options: { dryRun: true }, args: { name: 'grace' }, positionals: ['grace'] });
    expect(world.transcript()).toBe('');
  });

  it('declares the prompt on the command it returns, and leaves the command it was given alone', () => {
    const original = greet();
    const cmd = promptFor(original, 'name', ASK_NAME);
    expect(cmd.arguments[0]).toEqual({ name: 'name', prompt: ASK_NAME });
    expect(original.arguments[0]).toEqual({ name: 'name' });
    const flagged = promptFor(original, 'greeting', { kind: 'text', message: 'Which word?' });
    expect(flagged.options.greeting).toEqual({ type: 'string', prompt: { kind: 'text', message: 'Which word?' } });
    expect(original.options.greeting).toEqual({ type: 'string' });
  });

  it('answers the second of two positionals in its own place, and leaves the first as typed', async () => {
    const copy = { arguments: [{ name: 'from' }, { name: 'to' }], run: (c: PromptContext) => ({ args: c.args, positionals: c.positionals }) };
    const cmd = promptFor(copy, 'to', { kind: 'path', message: 'Copy to?' }, { io: io(['b.txt']) });
    expect(cmd.arguments).toEqual([{ name: 'from' }, { name: 'to', prompt: { kind: 'path', message: 'Copy to?' } }]);
    await expect(cmd.run(ctx({ args: { from: 'a.txt' }, positionals: ['a.txt'] }))).resolves.toEqual({ args: { from: 'a.txt', to: 'b.txt' }, positionals: ['a.txt', 'b.txt'] });
  });

  it('keeps every prompt out of the JSON a host publishes — `--schema` is read by programs, which are never asked (R6)', () => {
    const cmd = promptFor({ ...greet(), options: { force: { type: 'boolean', prompt: { kind: 'confirm', message: 'Overwrite?' } } } }, 'name', ASK_NAME);
    expect(JSON.parse(JSON.stringify({ arguments: cmd.arguments, options: cmd.options }))).toEqual({ arguments: [{ name: 'name' }], options: { force: { type: 'boolean' } } });
    expect(cmd.options.force.prompt).toEqual({ kind: 'confirm', message: 'Overwrite?' });
  });

  it('refuses a name the command does not declare: a prompt cannot exist without an option', () => {
    expect(() => promptFor(greet(), 'nmae', ASK_NAME)).toThrow(/"nmae", which is neither an option nor a positional/u);
    expect(() => promptFor({ run: (c: PromptContext) => c }, 'x', ASK_NAME)).toThrow(/neither an option nor a positional/u);
  });

  it('wrapped twice, resolves both prompts and runs the handler once per run', async () => {
    let runs = 0;
    const base = { ...greet(), options: { greeting: { type: 'string', required: true } }, run: (c: PromptContext) => ((runs += 1), c.options) };
    const cmd = promptFor(promptFor(base, 'name', ASK_NAME), 'greeting', { kind: 'text', message: 'Which word?' }, { io: io(['Hi', 'ada']) });
    await expect(cmd.run(ctx({ options: { dryRun: true }, interactive: true }))).resolves.toEqual({ dryRun: true, greeting: 'Hi' });
    expect(await cmd.run(ctx({ options: { greeting: 'Yo' }, args: { name: 'a' }, positionals: ['a'] }))).toEqual({ greeting: 'Yo' });
    expect(runs).toBe(2);
  });

  it('returns a command with no handler as it came, with the prompt declared', () => {
    const group = { options: { a: { type: 'string' } } };
    expect(promptFor(group, 'a', ASK_NAME)).toEqual({ options: { a: { type: 'string', prompt: ASK_NAME } } });
    expect(promptFor(group)).toEqual(group);
  });
});

describe('R1 · promptFor(command) — the schema spelling: prompts declared where the option is', () => {
  it('resolves a `prompt:` the command already declares', async () => {
    const declared = { arguments: [{ name: 'name', prompt: ASK_NAME }], run: (c: PromptContext) => c.args };
    await expect(promptFor(declared, undefined, undefined, { io: io(['ada']) }).run(ctx())).resolves.toEqual({ name: 'ada' });
  });

  it('a positional that says it is optional is asked for only under --interactive', async () => {
    const optional = { arguments: [{ name: 'name', required: false, prompt: ASK_NAME }], options: { interactive: { type: 'boolean' } }, run: (c: PromptContext) => c.args };
    await expect(promptFor(optional, undefined, undefined, { io: io(['ada']) }).run(ctx())).resolves.toEqual({});
    await expect(promptFor(optional, undefined, undefined, { io: io(['ada']) }).run(ctx({ options: { interactive: true } }))).resolves.toEqual({ name: 'ada' });
  });

  it('--interactive=all asks an optional option too, and --yes answers a confirm without asking', async () => {
    const cmd = { options: { interactive: { type: 'string' }, yes: { type: 'boolean' }, force: { prompt: { kind: 'confirm', message: 'Overwrite?' } } }, run: (c: PromptContext) => c.options };
    await expect(promptFor(cmd, undefined, undefined, { io: io(['n']) }).run(ctx({ options: { interactive: 'all' } }))).resolves.toMatchObject({ force: false });
    const world = io([]);
    await expect(promptFor(cmd, undefined, undefined, { io: world }).run(ctx({ options: { yes: true }, interactive: false }))).resolves.toMatchObject({ force: true });
    expect(world.transcript()).toBe('');
  });
});

/** A handler that must not run. */
const never = (_c: PromptContext): never => {
  throw new Error('the handler ran');
};

describe('R2, R6 · nobody to ask is a refusal naming how to pass it, and the handler never runs', () => {

  it('no terminal: a USAGE refusal naming the positional as it is typed', async () => {
    const cmd = promptFor({ ...greet(), run: never }, 'name', ASK_NAME, { io: io([]) });
    const refused: unknown = await Promise.resolve(cmd.run(ctx({ interactive: false, options: { dryRun: true } }))).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(PromptRefusal);
    expect(refused).toMatchObject({ name: 'PromptRefusal', code: 'USAGE', option: 'name', message: '<name> is required when there is no terminal', fix: 'pass <name>; it would have been asked as "Who should I greet?"' });
  });

  it('names a camelCase option by the flag a person types', async () => {
    const cmd = promptFor({ ...greet(), run: never }, 'dryRun', { kind: 'confirm', message: 'Dry run?' }, { io: io([]) });
    await expect(cmd.run(ctx({ interactive: false, args: { name: 'a' } }))).rejects.toMatchObject({ code: 'USAGE', message: '--dry-run is required when there is no terminal' });
  });

  it('under --json — and so under an --mcp tool call — refuses even with a person at a terminal (R6)', async () => {
    const world = io(['ada']);
    const cmd = promptFor({ ...greet(), run: never }, 'name', ASK_NAME, { io: world });
    await expect(cmd.run(ctx({ json: true, options: { dryRun: true } }))).rejects.toMatchObject({ code: 'USAGE', message: '<name> is required under --json' });
    expect(world.transcript()).toBe('');
  });

  it('on a terminal that CI or an agent is driving, says nobody is there rather than that there is no terminal', async () => {
    terminal.stdinIsTTY = true;
    const cmd = promptFor({ ...greet(), run: never }, 'name', ASK_NAME, { io: io([]) });
    await expect(cmd.run(ctx({ interactive: false, env: { CI: 'true' }, options: { dryRun: true } }))).rejects.toMatchObject({ message: '<name> is required when nobody is there to answer' });
  });

  it('a host that handed over no terminal is believed, whatever the process’s own stdin is', async () => {
    terminal.stdinIsTTY = true;
    const cmd = promptFor({ ...greet(), run: never }, 'name', ASK_NAME, { io: io([]) });
    await expect(cmd.run(ctx({ interactive: false, options: { dryRun: true } }))).rejects.toMatchObject({ message: '<name> is required when there is no terminal' });
  });

  it('stops at the first: a missing option is refused before a positional is asked', async () => {
    const world = io(['ada']);
    const cmd = promptFor(promptFor({ ...greet(), run: never }, 'name', ASK_NAME), 'dryRun', { kind: 'confirm', message: 'Dry run?' }, { io: world });
    await expect(cmd.run(ctx({ json: true }))).rejects.toMatchObject({ option: 'dryRun' });
    expect(world.transcript()).toBe('');
  });

  it('a cancelled question is CANCELLED, naming how to skip it', async () => {
    const cmd = promptFor({ ...greet(), run: never }, 'name', ASK_NAME, { io: io([undefined]) });
    await expect(cmd.run(ctx({ options: { dryRun: true } }))).rejects.toMatchObject({ code: 'CANCELLED', message: 'cancelled at <name>', fix: 'pass <name> to skip the question' });
  });
});

describe('R4 · the terminal is opened only to ask, closed after, and handed to the exit path while open', () => {
  it('never opens a terminal when nothing is asked', async () => {
    await promptFor(greet(), 'name', ASK_NAME).run(ctx({ args: { name: 'ada' }, positionals: ['ada'] }));
    await Promise.resolve(promptFor(greet(), 'name', ASK_NAME).run(ctx({ interactive: false }))).catch(() => undefined);
    expect(terminal).toMatchObject({ opened: 0, written: [] });
  });

  it('opens one to ask, registers its close with the exit path, and releases both when done', async () => {
    terminal.lines = ['ada'];
    const onExit = vi.fn<(handler: () => void, label?: string) => () => void>();
    const released = vi.fn();
    onExit.mockReturnValue(released);
    await expect(promptFor(greet(), 'name', ASK_NAME).run(ctx({ options: { dryRun: true }, onExit }))).resolves.toMatchObject({ args: { name: 'ada' } });
    expect(terminal).toMatchObject({ opened: 1, closed: 1 });
    expect(onExit).toHaveBeenCalledWith(expect.any(Function), 'caique: give the terminal back');
    expect(released).toHaveBeenCalledTimes(1);
    // The handler the exit path holds is the terminal's close: a signal mid-question runs it.
    (onExit.mock.calls[0]?.[0] as () => void)();
    expect(terminal.closed).toBe(2);
  });

  it('closes the terminal before the handler runs: its work is not done with stdin still raw (interrupt.qnt)', async () => {
    terminal.lines = ['ada'];
    const seen = { ...greet(), run: (_c: PromptContext) => ({ closedBeforeRun: terminal.closed }) };
    await expect(promptFor(seen, 'name', ASK_NAME).run(ctx({ options: { dryRun: true } }))).resolves.toEqual({ closedBeforeRun: 1 });
    expect(terminal.closed).toBe(1);
  });

  it('a cancelled question ends its line, so the refusal does not start on the question’s', async () => {
    terminal.lines = [undefined];
    await expect(promptFor(greet(), 'name', ASK_NAME).run(ctx({ options: { dryRun: true } }))).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(terminal.written.join('')).toBe('Who should I greet? \n');
    expect(terminal.closed).toBe(1);
  });

  it('closes the terminal when the handler throws, and without an exit path to register with', async () => {
    terminal.lines = ['ada'];
    const boom = { ...greet(), run: (_c: PromptContext) => Promise.reject(new Error('boom')) };
    await expect(promptFor(boom, 'name', ASK_NAME).run(ctx({ options: { dryRun: true } }))).rejects.toThrow('boom');
    expect(terminal).toMatchObject({ opened: 1, closed: 1 });
  });
});
