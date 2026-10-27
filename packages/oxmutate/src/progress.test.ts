import { describe, expect, it } from 'vitest';

import { startProgress } from './progress.js';

const sink = (isTTY: boolean): { out: { write(s: string): void; isTTY: boolean }; text: () => string } => {
  const chunks: string[] = [];
  return { out: { write: (s) => void chunks.push(s), isTTY }, text: () => chunks.join('') };
};

describe('the progress reporters', () => {
  it('print nothing unless a progress reporter is named', () => {
    const { out, text } = sink(true);
    const p = startProgress(['clear-text', 'json'], out);
    p.phase('dry run');
    p.stop();
    expect(text()).toBe('');
  });

  it('append one line per tick off a terminal, with the phase, its detail and the seconds so far', () => {
    const { out, text } = sink(false);
    let t = 0;
    const p = startProgress(['progress'], out, () => t);
    p.phase('dry run');
    t = 3000;
    p.phase('warm runs', () => '12 of 40 mutants killed so far');
    p.stop();
    expect(text()).toBe('oxmutate: dry run, 0 s\noxmutate: warm runs, 12 of 40 mutants killed so far, 3 s\n');
  });

  it('rewrite one line on a terminal, and end it when the run stops', () => {
    const { out, text } = sink(true);
    const p = startProgress(['progress'], out, () => 0);
    p.phase('isolated runs');
    p.stop();
    expect(text()).toBe('\r\u001B[2Koxmutate: isolated runs, 0 s\n');
  });

  it('append on a terminal too for progress-append-only and ci, as Stryker does', () => {
    for (const reporter of ['progress-append-only', 'ci']) {
      const { out, text } = sink(true);
      const p = startProgress([reporter], out, () => 0);
      p.phase('dry run');
      p.stop();
      expect(text()).toBe('oxmutate: dry run, 0 s\n');
    }
  });
});
