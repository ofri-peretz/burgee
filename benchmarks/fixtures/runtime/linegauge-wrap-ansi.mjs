/** linegauge/wrap ÷ wrap-ansi: 1,000 lines at 20 columns, and one 2.5 KB paragraph hard-wrapped at 40. */
import assert from 'node:assert/strict';

import wrap from 'linegauge/wrap';
import wrapAnsi from 'wrap-ansi';

import { corpus, paragraph } from './corpus.mjs';

const COLUMNS = 20;
const PARAGRAPH_COLUMNS = 40;

const total = (fn) => {
  let t = 0;
  for (const s of corpus) t += fn(s, COLUMNS).length;
  return t + fn(paragraph, PARAGRAPH_COLUMNS, { hard: true }).length;
};

export default {
  n: 2,
  check() {
    for (const s of corpus.slice(0, 7)) assert.equal(wrap(s, COLUMNS), wrapAnsi(s, COLUMNS), s);
    assert.equal(wrap(paragraph, PARAGRAPH_COLUMNS, { hard: true }), wrapAnsi(paragraph, PARAGRAPH_COLUMNS, { hard: true }));
  },
  ours: () => total(wrap),
  theirs: () => total(wrapAnsi),
};
