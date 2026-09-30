/** bellpull/node-which ÷ which: `which.sync('node')` — found early on PATH, as it is on every machine that runs this. */
import assert from 'node:assert/strict';

import bwhich from 'bellpull/node-which';
import which from 'which';

const CALLS = 50;

const find = (w) => {
  let t = 0;
  for (let i = 0; i < CALLS; i++) t += w.sync('node').length;
  return t;
};

export default {
  n: 80,
  check() {
    assert.equal(bwhich.sync('node'), which.sync('node'));
  },
  ours: () => find(bwhich),
  theirs: () => find(which),
};
