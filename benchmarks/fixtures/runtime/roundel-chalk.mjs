/** roundel/chalk ÷ chalk: 10k strings through a chain, a nested style, and a hex colour, at FORCE_COLOR=3. */
import assert from 'node:assert/strict';

import chalk from 'chalk';
import rchalk from 'roundel/chalk';

const WORDS = Array.from({ length: 10_000 }, (_, i) => `item ${String(i)}`);

const style = (c) => {
  let bytes = 0;
  for (const w of WORDS) bytes += c.red.bold(w).length + c.bgBlue.white(`${w} ${c.underline('u')}`).length + c.hex('#ff8800')(w).length;
  return bytes;
};

export default {
  n: 8,
  check() {
    assert.equal(rchalk.red.bold('x'), chalk.red.bold('x'));
    assert.ok(chalk.red('x').includes('\u001B['), 'FORCE_COLOR=3 must make both style, or this times the no-colour path');
    assert.equal(rchalk.hex('#ff8800')('x'), chalk.hex('#ff8800')('x'));
    assert.equal(rchalk.bgBlue.white(`a ${rchalk.underline('u')}`), chalk.bgBlue.white(`a ${chalk.underline('u')}`));
  },
  ours: () => style(rchalk),
  theirs: () => style(chalk),
};
