/** flagstaff/boxen ÷ boxen: 1,000 boxes with padding, margin, a round border, a title and centred text. */
import assert from 'node:assert/strict';

import boxen from 'boxen';
import fboxen from 'flagstaff/boxen';

const BOXES = 1000;
const OPTIONS = { padding: 1, margin: 1, borderStyle: 'round', title: 'Title', textAlignment: 'center' };

const draw = (box) => {
  let bytes = 0;
  for (let i = 0; i < BOXES; i++) bytes += box(`Hello ${String(i)}\nworld 日本`, OPTIONS).length;
  return bytes;
};

export default {
  n: 1,
  check() {
    assert.equal(fboxen('Hello\nworld 日本', OPTIONS), boxen('Hello\nworld 日本', OPTIONS));
    assert.equal(draw(fboxen), draw(boxen));
  },
  ours: () => draw(fboxen),
  theirs: () => draw(boxen),
};
