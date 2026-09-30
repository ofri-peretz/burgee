/** linegauge/strip ÷ strip-ansi: strip 1,000 mixed lines, most of which carry no escape at all. */
import assert from 'node:assert/strict';

import strip from 'linegauge/strip';
import stripAnsi from 'strip-ansi';

import { corpus } from './corpus.mjs';

const total = (fn) => {
  let t = 0;
  for (const s of corpus) t += fn(s).length;
  return t;
};

export default {
  n: 300,
  check() {
    for (const s of corpus.slice(0, 7)) assert.equal(strip(s), stripAnsi(s), s);
  },
  ours: () => total(strip),
  theirs: () => total(stripAnsi),
};
