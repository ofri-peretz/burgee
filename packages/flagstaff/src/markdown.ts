/**
 * Markdown as it streams in, as a component (controlroom R21): a chat reply arriving a token
 * at a time. Headings, lists, emphasis, inline code and fenced code — the shapes a model's
 * reply is made of. There is no syntax highlighting inside a fence (the controlroom intent
 * puts it out of scope), and HTML, tables, links and block quotes are drawn as written.
 *
 * **Committed a block at a time.** A block is committed once a later complete line closes it
 * — a blank line, a heading, a fence, a list item after a paragraph — or, for a fence, once
 * its closing fence line is complete. Only a complete line ever decides a commit, so a block
 * committed from a prefix of the stream is the block the whole document has: wherever the
 * stream is cut, the committed blocks are the same. `markdown.test.ts` holds that at every
 * byte offset of a fixture.
 *
 * **The static projection is the markdown's own source**, up to the end of the last committed
 * block, so a pipe, an agent or a screen reader gets each block's source once, as it commits,
 * and never half a line. `done: true` commits the rest.
 *
 * **On a terminal** the document so far is drawn through roundel's tokens: `heading` for
 * headings and strong text, `value` for emphasis, `command` for code, `muted` for a fence. A
 * delimiter is dropped only when the token that replaces it paints something, so with no
 * colour the frame is the source, which reads the same to a person as the styling would.
 */
import { command, heading, muted, value } from 'roundel/tokens';

import { type Component } from './plugin.js';

export interface MarkdownState {
  /** Everything the stream has produced so far. */
  text: string;
  /** The stream has ended: the last block is committed too. */
  done?: boolean;
}

export type MarkdownBlockKind = 'heading' | 'paragraph' | 'list' | 'code';

export interface MarkdownBlock {
  kind: MarkdownBlockKind;
  /** The block's source, its lines as they arrived. */
  source: string;
  /** Where the block's source ends in the stream: `text.slice(0, end)` is committed. */
  end: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}#{1,6}(?=[ \t]|$)/;
const BLANK = /^[ \t]*$/;
const ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]/;

interface Open {
  kind: MarkdownBlockKind;
  lines: string[];
  end: number;
  /** For a fence: the run that opened it, which a closing line must match or exceed. */
  fence: string;
}

/** Whether `line` closes a fence opened by `fence`: the same character, at least as many, nothing after. */
function closes(line: string, fence: string): boolean {
  const run = FENCE.exec(line)?.[1];
  return run !== undefined && run[0] === fence[0] && run.length >= fence.length && BLANK.test(line.slice(line.indexOf(run) + run.length));
}

/** The block a complete line starts, given the one still open; `undefined` when it continues that one. */
function starts(line: string, open: Open | undefined): MarkdownBlockKind | undefined {
  if (FENCE.test(line)) return 'code';
  if (HEADING.test(line)) return 'heading';
  if (ITEM.test(line)) return open?.kind === 'list' ? undefined : 'list';
  return open === undefined ? 'paragraph' : undefined;
}

/** A line added to the block it continues. */
function extend(open: Open, line: string, end: number): void {
  open.lines.push(line);
  open.end = end;
}

/** Complete lines in, committed blocks out; the one block still open is held until a line closes it. */
class Splitter {
  readonly committed: MarkdownBlock[] = [];
  #open: Open | undefined;

  commit(): void {
    const open = this.#open;
    if (open !== undefined) this.committed.push({ kind: open.kind, source: open.lines.join('\n'), end: open.end });
    this.#open = undefined;
  }

  /** One complete line, ending at `end` in the stream. */
  line(line: string, end: number): void {
    const open = this.#open;
    if (open?.kind === 'code') {
      extend(open, line, end);
      if (closes(line, open.fence)) this.commit();
      return;
    }
    if (BLANK.test(line)) {
      this.commit();
      return;
    }
    const kind = starts(line, open);
    if (kind === undefined) {
      extend(open as Open, line, end);
      return;
    }
    this.commit();
    const opened: Open = { kind, lines: [], end, fence: FENCE.exec(line)?.[1] ?? '' };
    this.#open = opened;
    extend(opened, line, end);
    if (kind === 'heading') this.commit();
  }
}

/**
 * The blocks committed so far. Only complete lines are read — a line is complete when a
 * newline follows it, or when the stream is `done` — which is what makes the answer the same
 * wherever the stream was cut.
 */
export function markdownBlocks(text: string, done = false): MarkdownBlock[] {
  const splitter = new Splitter();
  const lines = text.split('\n');
  // The last piece has no newline after it: it is a line only once the stream is done.
  if (!done || lines.at(-1) === '') lines.pop();
  let end = -1;
  for (const line of lines) {
    end += line.length + 1;
    splitter.line(line, end);
  }
  if (done) splitter.commit();
  return splitter.committed;
}

/** `paint(text)`, or `plain` when the paint changes nothing — the source stands in for the style. */
function styled(paint: (s: string) => string, text: string, plain: string): string {
  const painted = paint(text);
  return painted === text ? plain : painted;
}

/** Code spans, strong and emphasis; an underscore inside a word (`snake_case`) is not emphasis. */
const INLINE = /(?<ticks>`+)(?<code>[^`]|[^`][\s\S]*?[^`])\k<ticks>(?!`)|\*\*(?<strong>\S(?:.*?\S)?)\*\*|(?<!\w)__(?<strongU>\S(?:.*?\S)?)__(?!\w)|\*(?<em>[^\s*](?:.*?[^\s*])?)\*|(?<!\w)_(?<emU>[^\s_](?:.*?[^\s_])?)_(?!\w)/g;

/** One line's inline spans, drawn; everything else as written. */
function inline(line: string): string {
  let drawn = '';
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    const { code, strong, strongU, em, emU } = match.groups as Record<string, string | undefined>;
    let span: string;
    if (code !== undefined) span = styled(command, code, match[0]);
    else if ((strong ?? strongU) !== undefined) span = styled(heading, (strong ?? strongU) as string, match[0]);
    else span = styled(value, (em ?? emU) as string, match[0]);
    drawn += line.slice(at, match.index) + span;
    at = match.index + match[0].length;
  }
  return drawn + line.slice(at);
}

/** One block, drawn. */
function draw(block: MarkdownBlock): string {
  if (block.kind === 'heading') return styled(heading, block.source.slice((HEADING.exec(block.source) as RegExpExecArray)[0].length).trim(), block.source);
  const lines = block.source.split('\n');
  if (block.kind !== 'code') return lines.map(inline).join('\n');
  // The fences muted, the code between them `command` and untouched: no highlighting.
  const fence = (FENCE.exec(block.source) as RegExpExecArray)[1] as string;
  return lines.map((line, i) => (i === 0 || (i === lines.length - 1 && closes(line, fence)) ? muted(line) : command(line))).join('\n');
}

/** Markdown streamed in: its committed source off a terminal, the document so far drawn on one. */
export function markdown(): Component<MarkdownState> {
  return {
    name: 'markdown',
    static: ({ text, done }) => text.slice(0, markdownBlocks(text, done).at(-1)?.end ?? 0),
    frame: (_t, { text }) =>
      markdownBlocks(text, true)
        .map(draw)
        .join('\n\n'),
  };
}
