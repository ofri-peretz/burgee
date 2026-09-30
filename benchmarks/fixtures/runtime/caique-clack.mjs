/** caique/clack ÷ @clack/prompts: a text prompt typed and submitted, then a 20-option select moved down twice and submitted. */
import assert from 'node:assert/strict';

import { select, text } from '@clack/prompts';
import { select as cselect, text as ctext } from 'caique/clack';

import { ttyInput, ttyOutput } from './streams.mjs';

const OPTIONS = Array.from({ length: 20 }, (_, i) => ({ value: i, label: `opt ${String(i)}` }));
const DOWN = '\u001B[B';

/** Keystrokes one event-loop turn apart, the way a person's arrive. */
const type = (input, keys) => {
  const [key, ...rest] = keys;
  if (key === undefined) return;
  setImmediate(() => {
    input.write(key);
    type(input, rest);
  });
};

const clack = { select, text };
const cclack = { select: cselect, text: ctext };

async function session(lib) {
  const textIn = ttyInput();
  const name = lib.text({ message: 'Name?', input: textIn, output: ttyOutput() });
  type(textIn, ['hello', '\r']);
  const selectIn = ttyInput();
  const answer = await name;
  const pick = lib.select({ message: 'Pick', options: OPTIONS, input: selectIn, output: ttyOutput() });
  type(selectIn, [DOWN, DOWN, '\r']);
  return [answer, await pick];
}

export default {
  n: 25,
  async check() {
    assert.deepEqual(await session(cclack), ['hello', 2]);
    assert.deepEqual(await session(clack), ['hello', 2]);
  },
  ours: () => session(cclack),
  theirs: () => session(clack),
};
