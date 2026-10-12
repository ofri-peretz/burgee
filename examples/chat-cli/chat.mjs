#!/usr/bin/env node
/**
 * A Claude-Code-class chat CLI on controlroom's native API (R22): an inline screen whose
 * transcript flows into the terminal's own scrollback, a reply streamed as markdown, slash
 * commands with completion, a permission prompt before a tool runs, a status line with a
 * spinner, the elapsed time and a token count, Esc to interrupt and Ctrl+C to quit. In a pipe it
 * reads one prompt per stdin line and prints clean lines; under --json, NDJSON on stderr.
 *
 * The model is scripted (`MODEL`), so the boilerplate runs with no key and no network. Replace
 * `MODEL` with your client first; README.md says what else to change.
 */
import { pathToFileURL } from 'node:url';

import { editor } from 'caique/editor';
import { hints, open, processRuntime } from 'controlroom';
import { markdown } from 'flagstaff/markdown';
import { spinner } from 'flagstaff/spinner';

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
const KEYMAP = { escape: 'interrupt' };
const MARKDOWN = markdown();
const LABELS = { interrupt: 'interrupt' };
const text = { name: 'text', static: (s) => s };
const NOTHING = () => undefined;

/** Completion for the input line: slash commands by prefix. Add `@file` completion here. */
const complete = (word) => (word.startsWith('/') ? Object.keys(COMMANDS).filter((c) => c.startsWith(word)) : []);

const LAYOUT = {
  direction: 'column',
  parts: [
    { size: 'fit', content: 'reply' },
    { size: 'fit', content: 'status' },
    { size: 'fit', content: 'prompt' },
    { size: 1, content: 'hints' },
  ],
};

/** Run the chat over `rt`, and resolve when the user leaves or the piped input ends. */
export function run(rt, argv = []) {
  return new Promise((resolve) => {
    let busy = false;
    let pending; // a tool waiting for y/n
    let stop = NOTHING;
    let ended = false;
    let tokens = 0;
    const queue = [];
    let closed = false;
    const finish = (screen) => {
      closed = true;
      screen.close();
      resolve();
    };
    const status = (screen, label) => screen.update('status', label === undefined ? { text: '', status: 'ok' } : { text: label, status: 'running' });

    const stream = (screen, reply) => {
      busy = true;
      const started = rt.clock.now();
      const words = reply.match(/\S+\s*/gu) ?? [];
      let shown = '';
      let cancel = NOTHING;
      const step = () => {
        const word = words.shift();
        if (word === undefined) return done(screen, shown);
        shown += word;
        tokens += 1;
        screen.update('reply', { text: shown });
        status(screen, `thinking · ${((rt.clock.now() - started) / MS_PER_SECOND).toFixed(1)}s · ${String(tokens)} tokens`);
        cancel = rt.clock.schedule(step, TICK);
        return undefined;
      };
      stop = () => {
        cancel();
        done(screen, `${shown}\n\n_(interrupted)_`);
      };
      cancel = rt.clock.schedule(step, 0);
    };

    const done = (screen, reply) => {
      busy = false;
      stop = NOTHING;
      screen.update('reply', { text: '', done: true });
      status(screen);
      // A terminal keeps the reply as it was drawn; a pipe and an agent get the markdown itself.
      screen.commit(screen.interactive ? MARKDOWN.frame(0, { text: reply, done: true }) : reply.trimEnd());
      drain(screen);
    };

    /** Entries that arrived while a reply streamed (a pipe delivers them all at once) take their turn. */
    const drain = (screen) => {
      while (!busy && !closed && queue.length > 0) submit(queue.shift(), screen);
      if (!busy && !closed && queue.length === 0 && ended) finish(screen);
    };

    const submit = (entry, screen) => {
      const prompt = entry.trim();
      if (pending !== undefined) {
        const { tool, reply } = pending;
        pending = undefined;
        if (/^y(es)?$/iu.test(prompt)) {
          screen.commit(`⏺ ran ${tool}`);
          stream(screen, reply);
        } else screen.commit(`✗ ${tool} was not run`);
        return;
      }
      if (prompt === '') return undefined;
      screen.commit(`> ${prompt}`);
      if (prompt === '/exit') return finish(screen);
      if (prompt === '/clear') {
        tokens = 0;
        return screen.commit('(new conversation)');
      }
      if (prompt === '/help') return screen.commit(Object.entries(COMMANDS).map(([c, what]) => `${c}  ${what}`).join('\n'));
      if (prompt.startsWith('/')) return screen.commit(`unknown command ${prompt}; /help lists them`);
      const { tool, text: reply } = MODEL.reply(prompt);
      if (tool !== undefined) {
        pending = { tool, reply };
        return screen.commit(`Allow ${tool}? Type y or n.`);
      }
      return stream(screen, reply);
    };

    open(rt, {
      json: argv.includes('--json'),
      layout: LAYOUT,
      keymap: KEYMAP,
      panes: {
        reply: { component: MARKDOWN, state: { text: '' }, liveOnly: true },
        status: { component: spinner(), state: { text: '', status: 'ok' }, liveOnly: true },
        hints: { component: text, state: `${hints(KEYMAP, LABELS)}  ^C quit  / commands`, liveOnly: true },
      },
      input: {
        editor: editor({ prompt: '> ', complete }),
        pane: 'prompt',
        onSubmit(entry, screen) {
          queue.push(entry);
          drain(screen);
        },
        onEnd(screen) {
          ended = true;
          drain(screen);
        },
      },
      onAction(action, screen) {
        if (action === 'interrupt') stop();
        if (action === 'quit') resolve();
        return screen;
      },
    });
  });
}

// `pathToFileURL`, not `file://` + argv[1]: on Windows the two spellings of the path never match.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await run(processRuntime(), process.argv.slice(2));
