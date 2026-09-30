/** burgee/commander ÷ commander: build a 21-option program and parse a 31-token argv. */
import assert from 'node:assert/strict';

import { Command as BCommand } from 'burgee/commander';
import { Command } from 'commander';

import { ARGV, BOOLEANS, NUMBERS, STRINGS } from './argv.mjs';

const program = (C) => {
  const p = new C();
  p.exitOverride().argument('[file]');
  for (const s of STRINGS) p.option(`--${s} <v>`, s);
  for (const n of NUMBERS) p.option(`--${n} <n>`, n, (v) => Number(v));
  for (const b of BOOLEANS) p.option(`--${b}`, b);
  p.option('--no-color', 'c');
  p.option('--tag <t...>', 'tags');
  p.action(() => undefined);
  p.parse(ARGV, { from: 'user' });
  return p.opts();
};

export default {
  n: 600,
  check() {
    assert.deepEqual(program(BCommand), program(Command));
  },
  ours: () => program(BCommand),
  theirs: () => program(Command),
};
