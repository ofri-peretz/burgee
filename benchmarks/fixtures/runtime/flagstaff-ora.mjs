/** flagstaff/ora ÷ ora: 1,000 frames of a spinner whose text changes every frame, to a TTY. */
import assert from 'node:assert/strict';

import fora from 'flagstaff/ora';
import ora from 'ora';

import { FakeTTY } from './streams.mjs';

const FRAMES = 1000;
const spinner = (make) => make({ text: 'Loading things', stream: new FakeTTY(), isEnabled: true, spinner: 'dots' });
const ours = spinner(fora);
const theirs = spinner(ora);

const spin = (s) => {
  for (let i = 0; i < FRAMES; i++) {
    s.text = `Loading ${String(i)}`;
    s.render();
  }
  return FRAMES;
};

export default {
  n: 4,
  check() {
    assert.equal(spinner(fora).frame(), spinner(ora).frame());
  },
  ours: () => spin(ours),
  theirs: () => spin(theirs),
};
