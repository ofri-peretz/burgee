/** linegauge/slice ÷ slice-ansi: columns 3..15 of 1,000 mixed lines — a table cell, a truncated row. */
import assert from 'node:assert/strict';

import slice from 'linegauge/slice';
import sliceAnsi from 'slice-ansi';

import { corpus } from './corpus.mjs';

const START = 3;
const END = 15;

const total = (fn) => {
  let t = 0;
  for (const s of corpus) t += fn(s, START, END).length;
  return t;
};

export default {
  n: 6,
  check() {
    for (const s of corpus.slice(0, 7)) assert.equal(slice(s, START, END), sliceAnsi(s, START, END), s);
  },
  ours: () => total(slice),
  theirs: () => total(sliceAnsi),
};
