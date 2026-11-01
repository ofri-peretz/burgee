import { afterEach, describe, expect, it, vi } from 'vitest';

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

  it('rounds the seconds so far to the nearest second', () => {
    const { out, text } = sink(false);
    let t = 0;
    const p = startProgress(['progress'], out, () => t);
    t = 1500; // 1.5 s reads as 2; a divisor of 1001 would read it as 1
    p.phase('warm runs');
    p.stop();
    expect(text()).toBe('oxmutate: warm runs, 2 s\n');
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

  it('dots and a progress reporter among others turn it on too', () => {
    for (const reporters of [['dots'], ['json', 'progress-append-only']]) {
      const { out, text } = sink(false);
      startProgress(reporters, out, () => 0).phase('dry run');
      expect(text()).toBe('oxmutate: dry run, 0 s\n');
    }
  });

  it('counts seconds from the start, on the real clock by default', () => {
    const { out, text } = sink(false);
    let t = 5000;
    const p = startProgress(['ci'], out, () => t);
    t = 7000;
    p.phase('dry run');
    p.stop();
    const real = sink(false);
    startProgress(['ci'], real.out).phase('warm runs');
    expect(text() + real.text()).toBe('oxmutate: dry run, 2 s\noxmutate: warm runs, 0 s\n');
  });
});

describe('the progress ticker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ticks every ten seconds off a terminal, and not after stop', () => {
    vi.useFakeTimers();
    const { out, text } = sink(false);
    const p = startProgress(['ci'], out, () => Date.now());
    p.phase('mutants');
    vi.advanceTimersByTime(10_000);
    expect(text().split('\n')).toHaveLength(3);
    p.stop();
    vi.advanceTimersByTime(60_000);
    expect(text()).toBe('oxmutate: mutants, 0 s\noxmutate: mutants, 10 s\n');
  });

  it('never keeps the process alive', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const p = startProgress(['ci'], sink(false).out, () => 0);
    p.phase('mutants');
    const timer = spy.mock.results[0]?.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);
    p.stop();
  });
});
