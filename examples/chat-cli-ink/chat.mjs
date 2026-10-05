#!/usr/bin/env node
/**
 * The chat boilerplate written for Ink (controlroom R22): the same app as `examples/chat-cli`, in
 * the shape of Claude Code, as an Ink program — `ink`, `react`, `ink-text-input` and
 * `ink-spinner`, with no build step (`React.createElement` instead of JSX). Its package.json
 * resolves `'ink'` to `controlroom/ink`, so this file runs unchanged on the drop-in: R17's proof
 * for a whole app, not just its components.
 *
 * Inline, as Ink draws: the transcript is `<Static>` and flows into the terminal's scrollback; a
 * live region under it holds the reply as it streams, a status line with a spinner, the elapsed
 * time and a token count, and the input line. Esc interrupts, Tab completes a slash command,
 * ↑ and ↓ walk the history, Ctrl+C quits. In a pipe it reads one prompt per stdin line and prints
 * the transcript alone. Ink has no structured output, so there is no `--json`; README.md says so.
 *
 * The model is scripted (`MODEL`), so it runs with no key and no network. Replace `MODEL` first.
 */
import { createInterface } from 'node:readline';

import { Box, render, Static, Text, useApp, useInput } from 'ink';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import React, { useEffect, useState } from 'react';

const h = React.createElement;

/** The scripted model: a reply in markdown, and the tool it asks to run first, if any. */
export const MODEL = {
  reply(prompt) {
    if (/\bfiles?\b/iu.test(prompt)) return { tool: 'ls', text: 'There are **three** files:\n\n- `chat.mjs`\n- `README.md`\n- `package.json`\n' };
    return { text: `You said: *${prompt}*.\n\nThis reply is **scripted**. Replace \`MODEL\` in \`chat.mjs\` with a real client.\n` };
  },
};

export const COMMANDS = { '/help': 'show the commands', '/clear': 'start a new conversation', '/exit': 'leave' };
export const TICK = 30;
const MS_PER_SECOND = 1000;
const HINTS = 'esc interrupt  ^C quit  / commands';
const NOTHING = () => undefined;

/** Time, injectable so a test can step it: `now()`, and `schedule(fn, ms)` returning a cancel. */
export const realClock = {
  now: () => Date.now(),
  schedule(fn, ms) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
};

/** Completion for the input line: the first slash command with this prefix. Add `@file` here. */
const complete = (value) => (value.startsWith('/') ? (Object.keys(COMMANDS).find((c) => c.startsWith(value)) ?? value) : value);

/**
 * The chat's behaviour, apart from how it is drawn: what each entry does, the streamed reply and
 * the tool prompt. `view` is told what to commit to the transcript and what the live region
 * shows; `leave` ends the program.
 */
export function conversation({ clock, view, leave }) {
  let busy = false;
  let pending; // a tool waiting for y/n
  let stop = NOTHING;
  let ended = false;
  let closed = false;
  let tokens = 0;
  const queue = [];

  /** Leave once: `/exit` and the end of piped input can both get here. */
  const finish = () => {
    if (closed) return;
    closed = true;
    leave();
  };

  const done = (reply) => {
    busy = false;
    stop = NOTHING;
    view.live({ reply: '', status: '' });
    view.commit(reply.trimEnd());
    drain();
  };

  const stream = (reply) => {
    busy = true;
    const started = clock.now();
    const words = reply.match(/\S+\s*/gu) ?? [];
    let shown = '';
    let cancel = NOTHING;
    const step = () => {
      const word = words.shift();
      if (word === undefined) return done(shown);
      shown += word;
      tokens += 1;
      view.live({ reply: shown, status: `thinking · ${((clock.now() - started) / MS_PER_SECOND).toFixed(1)}s · ${String(tokens)} tokens` });
      cancel = clock.schedule(step, TICK);
      return undefined;
    };
    stop = () => {
      cancel();
      done(`${shown}\n\n_(interrupted)_`);
    };
    cancel = clock.schedule(step, 0);
  };

  const submit = (entry) => {
    const prompt = entry.trim();
    if (pending !== undefined) {
      const { tool, reply } = pending;
      pending = undefined;
      if (/^y(es)?$/iu.test(prompt)) {
        view.commit(`⏺ ran ${tool}`);
        stream(reply);
      } else view.commit(`✗ ${tool} was not run`);
      return undefined;
    }
    if (prompt === '') return undefined;
    view.commit(`> ${prompt}`);
    if (prompt === '/exit') return finish();
    if (prompt === '/clear') {
      tokens = 0;
      return view.commit('(new conversation)');
    }
    if (prompt === '/help') return view.commit(Object.entries(COMMANDS).map(([c, what]) => `${c}  ${what}`).join('\n'));
    if (prompt.startsWith('/')) return view.commit(`unknown command ${prompt}; /help lists them`);
    const { tool, text } = MODEL.reply(prompt);
    if (tool !== undefined) {
      pending = { tool, reply: text };
      return view.commit(`Allow ${tool}? Type y or n.`);
    }
    return stream(text);
  };

  /** Entries that arrived while a reply streamed (a pipe delivers them all at once) take their turn. */
  function drain() {
    while (!busy && !closed && queue.length > 0) submit(queue.shift());
    if (!busy && !closed && queue.length === 0 && ended) finish();
  }

  return {
    enter(entry) {
      queue.push(entry);
      drain();
    },
    end() {
      ended = true;
      drain();
    },
    interrupt: () => stop(),
  };
}

/** The app: `<Static>` for the transcript, and the live region only for a person at a terminal. */
function Chat({ clock, interactive, lines }) {
  const { exit } = useApp();
  const [entries, setEntries] = useState([]);
  const [live, setLive] = useState({ reply: '', status: '' });
  const [value, setValue] = useState('');
  const [history, setHistory] = useState({ past: [], at: 0 });
  const [chat] = useState(() =>
    conversation({
      clock,
      view: { commit: (line) => setEntries((all) => [...all, line]), live: setLive },
      leave: () => setTimeout(exit, 0),
    }),
  );

  // A pipe: one prompt per line, and the end of stdin ends the program once the queue drains.
  useEffect(() => {
    if (lines === undefined) return undefined;
    lines.on('line', (line) => chat.enter(line));
    lines.on('close', () => chat.end());
    return () => lines.close();
  }, [chat, lines]);

  useInput(
    (_input, key) => {
      if (key.escape) chat.interrupt();
      if (key.tab) setValue((v) => complete(v));
      if (key.upArrow || key.downArrow) {
        const at = Math.min(history.past.length, Math.max(0, history.at + (key.upArrow ? -1 : 1)));
        setHistory({ ...history, at });
        setValue(history.past[at] ?? '');
      }
    },
    { isActive: interactive },
  );

  const submit = (entry) => {
    if (entry.trim() !== '') setHistory(({ past }) => ({ past: [...past, entry], at: past.length + 1 }));
    setValue('');
    chat.enter(entry);
  };

  const transcript = h(Static, { items: entries }, (entry, i) => h(Text, { key: i }, entry));
  if (!interactive) return transcript;
  return h(
    Box,
    { flexDirection: 'column' },
    transcript,
    live.reply === '' ? null : h(Text, null, live.reply),
    live.status === '' ? null : h(Text, { color: 'cyan' }, h(Spinner, { type: 'dots' }), ` ${live.status}`),
    h(Box, null, h(Text, { color: 'green' }, '> '), h(TextInput, { value, onChange: setValue, onSubmit: submit })),
    h(Text, { dimColor: true }, HINTS),
  );
}

/**
 * Run the chat on `io` (`stdin`, `stdout`, `stderr`, all optional), and resolve when the user
 * leaves or the piped input ends. A terminal gets the live region and the keys; anything else
 * reads stdin a line at a time and prints the transcript, so nothing waits for a key nobody can
 * press.
 */
export async function run(argv = [], { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, clock = realClock } = {}) {
  if (argv.includes('--json')) {
    stderr.write('chat-cli-ink: --json is not available: Ink has no structured output to project. examples/chat-cli, on the native API, writes NDJSON to stderr.\n');
    return 2;
  }
  const interactive = stdin.isTTY === true && stdout.isTTY === true;
  const lines = interactive ? undefined : createInterface({ input: stdin, terminal: false });
  // A pipe is read linearly, as a screen reader is: Ink's screen-reader output writes each
  // committed line once and never rewrites one, so the transcript has no escape sequences.
  const app = render(h(Chat, { clock, interactive, lines }), { stdin, stdout, stderr, isScreenReaderEnabled: !interactive, patchConsole: interactive });
  await app.waitUntilExit();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await run(process.argv.slice(2));
