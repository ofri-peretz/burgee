/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The absorption probe's vectors are right (`cli-foundation-stack` Y4).
 *
 * The probe reports how many vectors a builtin passes alone, and never gates on that. What
 * does gate is the other half: every layer passes every one of its own vectors. A vector the
 * layer fails is a wrong expectation or a broken layer, and either one makes the builtin's
 * count meaningless — a rising count would read as absorption when it was a typo.
 */
import { describe, expect, it } from 'vitest';

import { ask, type Probe, PROBES } from './absorption-probe';

describe('the absorption probe (cli-foundation-stack Y4)', () => {
  it.each(PROBES.map((p) => [p.layer, p] as const))('%s passes every one of its own vectors', (_layer, probe) => {
    const row = ask(probe);
    expect(row.vectors).toBeGreaterThan(0);
    expect(row.layerPasses).toBe(row.vectors);
    expect(row.builtinPasses).toBeLessThanOrEqual(row.vectors);
    expect(row.builtinMisses).toHaveLength(row.vectors - row.builtinPasses);
  });

  it('counts a vector the builtin gets wrong as a miss, and names its input', () => {
    const probe: Probe<string, string> = {
      layer: 'x',
      builtin: 'y',
      vectors: [
        { input: 'a', expected: 'A' },
        { input: 'b', expected: 'B' },
      ],
      viaLayer: (s) => s.toUpperCase(),
      viaBuiltin: (s) => (s === 'a' ? 'A' : s),
    };
    expect(ask(probe)).toEqual({ layer: 'x', builtin: 'y', vectors: 2, layerPasses: 2, builtinPasses: 1, builtinMisses: ['"b"'] });
  });
});
