/** paratext ÷ ansi-escapes: what a redrawing CLI emits per frame — cursorTo, cursorMove, eraseLines(5), a link. */
import assert from 'node:assert/strict';

import ansiEscapes from 'ansi-escapes';
import paratext from 'paratext';

const CALLS = 10_000;
const COLUMNS = 80;
const ROWS = 24;

const frame = (lib) => {
  let bytes = 0;
  for (let i = 0; i < CALLS; i++) {
    bytes += lib.cursorTo(i % COLUMNS, i % ROWS).length + lib.cursorMove(1, -1).length + lib.eraseLines(5).length + lib.link(`x${String(i)}`, `https://e.com/${String(i)}`).length;
  }
  return bytes;
};

export default {
  n: 15,
  check() {
    assert.equal(paratext.cursorTo(3, 4), ansiEscapes.cursorTo(3, 4));
    assert.equal(paratext.eraseLines(5), ansiEscapes.eraseLines(5));
    assert.equal(paratext.link('a', 'https://e.com'), ansiEscapes.link('a', 'https://e.com'));
    assert.equal(frame(paratext), frame(ansiEscapes));
  },
  ours: () => frame(paratext),
  theirs: () => frame(ansiEscapes),
};
