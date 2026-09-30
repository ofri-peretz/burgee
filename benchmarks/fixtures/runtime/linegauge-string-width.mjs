/** linegauge ÷ string-width: the display width of 1,000 mixed lines. */
import assert from 'node:assert/strict';

import width from 'linegauge';
import stringWidth from 'string-width';

import { corpus } from './corpus.mjs';

const total = (fn) => {
  let t = 0;
  for (const s of corpus) t += fn(s);
  return t;
};

export default {
  n: 4,
  check() {
    for (const s of corpus.slice(0, 7)) assert.equal(width(s), stringWidth(s), s);
    assert.equal(total(width), total(stringWidth));
  },
  ours: () => total(width),
  theirs: () => total(stringWidth),
};
