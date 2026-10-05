---
id: D-20261005-flagstaff-chat-widgets
subject: 'How flagstaff builds controlroom R21: what commits a markdown block, what each static projection is, and why neither chat widget is registered'
taken: Taken
date: '2026-10-05'
superseded_by: —
---

**A markdown block is committed only by a complete line, the static projection is the source
up to the last committed block, and `markdown` and `diff` are plain factories on their own
subpaths, with no registration.** Taken in the flagstaff lane of controlroom phase 0, under the
default in `.sdlc/DECISIONS.md`. Nothing here moves a ceiling or a published number.

## What commits a block

- A line is complete when a newline follows it, or when the state says `done`. Only a complete
  line is read. A blank line, a heading, a fence opening, or a list item after a paragraph
  closes the open block; a heading is a block on its own line; a fence is closed by a line of
  the same character, at least as long, with nothing after it.
- **Why that rule:** a commit decided by complete lines alone is prefix-stable. The block a
  prefix commits is the block the whole document has, however the stream was cut. The suite
  cuts a fixture (every block kind, a blank line inside a fence, and multi-byte characters) at
  every byte offset, decodes each half as a byte stream would, and holds both halves to it. It
  is proven red against a splitter that reads the unfinished last line.
- **The grammar is deliberately small:** headings, paragraphs, lists (one list until a blank
  line, with lazy continuation, and no separate list for a change of bullet), and fenced code.
  Block quotes, tables, HTML and setext headings are drawn as paragraphs of their source. The
  owner's list in R21 is the bar, and a CommonMark parser would be a dependency or a second
  product.

## What each static projection is

- **`markdown`:** `text.slice(0, end of the last committed block)`. It is the source, so a pipe
  prints each block's lines once, as the block commits, and never half a line. `done: true`
  commits the rest. Trailing blank lines are not printed, because they belong to no block.
- **`diff`:** the diff unchanged. One trailing newline is dropped in the projection only because
  the static writer ends every write with one, so a pipe's bytes are the diff's bytes.

## On a terminal

- **`markdown`** draws the document so far through roundel's tokens: `heading` for headings and
  strong text, `value` for emphasis, `command` for code spans and code lines, and `muted` for
  fences. A delimiter is dropped only when the token that replaces it paints something, so
  without colour the frame is the source. An underscore inside a word is not emphasis. There is
  no highlighting inside a fence.
- **`diff`** numbers lines by the hunk header's counts rather than by a line's first character,
  so a `--- a/file` header after a hunk is not read as a removal. A context line an editor
  stripped to nothing is still context.

## Not registered

R21 does not ask for registration, and registering at load would make each file a side effect
that must be listed in `sideEffects` (as `log-tail` and `tab-bar` are, under
D-20261005-flagstaff-frame-seam). Both reach no registry and no loop: 3,854 B and 1,644 B.
Registration can be added if controlroom's R10 needs to look either one up by name.
