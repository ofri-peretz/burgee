import { loadTraces } from 'oxmutate/spec';
import { expect, it } from 'vitest';

import { makeCounter } from './counter.js';

// Each model trace, step by step, against the real counter: the model's state is the oracle.
const traces = loadTraces('counter');
if (traces.length === 0) it.skip('replays the counter model (traces come from oxmutate)', () => {});
else
  it.each(traces)('replays $name', (trace) => {
    const c = makeCounter();
    for (const step of trace.steps.slice(1)) {
      if (step.action === 'inc') c.inc();
      else if (step.action === 'dec') c.dec();
      expect(c.value()).toBe(step.state['n']);
    }
  });
