/**
 * controlroom R21 — `markdown`, streamed and committed a block at a time.
 *
 * The case the spec names is the property at the bottom: the fixture is cut at **every byte
 * offset**, each half decoded the way a byte stream is (a `TextDecoder` in streaming mode, so
 * a cut inside `é` or an emoji waits for the rest), and the blocks committed from the first
 * half must be the whole document's first blocks — never a block the finished document does
 * not have. Then the stream is finished and the committed blocks, and what a pipe printed,
 * must be the whole document's.
 */
import { flown } from 'roundel/policy';
import { describe, expect, it } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
import { markdown, markdownBlocks, type MarkdownState } from './markdown.js';

/** A reply the way a model writes one: every block kind, a blank line inside a fence, and non-ASCII. */
const REPLY = [
  '# Plan for the café ☕',
  '',
  'First, **read** the config — it lives in `config.json`, and *nothing* else writes it.',
  'A second line of the same paragraph, with snake_case_names left alone.',
  '- install the deps',
  '- run `npm test`',
  '  and read the output',
  '1. build',
  '2) ship 🚀',
  '',
  '```ts',
  "const x = '**not bold**';",
  '',
  'console.log(x);',
  '```',
  '## Done',
  'Nothing __else__ to do, _really_.',
  '~~~~',
  'a tilde fence, closed by a longer run',
  '~~~~~',
  '',
  '',
  'trailing paragraph without a newline at the end',
].join('\n');

/** A document drawn as a terminal frame. */
const draw = (text: string): string | undefined => markdown().frame?.(0, { text });

const pipe = () => {
  const out: string[] = [];
  const rt: Runtime = { env: {}, isTTY: { stdout: false }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock: manualClock() };
  return { rt, text: () => out.join('') };
};

describe('controlroom R21 · markdown blocks', () => {
  it('splits a reply into its blocks, each with its own source', () => {
    expect(markdownBlocks(REPLY, true).map((b) => [b.kind, b.source.split('\n').length])).toEqual([
      ['heading', 1],
      ['paragraph', 2],
      ['list', 5],
      ['code', 5],
      ['heading', 1],
      ['paragraph', 1],
      ['code', 3],
      ['paragraph', 1],
    ]);
  });

  it('commits nothing a later line could still change', () => {
    // The paragraph is open until a blank line, a heading, a fence or a list item closes it.
    expect(markdownBlocks('one\ntwo')).toEqual([]);
    expect(markdownBlocks('one\ntwo\n')).toEqual([]);
    expect(markdownBlocks('one\ntwo\n\n')).toEqual([{ kind: 'paragraph', source: 'one\ntwo', end: 7 }]);
    // A heading is a block as soon as its line is complete — and not before.
    expect(markdownBlocks('# Ti')).toEqual([]);
    expect(markdownBlocks('# Title\n')).toEqual([{ kind: 'heading', source: '# Title', end: 7 }]);
    // A fence is open until its closing line is complete, blank lines and all.
    expect(markdownBlocks('```\na\n\nb\n```')).toEqual([]);
    expect(markdownBlocks('```\na\n\nb\n```\n')).toHaveLength(1);
    // A run of a different character, or a shorter one, or one with text after it, does not close.
    expect(markdownBlocks('````\n```\n~~~~\n```` x\n')).toEqual([]);
  });

  it('done commits the last block, and an unclosed fence with it', () => {
    expect(markdownBlocks('one', true)).toEqual([{ kind: 'paragraph', source: 'one', end: 3 }]);
    expect(markdownBlocks('```\ncode', true)).toEqual([{ kind: 'code', source: '```\ncode', end: 8 }]);
    expect(markdownBlocks('', true)).toEqual([]);
    expect(markdownBlocks('\n\n', true)).toEqual([]);
  });

  it('a list item after a paragraph starts a list; a plain line after a list continues it', () => {
    expect(markdownBlocks('intro\n- a\nlazy\n- b\n', true).map((b) => b.source)).toEqual(['intro', '- a\nlazy\n- b']);
  });
});

describe('controlroom R21 · the markdown component', () => {
  it('the static projection is the source, up to the last committed block', () => {
    const md = markdown();
    expect(md.static({ text: '# Title\n\npara' })).toBe('# Title');
    expect(md.static({ text: '# Title\n\npara', done: true })).toBe('# Title\n\npara');
    expect(md.static({ text: REPLY, done: true })).toBe(REPLY);
    expect(md.static({ text: `${REPLY}\n\n`, done: true })).toBe(REPLY);
  });

  it('without colour, the frame is the source: no delimiter is dropped that nothing replaces', () => {
    const frame = markdown().frame?.(0, { text: '# Title\n\nsay **hi** to `x` and *you*\n- item' }) ?? '';
    expect(frame).toBe('# Title\n\nsay **hi** to `x` and *you*\n\n- item');
  });

  it('with colour, headings and strong are `heading`, emphasis `value`, code `command`, fences `muted`', () => {
    flown.level = 1;
    flown.paint = { heading: ['bold'], value: ['italic'], command: ['cyan'], muted: ['dim'] };
    try {
      expect(draw('## Title')).toBe('\u001B[1mTitle\u001B[22m');
      expect(draw('**a** __b__ *c* _d_ `e`')).toBe('\u001B[1ma\u001B[22m \u001B[1mb\u001B[22m \u001B[3mc\u001B[23m \u001B[3md\u001B[23m \u001B[36me\u001B[39m');
      // Intraword underscores, a lone star and an unclosed delimiter are text, not emphasis.
      expect(draw('snake_case_name, 2 * 3 and **open')).toBe('snake_case_name, 2 * 3 and **open');
      // A code span holds its delimiters' contents verbatim — no emphasis inside it.
      expect(draw('``a `b` **c**``')).toBe('\u001B[36ma `b` **c**\u001B[39m');
      // No highlighting inside a fence: every code line is one `command`, the fences muted.
      expect(draw('```ts\nconst a = 1;\n```')).toBe('\u001B[2m```ts\u001B[22m\n\u001B[36mconst a = 1;\u001B[39m\n\u001B[2m```\u001B[22m');
      expect(draw('```\nstill open')).toBe('\u001B[2m```\u001B[22m\n\u001B[36mstill open\u001B[39m');
    } finally {
      flown.level = 0;
      flown.paint = {};
    }
  });

  it('streamed a token at a time to a pipe, it prints each block’s source once, and the whole when done', () => {
    const w = pipe();
    const flag = hoist(markdown(), w.rt, { text: '' });
    for (let i = 1; i <= REPLY.length; i += 1) flag.update({ text: REPLY.slice(0, i) });
    flag.lower({ text: REPLY, done: true });
    expect(w.text()).toBe(`${REPLY}\n`);
    expect(w.text()).not.toMatch(/[\r\u001B]/);
  });
});

describe('controlroom R21 · a stream cut at every byte offset commits what the whole document commits', () => {
  const bytes = new TextEncoder().encode(REPLY);
  const whole = markdownBlocks(REPLY, true);

  it('the fixture is cut inside multi-byte characters, so the cut is really at every byte', () => {
    expect(bytes.length).toBeGreaterThan(REPLY.length);
  });

  it(`at each of the ${bytes.length + 1} offsets, the blocks committed early are the whole document’s, and finishing gives the rest`, () => {
    for (let cut = 0; cut <= bytes.length; cut += 1) {
      const decoder = new TextDecoder();
      const first = decoder.decode(bytes.subarray(0, cut), { stream: true });
      const early = markdownBlocks(first);
      expect(early, `cut at byte ${cut}`).toEqual(whole.slice(0, early.length));
      const text = first + decoder.decode(bytes.subarray(cut));
      expect(markdownBlocks(text, true), `cut at byte ${cut}`).toEqual(whole);

      // And what a pipe printed is the document, each block once, wherever the cut fell.
      const w = pipe();
      const flag = hoist(markdown(), w.rt, { text: first } satisfies MarkdownState);
      flag.update({ text });
      flag.lower({ text, done: true });
      expect(w.text(), `cut at byte ${cut}`).toBe(`${REPLY}\n`);
    }
  });
});
