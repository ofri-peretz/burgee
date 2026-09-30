/** flagstaff/log-update ÷ log-update: 1,000 three-line frames (one styled, one CJK) redrawn in place. */
import assert from 'node:assert/strict';

import { createLogUpdate as ours } from 'flagstaff/log-update';
import { createLogUpdate as theirs } from 'log-update';

import { FakeTTY } from './streams.mjs';

const FRAMES = 1000;
const frame = (i) => `line one ${String(i)}\n\u001B[32mline two\u001B[39m ${String(i)}\n日本語 line three ${String(i)}\n`;

const redraw = (log) => {
  for (let i = 0; i < FRAMES; i++) log(frame(i));
  return FRAMES;
};
const oursLog = ours(new FakeTTY());
const theirsLog = theirs(new FakeTTY());

export default {
  n: 4,
  check() {
    const a = new FakeTTY();
    const b = new FakeTTY();
    redraw(ours(a));
    redraw(theirs(b));
    assert.equal(a.bytes, b.bytes);
  },
  ours: () => redraw(oursLog),
  theirs: () => redraw(theirsLog),
};
