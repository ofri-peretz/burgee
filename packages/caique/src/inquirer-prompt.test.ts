/**
 * `createPrompt`'s loop on the paths `inquirer-lifecycle.test.ts` does not take: every way a
 * prompt can settle (an answer, a cancel, an abort, Ctrl-C, a throwing view, a throwing
 * cleanup), both first-render timings, the file a missing-return error names, and the two
 * hooks this file owns — `usePrefix` and `useKeypress`.
 *
 * The streams are real: a `PassThrough` in, a recording `Writable` out, and readline between
 * them in terminal mode, so a keypress here is bytes decoded by `node:readline` exactly as a
 * person's would be.
 */
import { AsyncResource } from 'node:async_hooks';
import { resolve as resolvePath } from 'node:path';
import { PassThrough, Stream, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { runInThisContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { effectScheduler, type PromptReadline, withHooks } from './inquirer-hooks.js';
import { cursorLeft, cursorShow, cursorTo, eraseLines } from './inquirer-screen.js';
import {
  AbortPromptError,
  CancelPromptError,
  createPrompt,
  ExitPromptError,
  isEnterKey,
  type KeypressEvent,
  makeTheme,
  Separator,
  useEffect,
  useKeypress,
  usePrefix,
  useState,
} from './inquirer.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A recording output, and the text a person would read off it. */
function recorder(): Writable & { raw: () => string; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return Object.assign(stream, { raw: () => chunks.join(''), text: () => stripVTControlCharacters(chunks.join('')) });
}

function terminal(): { input: PassThrough; output: ReturnType<typeof recorder> } {
  return { input: new PassThrough(), output: recorder() };
}

const noop = (): void => undefined;

/** One turn of the event loop: long enough for the deferred first render and for keys to land. */
const turn = async (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

describe('Separator', () => {
  it('is fourteen box-drawing dashes by default, and an empty string keeps the default', () => {
    expect(new Separator().separator).toBe('─'.repeat(14));
    expect(new Separator('').separator).toBe('─'.repeat(14));
    expect(new Separator('-- or --').separator).toBe('-- or --');
    expect(new Separator().type).toBe('separator');
  });

  it('is recognised by shape, so a hand-built object literal counts and nothing else does', () => {
    expect(Separator.isSeparator(new Separator())).toBe(true);
    expect(Separator.isSeparator({ type: 'separator', separator: '----' })).toBe(true);
    for (const other of [undefined, null, 0, 'separator', {}, { type: 'choice' }]) expect(Separator.isSeparator(other)).toBe(false);
  });
});

/**
 * `usePrefix` mounted in a bare store, so fake timers can step the spinner without a prompt's
 * streams in the way. `status` is state, so a case can move the prefix through its lifecycle.
 */
function mountPrefix(initial: string | undefined, theme?: Parameters<typeof usePrefix>[0]['theme']): { prefix: () => string; setStatus: (status: string) => void; renders: () => number } {
  const rl = { input: new PassThrough() } as unknown as PromptReadline;
  let prefix = '';
  let renders = 0;
  let setStatus: (status: string) => void = noop;
  withHooks(rl, (cycle) => {
    cycle(() => {
      renders++;
      const [status, set] = useState<string | undefined>(initial);
      setStatus = AsyncResource.bind((next: string) => {
        set(next);
      });
      prefix = usePrefix({ ...(status === undefined ? {} : { status }), ...(theme === undefined ? {} : { theme }) });
      effectScheduler.run();
    });
  });
  return { prefix: () => prefix, setStatus, renders: () => renders };
}

describe('usePrefix', () => {
  const theme = { prefix: { idle: 'I', done: 'D' }, spinner: { interval: 50, frames: ['a', 'b', 'c'] } };

  it('draws the idle prefix when no status is given', () => {
    expect(mountPrefix(undefined, theme).prefix()).toBe('I');
    expect(stripVTControlCharacters(mountPrefix(undefined).prefix())).toBe('?');
  });

  it('draws the prefix of the status, and idle for a status the theme does not name', () => {
    expect(mountPrefix('done', theme).prefix()).toBe('D');
    expect(mountPrefix('custom', theme).prefix()).toBe('I');
    // A prototype-less prefix object replaces the defaults whole (see the theme's merge), so
    // it can leave no `idle` to fall back to — and then there is nothing to draw.
    const onlyDone = Object.assign(Object.create(null) as Record<string, string>, { done: 'D' });
    expect(mountPrefix('custom', { prefix: onlyDone }).prefix()).toBe('');
  });

  it('borrows idle while loading waits out its delay, even when the theme names a loading prefix', () => {
    vi.useFakeTimers();
    expect(mountPrefix('loading', { ...theme, prefix: { idle: 'I', loading: 'L' } }).prefix()).toBe('I');
  });

  it('draws a string prefix for every status', () => {
    expect(mountPrefix('done', { prefix: '>' }).prefix()).toBe('>');
    expect(mountPrefix('loading', { prefix: '>' }).prefix()).toBe('>');
  });

  it('shows no spinner for the first 300 ms of loading, then steps a frame per interval and wraps', () => {
    vi.useFakeTimers();
    const mounted = mountPrefix('loading', theme);
    expect(mounted.prefix()).toBe('I');
    vi.advanceTimersByTime(299);
    expect(mounted.prefix()).toBe('I');
    vi.advanceTimersByTime(1);
    expect(mounted.prefix()).toBe('a');
    vi.advanceTimersByTime(50);
    expect(mounted.prefix()).toBe('a');
    vi.advanceTimersByTime(50);
    expect(mounted.prefix()).toBe('b');
    vi.advanceTimersByTime(100);
    expect(mounted.prefix()).toBe('a');
  });

  it('stops the spinner and its timers when loading ends', () => {
    vi.useFakeTimers();
    const mounted = mountPrefix('loading', theme);
    vi.advanceTimersByTime(400);
    expect(mounted.prefix()).toBe('b');
    mounted.setStatus('done');
    expect(mounted.prefix()).toBe('D');
    const renders = mounted.renders();
    vi.advanceTimersByTime(1000);
    expect(mounted.renders()).toBe(renders);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws nothing for a spinner with no frames', () => {
    vi.useFakeTimers();
    const mounted = mountPrefix('loading', { ...theme, spinner: { interval: 50, frames: [] } });
    vi.advanceTimersByTime(300);
    expect(mounted.prefix()).toBe('');
  });

  it('reads the spinner from a theme built by makeTheme', () => {
    vi.useFakeTimers();
    const mounted = mountPrefix('loading', makeTheme({ spinner: { frames: ['x'] } }));
    vi.advanceTimersByTime(300);
    expect(mounted.prefix()).toBe('x');
  });
});

describe('useKeypress', () => {
  /** A password-shaped prompt: it draws once, and only Enter reaches it. */
  const secret = createPrompt<string, object>((_config, done) => {
    useKeypress((key) => {
      if (isEnterKey(key)) done('entered');
    });
    return '? password';
  });

  /** A one-line input prompt: letters append, Enter answers. */
  const typed = createPrompt<string, { message: string }>((config, done) => {
    const [value, setValue] = useState('');
    useKeypress((key, rl) => {
      if (isEnterKey(key)) done(value);
      else setValue(rl.line);
    });
    return `${config.message} ${value}`;
  });

  it('hands each keypress and the readline to the handler, with the latest state', async () => {
    const { input, output } = terminal();
    const answer = typed({ message: '? name' }, { input, output });
    await turn();
    input.write('ab');
    await turn();
    expect(output.text()).toContain('? name ab');
    input.write('\r');
    await expect(answer).resolves.toBe('ab');
    // Every keypress listener the prompt added — its handler and the cursor check — is gone.
    expect(input.listenerCount('keypress')).toBe(0);
  });

  it('stops calling a handler the moment the prompt settles, even for the key that settled it', async () => {
    const late = vi.fn<(key: KeypressEvent) => void>();
    const prompt = createPrompt<string, object>((_config, done) => {
      useKeypress((key) => {
        if (isEnterKey(key)) done('first');
      });
      useKeypress(late);
      return '? two handlers';
    });
    const { input, output } = terminal();
    const answer = prompt({}, { input, output });
    await turn();
    input.write('x');
    await turn();
    expect(late).toHaveBeenCalledTimes(1);
    // Both handlers are listening when Enter is emitted; the first settles the prompt, so the
    // second, already queued for the same emit, must not see it.
    input.write('\ry');
    await expect(answer).resolves.toBe('first');
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('never lets readline echo what is typed, before the first frame or after it: only the view draws', async () => {
    const { input, output } = terminal();
    const answer = secret({}, { input, output });
    // Typed before the deferred first render, while readline already owns the input.
    input.write('hun');
    await turn();
    input.write('ter2');
    await turn();
    input.write('\r');
    await expect(answer).resolves.toBe('entered');
    expect(output.text()).not.toMatch(/hun|ter2/);
  });

  it('puts the cursor back where readline moved it on the muted stream', async () => {
    const { input, output } = terminal();
    const answer = secret({}, { input, output });
    await turn();
    const drawn = output.raw().length;
    input.write('abc');
    await turn();
    // The view does not redraw on a letter, so this move is the cursor check's alone:
    // `? password` is ten columns of prompt, and each letter moves readline's cursor one on.
    expect(output.raw().slice(drawn)).toBe(cursorTo(11) + cursorTo(12) + cursorTo(13));
    answer.cancel();
    await expect(answer).rejects.toBeInstanceOf(CancelPromptError);
  });
});

describe('createPrompt settles', () => {
  it('with a value handed to done during the render, once the frame is drawn and its effects run', async () => {
    const cleanup = vi.fn();
    const prompt = createPrompt<number, object>((_config, done) => {
      useEffect(() => cleanup, []);
      done(7);
      return '? immediate';
    });
    const { input, output } = terminal();
    await expect(prompt({}, { input, output })).resolves.toBe(7);
    // Settling waits for the pass to finish, so the effect this render queued has run — and
    // so it is cleaned up. Settling mid-render would clean up first and leak the effect.
    expect(cleanup).toHaveBeenCalledTimes(1);
    // The answer stays on screen, the cursor comes back, and the caller's output is ended.
    // (`? immediate` is eleven columns, which is where readline reports the cursor.)
    const tail = `? immediate${cursorTo(11)}\n${cursorLeft}${cursorShow}`;
    expect(output.raw().slice(-tail.length)).toBe(tail);
    expect(output.writableEnded).toBe(true);
  });

  it('with a two-part view, drawing the bottom line below the prompt', async () => {
    const prompt = createPrompt<string, object>((_config, done) => {
      useEffect(() => {
        done('ok');
      }, []);
      return ['? top', 'bottom help'];
    });
    const { input, output } = terminal();
    await expect(prompt({}, { input, output })).resolves.toBe('ok');
    expect(output.text()).toContain('? top\nbottom help');
  });

  it('erasing the prompt when asked to clear it on done', async () => {
    const prompt = createPrompt<string, object>((_config, done) => {
      useEffect(() => {
        done('ok');
      }, []);
      return '? gone';
    });
    const { input, output } = terminal();
    await prompt({}, { input, output, clearPromptOnDone: true });
    expect(output.raw().endsWith(`${eraseLines(1)}${cursorLeft}${cursorShow}`)).toBe(true);
  });

  it('before rendering at all, when its signal is already aborted', async () => {
    const { input, output } = terminal();
    const view = vi.fn(() => '? never drawn');
    const answer = createPrompt<string, object>(view)({}, { input, output, signal: AbortSignal.abort() });
    await expect(answer).rejects.toBeInstanceOf(AbortPromptError);
    await turn();
    expect(view).not.toHaveBeenCalled();
    expect(output.text()).not.toContain('? never drawn');
  });

  it('by rejecting with CancelPromptError when the caller cancels', async () => {
    const { input, output } = terminal();
    const answer = createPrompt<string, object>(() => '? waiting')({}, { input, output });
    await turn();
    answer.cancel();
    await expect(answer).rejects.toThrow(new CancelPromptError());
  });

  it('by rejecting with AbortPromptError when its signal aborts later, carrying the reason', async () => {
    const { input, output } = terminal();
    const controller = new AbortController();
    const answer = createPrompt<string, object>(() => '? waiting')({}, { input, output, signal: controller.signal });
    await turn();
    const reason = new Error('took too long');
    controller.abort(reason);
    await expect(answer).rejects.toBeInstanceOf(AbortPromptError);
    await expect(answer).rejects.toHaveProperty('cause', reason);
  });

  it('by rejecting with ExitPromptError on Ctrl-C', async () => {
    const { input, output } = terminal();
    const answer = createPrompt<string, object>(() => '? waiting')({}, { input, output });
    await turn();
    input.write('\u0003');
    await expect(answer).rejects.toThrow(new ExitPromptError('User force closed the prompt with SIGINT'));
  });

  it('by rejecting with whatever the view throws', async () => {
    const broken = new Error('view broke');
    const { input, output } = terminal();
    const answer = createPrompt<string, object>(() => {
      throw broken;
    })({}, { input, output });
    await expect(answer).rejects.toBe(broken);
  });

  it('by rejecting with a throwing cleanup, which supersedes the answer', async () => {
    const cleanupError = new Error('cleanup broke');
    const prompt = createPrompt<string, object>((_config, done) => {
      useEffect(() => {
        done('never seen');
        return undefined;
      }, []);
      useEffect(
        () => () => {
          throw cleanupError;
        },
        [],
      );
      return '? cleanup';
    });
    const { input, output } = terminal();
    await expect(prompt({}, { input, output })).rejects.toBe(cleanupError);
  });

  it('never, when the input ends — but the effects are cleaned up so nothing keeps the process alive', async () => {
    const cleanup = vi.fn();
    const prompt = createPrompt<string, object>(() => {
      useEffect(() => cleanup, []);
      return '? eof';
    });
    const { input, output } = terminal();
    const answer = prompt({}, { input, output });
    await turn();
    input.end();
    await turn();
    expect(cleanup).toHaveBeenCalledTimes(1);
    answer.cancel();
    await expect(answer).rejects.toBeInstanceOf(CancelPromptError);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('createPrompt, first render', () => {
  /** A classic stream, as `@inquirer/testing` hands one in: no `readableFlowing` at all. */
  class ClassicInput extends Stream {
    readable = true;
    pause(): this {
      return this;
    }
    resume(): this {
      return this;
    }
  }

  it('is synchronous for a classic input, and a tick later for a modern one', async () => {
    const classic = { input: new ClassicInput(), output: recorder() };
    const now = createPrompt<string, object>(() => '? sync')({}, classic as never);
    expect(classic.output.text()).toContain('? sync');

    const modern = terminal();
    const later = createPrompt<string, object>(() => '? deferred')({}, modern);
    expect(modern.output.text()).not.toContain('? deferred');
    await turn();
    expect(modern.output.text()).toContain('? deferred');

    now.cancel();
    later.cancel();
    await expect(now).rejects.toBeInstanceOf(CancelPromptError);
    await expect(later).rejects.toBeInstanceOf(CancelPromptError);
  });

  it("uses the process's own streams when the caller passes none", async () => {
    const { input, output } = terminal();
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin);
    vi.spyOn(process, 'stdout', 'get').mockReturnValue(output as unknown as typeof process.stdout);
    const prompt = createPrompt<string, object>((_config, done) => {
      useKeypress((key) => {
        if (isEnterKey(key)) done('from stdin');
      });
      return '? on the process';
    });
    const answer = prompt({});
    await turn();
    input.write('\r');
    await expect(answer).resolves.toBe('from stdin');
    expect(output.text()).toContain('? on the process');
  });
});

/** A view that returns nothing, as a caller without Typescript can write. */
const nothing = (): string => undefined as unknown as string;

/** A prompt whose `createPrompt` call is written in a script named `filename`. */
function builtIn(filename: string): ReturnType<typeof createPrompt<string, object>> {
  const build = runInThisContext('(create, view) => create(view)', { filename }) as (create: typeof createPrompt, view: typeof nothing) => ReturnType<typeof createPrompt<string, object>>;
  return build(createPrompt, nothing);
}

/** The message a prompt built from `nothing` rejects with. */
async function messageOf(prompt: ReturnType<typeof createPrompt<string, object>>): Promise<string> {
  const { input, output } = terminal();
  const error = await prompt({}, { input, output }).then(
    () => new Error('resolved'),
    (reason: unknown) => reason as Error,
  );
  return error.message;
}

/**
 * The error a view gets for returning nothing names the file `createPrompt` was called from —
 * captured at construction, so each case builds its prompt from the place it names.
 */
describe('the file a missing-return error names', () => {
  it('is this test file, when the call is written here — and the stack hook is put back', async () => {
    const hook = Error.prepareStackTrace;
    const prompt = createPrompt<string, object>(nothing);
    expect(Error.prepareStackTrace).toBe(hook);
    const message = await messageOf(prompt);
    expect(message).toMatch(/^Prompt functions must return a string\.\n {4}at .*inquirer-prompt\.test\.ts$/);
  });

  it('resolves a relative file name against the working directory, and keeps a file:// URL as written', async () => {
    expect(await messageOf(builtIn('relative/caller.js'))).toBe(`Prompt functions must return a string.\n    at ${resolvePath('relative/caller.js')}`);
    expect(await messageOf(builtIn('file:///somewhere/caller.js'))).toBe('Prompt functions must return a string.\n    at file:///somewhere/caller.js');
  });

  it('is <unknown> when the caller has no file, as code built by new Function has none', async () => {
    // A fixed body built from a string literal, on purpose: it is the one way to get a caller
    // frame with no file name at all, which is the case under test.
    // eslint-disable-next-line node-security/detect-eval-with-expression
    const build = new Function('create', 'view', 'return create(view)') as (create: typeof createPrompt, view: typeof nothing) => ReturnType<typeof createPrompt<string, object>>;
    expect(await messageOf(build(createPrompt, nothing))).toBe('Prompt functions must return a string.\n    at <unknown>');
  });

  it('is <unknown> when the stack is too short to reach the caller', async () => {
    const limit = Error.stackTraceLimit;
    let prompt: ReturnType<typeof createPrompt<string, object>>;
    try {
      Error.stackTraceLimit = 2;
      prompt = createPrompt(nothing);
    } finally {
      Error.stackTraceLimit = limit;
    }
    expect(await messageOf(prompt)).toBe('Prompt functions must return a string.\n    at <unknown>');
  });

  it('is <unknown> when prepareStackTrace cannot be written, as under --frozen-intrinsics', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
    let prompt: ReturnType<typeof createPrompt<string, object>>;
    try {
      Object.defineProperty(Error, 'prepareStackTrace', { value: descriptor?.value, writable: false, configurable: true });
      prompt = createPrompt(nothing);
    } finally {
      if (descriptor === undefined) Reflect.deleteProperty(Error, 'prepareStackTrace');
      else Object.defineProperty(Error, 'prepareStackTrace', descriptor);
    }
    expect(await messageOf(prompt)).toBe('Prompt functions must return a string.\n    at <unknown>');
  });
});
