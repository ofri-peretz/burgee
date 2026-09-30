/** burgee/yargs ÷ yargs: build a 21-option parser and `parseSync` a 31-token argv. */
import assert from 'node:assert/strict';

import byargs from 'burgee/yargs';
import yargs from 'yargs';

import { ARGV, BOOLEANS, NUMBERS, STRINGS } from './argv.mjs';

const parse = (Y) => {
  let q = Y(ARGV);
  for (const s of STRINGS) q = q.option(s, { type: 'string' });
  for (const n of NUMBERS) q = q.option(n, { type: 'number' });
  for (const b of BOOLEANS) q = q.option(b, { type: 'boolean' });
  return q.option('color', { type: 'boolean', default: true }).option('tag', { type: 'array', string: true }).parseSync();
};

export default {
  n: 15,
  check() {
    const a = parse(byargs);
    const b = parse(yargs);
    assert.deepEqual(a.tag, b.tag);
    assert.equal(a.port, b.port);
    assert.equal(a.dryRun, b.dryRun);
  },
  ours: () => parse(byargs),
  theirs: () => parse(yargs),
};
