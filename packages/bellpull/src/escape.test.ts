/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The injection suite. This is the one file in this package where a failure is a
 * vulnerability rather than a bug.
 *
 * ## How Windows escaping is tested from a Mac
 *
 * `escape.ts` exists for a platform this repository's CI does not run, so "it passed on
 * Windows" is not available as evidence and "it looks right" is not evidence at all. What is
 * available is that both of the parsers involved are **specified**, so both can be
 * simulated, and the escaping can be checked by round-trip:
 *
 *     argument → escapeArgument → [cmd.exe tokenizer] → [CommandLineToArgvW] → argument
 *
 * {@link cmdTokenize} and {@link argvParse} below are those two parsers, written from their
 * documented rules and not from `escape.ts`. If the round-trip returns what went in, the
 * argument survived both interpreters intact, which is the entire claim. If it returns
 * anything else — including *more than one* argument — that is an injection.
 *
 * ## Proving the check fails on the unfixed state
 *
 * `naiveQuote` is the fix a reader reaches for first and the one this repository already
 * wrote: wrap it in quotes, or hand the line to a shell. Every vector below is asserted to
 * **break** under it before it is asserted to survive under `escapeArgument`, so the test is
 * known to be able to fail rather than assumed to be.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { escapeArgument, escapeCommand } from './escape.js';
import { run } from './run.js';
import { type Runtime } from './runtime.js';

const WINDOWS = process.platform === 'win32';

/**
 * `cmd.exe`'s tokenizer, which runs first and knows nothing about quotes.
 *
 * Its rule for our purposes is one line: `^` escapes the next character, and every other
 * character is passed through — including the ones that would otherwise redirect, pipe or
 * separate commands. A `&` that is still live after this step is a command separator.
 */
function cmdTokenize(line: string): { text: string; live: string[] } {
  const SPECIAL = new Set(['&', '|', '<', '>', '(', ')', '%', '!', '^', '"', ',', ';', ' ']);
  let text = '';
  const live: string[] = [];
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i] as string;
    if (ch === '^') {
      // Escaped: the next character is data, whatever it is.
      i += 1;
      if (i < line.length) text += line[i];
      continue;
    }
    // Unescaped and special: cmd.exe would act on it. Quotes do not protect it here,
    // because this pass happens before anything is treated as a quoted string.
    if (SPECIAL.has(ch) && ch !== '"' && ch !== ' ') live.push(ch);
    text += ch;
  }
  return { text, live };
}

/**
 * `CommandLineToArgvW`, the parser every C-runtime program uses to turn one command line
 * back into an argv array. Microsoft's documented rules, and qntm's write-up of them:
 *
 *  - `"` toggles in/out of a quoted run and is not itself literal;
 *  - `2n` backslashes before a `"` are `n` backslashes and the quote toggles;
 *  - `2n+1` backslashes before a `"` are `n` backslashes and a **literal** quote;
 *  - backslashes not before a quote are literal;
 *  - whitespace outside quotes separates arguments.
 */
interface ArgvState {
  out: string[];
  current: string;
  quoted: boolean;
  started: boolean;
  backslashes: number;
}

/** Emit `n` or `n/2` backslashes, depending on whether a quote follows them. */
function flushBackslashes(state: ArgvState, halve: boolean): void {
  state.current += '\\'.repeat(halve ? Math.floor(state.backslashes / 2) : state.backslashes);
  state.backslashes = 0;
}

/** A quote: `2n` backslashes toggle it, `2n+1` make it literal. */
function takeQuote(state: ArgvState): void {
  const odd = state.backslashes % 2 === 1;
  flushBackslashes(state, true);
  state.started = true;
  if (odd) state.current += '"';
  else state.quoted = !state.quoted;
}

/** Unquoted whitespace ends the argument. */
function takeSeparator(state: ArgvState): void {
  if (state.started) state.out.push(state.current);
  state.current = '';
  state.started = false;
}

function argvParse(line: string): string[] {
  const state: ArgvState = { out: [], current: '', quoted: false, started: false, backslashes: 0 };

  for (const ch of line) {
    if (ch === '\\') {
      state.backslashes += 1;
      state.started = true;
      continue;
    }
    if (ch === '"') {
      takeQuote(state);
      continue;
    }
    flushBackslashes(state, false);
    if ((ch === ' ' || ch === '\t') && !state.quoted) {
      takeSeparator(state);
      continue;
    }
    state.started = true;
    state.current += ch;
  }
  flushBackslashes(state, false);
  if (state.started) state.out.push(state.current);
  return state.out;
}

/** The whole trip: what a callee's `argv` would hold, and what `cmd.exe` acted on. */
function roundTrip(argument: string): { argv: string[]; live: string[] } {
  const escaped = escapeArgument(argument);
  const { text, live } = cmdTokenize(escaped);
  return { argv: argvParse(text), live };
}

/**
 * The unfixed state: quote it and hope. This is what `shell: true` amounts to once Node has
 * joined the arguments into a command line, and it is the approach
 * `packages/burgee/src/shape.test.ts:25` currently takes for `npm.cmd`.
 */
const naiveQuote = (argument: string): string => `"${argument}"`;

function naiveRoundTrip(argument: string): { argv: string[]; live: string[] } {
  const { text, live } = cmdTokenize(naiveQuote(argument));
  return { argv: argvParse(text), live };
}

/**
 * The corpus. The first group is `cross-spawn`'s own
 * `should handle arguments with shell special chars`; the rest are the injection cases the
 * brief names — `&`, `|`, `"`, `^`, a newline — plus the backslash cases that are the
 * classic way to break out of a naive quoting scheme.
 */
const VECTORS: Record<string, string> = {
  'command separator': 'foo & calc',
  'background separator': 'foo && calc',
  pipe: 'foo | calc',
  'pipe inside quotes': '"foo|bar>baz"',
  'nested pipes and parens': '"(foo|bar>baz|foz)"',
  redirect: 'foo > owned.txt',
  'caret escape': 'foo ^& calc',
  'double caret': 'foo ^^& calc',
  'bare quote': 'say "hi"',
  'quote then separator': 'foo" & calc & "bar',
  'trailing backslash': 'bar\\',
  'trailing backslashes': 'bar\\\\\\',
  'backslash quote': 'a\\"b',
  'backslashes before quote': 'a\\\\\\"b',
  'escape the closing quote': 'foo\\',
  newline: 'foo\ncalc',
  'carriage return': 'foo\rcalc',
  'delayed expansion': 'foo !PATH! bar',
  'env expansion': '%PATH%',
  'for loop': 'foo %%i calc',
  parens: '()',
  brackets: '[]',
  'percent bang': '%!',
  'caret lt': '^<',
  'gt amp': '>&',
  'pipe semi': '|;',
  'comma space': ', ',
  'bang eq': '!=',
  'escaped star': '\\*',
  'quoted f': '"f"',
  'question dot': '?.',
  'eq backtick': '=`',
  'single quote': "'",
  'backslash quote pair': '\\"',
  'unicode with spaces': 'André Cruz',
  empty: '',
  'just a space': ' ',
};

describe('escapeArgument survives cmd.exe and then the argv parser', () => {
  it.each(Object.entries(VECTORS))('%s: comes back as exactly one argument, unchanged', (_name, argument) => {
    const { argv, live } = roundTrip(argument);
    // One argument in, one argument out. Two would mean the separator split it.
    expect(argv).toEqual([argument]);
    // Nothing reached cmd.exe as a live metacharacter, so nothing could be acted on.
    expect(live).toEqual([]);
  });
});

/**
 * The half that proves the assertions above can fail.
 *
 * Not every vector breaks under naive quoting — `()` and `[]` are harmless to the argv
 * parser, and asserting that they break would be asserting something false. What is asserted
 * is that the vectors *that carry an attack* break, and that the set is not empty.
 */
describe('the naive fix — quote it and hand it to a shell — is broken on these', () => {
  const DANGEROUS = [
    'command separator',
    'background separator',
    'pipe',
    'redirect',
    'quote then separator',
    'trailing backslash',
    'delayed expansion',
    'env expansion',
  ];
  it.each(DANGEROUS)('%s: naive quoting lets it through, escapeArgument does not', (name) => {
    const argument = VECTORS[name] as string;
    const naive = naiveRoundTrip(argument);
    const safe = roundTrip(argument);

    // The naive form either hands cmd.exe a live metacharacter or loses the argument's
    // shape. At least one of the two, or this vector is not dangerous and does not belong
    // in this list.
    const naiveIsBroken = naive.live.length > 0 || JSON.stringify(naive.argv) !== JSON.stringify([argument]);
    expect(naiveIsBroken, `${name} is in DANGEROUS but naive quoting handles it — remove it or the list is lying`).toBe(true);

    expect(safe.live).toEqual([]);
    expect(safe.argv).toEqual([argument]);
  });

  it('is not an empty list, so the contrast above is a real one', () => {
    expect(DANGEROUS.length).toBeGreaterThan(0);
  });
});

/**
 * A limit, named rather than claimed.
 *
 * `newline` was in the list above and this suite refused it: under the model here, naive
 * quoting handles a newline as well as the escaper does, so asserting that the escaper saves
 * you from one would have been asserting something nothing here can show.
 *
 * The reason is that **neither `cross-spawn` nor this port caret-escapes CR or LF** — the
 * metacharacter table both use is Rob van der Woude's, and it does not list them. Whether a
 * bare LF in a `cmd.exe` command line terminates the command is a property of `cmd.exe`,
 * this repository's CI does not run Windows, and a simulator written by the same person as
 * the escaper cannot settle it either way.
 *
 * So what is asserted is the part that *is* checkable — a newline survives the argv parser
 * as one argument — and the rest is written down as unverified, which is the honest state
 * until a Windows runner exists. On POSIX, where `run()` and the drop-in both pass an argv
 * array to `execve`, a newline is not special at all and the suite below proves it.
 */
describe('CR and LF: what is checked, and what is not', () => {
  it.each(['foo\ncalc', 'foo\rcalc'])('%j survives the argv parser as one argument', (argument) => {
    expect(argvParse(cmdTokenize(escapeArgument(argument)).text)).toEqual([argument]);
  });

  it('is not caret-escaped — the same as cross-spawn, and recorded as an unverified gap on Windows', () => {
    // Asserting the current behaviour rather than the desired one, so that a future change
    // to the metacharacter table has to come past this test and say why.
    expect(escapeArgument('a\nb')).not.toContain('^\n');
  });
});

describe('escapeCommand', () => {
  it('escapes metacharacters without quoting, because cmd.exe resolves the command first', () => {
    expect(escapeCommand('C:\\Program Files\\node.exe')).toBe('C:\\Program^ Files\\node.exe');
    expect(escapeCommand('foo&bar')).toBe('foo^&bar');
  });

  it('leaves a plain command alone', () => {
    expect(escapeCommand('node')).toBe('node');
  });
});

describe('a double-escaped argument survives two interpreters', () => {
  it.each(['foo & calc', '"(foo|bar>baz|foz)"', 'bar\\'])('%s through a node_modules/.bin cmd-shim', (argument) => {
    // A cmd-shim re-enters cmd.exe, so the caret pass is undone once on the way in. Tokenize
    // twice to model that, then parse.
    const once = cmdTokenize(escapeArgument(argument, true));
    expect(once.live).toEqual([]);
    const twice = cmdTokenize(once.text);
    expect(twice.live).toEqual([]);
    expect(argvParse(twice.text)).toEqual([argument]);
  });
});

/**
 * The argv array is the boundary, and a shell removes it — on **both** platforms.
 *
 * `spawn` without a shell takes an argv array straight to `execve` on POSIX, and on Windows
 * `escapeArgument` plus `windowsVerbatimArguments` rebuilds that array on the far side of
 * `cmd.exe`. Either way the argument is data. With `shell: true` it is text in a command
 * line, and this suite runs the injection to show that — because a default is only
 * load-bearing if the thing it refuses is actually exploitable.
 *
 * ## The half that used to be a lie on Windows
 *
 * This block was titled *"on POSIX the argv array is the boundary"* and ran unconditionally.
 * Its injection vector was `x; touch <marker>`, and on Windows there is no `touch` and `;`
 * is not a command separator, so the injection could not fire and the marker was never
 * created — `expected false to be true`. The claim was not wrong, it was untested: the shell
 * being demonstrated was `/bin/sh` and the runner was `cmd.exe`.
 *
 * A skip would have been the cheap fix. Windows escaping is the half of this package with no
 * end-to-end coverage at all, so the vector is written for each platform's own shell instead
 * and the claim is now graded on both.
 */
describe('the argv array is the boundary, and a shell removes it', () => {
  let dir: string;
  let echo: string;
  let marker: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bellpull-escape-'));
    echo = join(dir, 'echo-argv.mjs');
    marker = join(dir, 'OWNED');
    writeFileSync(echo, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
    chmodSync(echo, 0o755);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  /**
   * Vectors that mean something to the platform's own interpreter.
   *
   * `;` and `$(…)` are `sh`; `&` and `%…%` are `cmd.exe`. A vector that is inert in the shell
   * under test proves nothing about it, which is the trap this block just fell into.
   */
  const VERBATIM = WINDOWS
    ? ['foo & calc', 'foo | calc', 'foo > owned.txt', '%PATH%', 'foo^& calc', 'a"b', '*']
    : ['foo & calc', 'foo | calc', 'foo; calc', '$(calc)', '`calc`', 'foo\ncalc', "it's", 'a"b', '*'];

  it.each(VERBATIM)('%j arrives verbatim through an argv array', (argument) => {
    const out = execFileSync(process.execPath, [echo, argument], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual([argument]);
  });

  it('the same argument through a shell executes the injected command — which is why shell is off by default', () => {
    // `shell: true` is the unfixed state. This does not assert that bellpull is safe; it
    // asserts that the thing bellpull refuses to do by default is exploitable, so the default
    // is load-bearing rather than a preference.
    //
    // `&` separates commands for `cmd.exe` as `;` does for `sh`, and `type nul >` is how a
    // batch line creates an empty file where POSIX would reach for `touch`.
    const injected = WINDOWS ? `x & type nul > "${marker}"` : `x; touch ${marker}`;
    // eslint-disable-next-line node-security/detect-child-process -- the vulnerable call IS the assertion: this line exists to demonstrate that `shell: true` executes an injected command, which is the behaviour bellpull declines by default
    execFileSync(`"${process.execPath}" "${echo}"`, [injected], { shell: true, encoding: 'utf8' });
    expect(existsSync(marker), 'shell: true executed the injected command — this is the behaviour bellpull declines').toBe(true);
  });
});

/**
 * The same claim, end to end, through the path this package exists for: a `.cmd` on Windows.
 *
 * Everything above models `cmd.exe` and `CommandLineToArgvW` in TypeScript, which is the best
 * a Mac can do and is explicitly *not* evidence that the real interpreters agree. This block
 * is that evidence, and it can only ever run on a Windows runner.
 *
 * The fixture is a `node_modules/.bin/*.cmd` shim on purpose. That is the shape npm actually
 * installs, it forwards with `%*`, and a batch line is re-parsed by `cmd.exe` *after*
 * parameter substitution — which is precisely why `escapeArgument`'s caret pass runs twice
 * for this path and once for everything else. `isCmdShim` is the predicate that decides, and
 * until a Windows runner existed nothing had ever executed either branch of it.
 *
 * If this block is red, the finding is real and belongs in `issues.md`: it would mean the
 * single/double escaping split is wrong for the shape the whole npm ecosystem ships. That is
 * worth more than a green skip, which is why it is written rather than guarded away.
 */
describe.runIf(WINDOWS)('a hostile argument through a real cmd-shim on Windows', () => {
  let dir: string;
  let bin: string;
  let marker: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bellpull-cmdshim-'));
    bin = join(dir, 'node_modules', '.bin');
    marker = join(dir, 'OWNED');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'echo-argv.mjs'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
    // What npm writes: a batch file that re-invokes the interpreter and forwards `%*`.
    writeFileSync(join(bin, 'echo-argv.cmd'), '@echo off\r\nnode "%~dp0echo-argv.mjs" %*\r\n');
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const runtime = (): Runtime => ({
    platform: process.platform,
    env: { ...process.env, Path: `${bin}${delimiter}${process.env['PATH'] ?? ''}` },
    cwd: dir,
  });

  it.each(['foo & calc', '"(foo|bar>baz|foz)"', 'bar\\', '%PATH%', 'a b'])('%j survives two interpreters and comes back as one argument', async (argument) => {
    const result = await run('echo-argv', [argument], { runtime: runtime(), timeout: 30_000 });
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual([argument]);
  }, 60_000);

  it('an argument that would create a file does not create it', async () => {
    const injected = `x & type nul > "${marker}"`;
    const result = await run('echo-argv', [injected], { runtime: runtime(), timeout: 30_000 });
    expect(JSON.parse(result.stdout)).toEqual([injected]);
    expect(existsSync(marker), 'the injected command ran — escapeArgument did not hold across the shim').toBe(false);
  }, 60_000);
});

