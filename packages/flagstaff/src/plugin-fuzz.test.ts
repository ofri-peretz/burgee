/**
 * `validate()` is the only place flagstaff eats a value it did not write: `register()` takes
 * `unknown`, and `flagstaff check <file>` (R8) hands it whatever a third party's plugin file
 * exported. The contract it owes the caller is not "accepts good plugins" — the example-based
 * cases in `plugin.test.ts` already lock that — it is **the refusal is always a `PluginError`
 * with a code and a fix**. A `TypeError` out of the schema walker reaches the CLI as a stack
 * trace with no `fix:` line, which is the one failure mode U3 exists to prevent.
 *
 * That is a property over all inputs, not over five of them, so it is checked with fast-check
 * against arbitrary JSON. Its own file: `register()` mutates a module-level registry, and
 * thousands of fuzzed registrations have no business in the registry the example cases read.
 *
 * This is also what answers OpenSSF Scorecard's Fuzzing check (alert #29) — the check reads
 * `fast-check` in the tree, and this is the target worth pointing it at.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PluginError, type PluginErrorCode, register } from './plugin.js';

const CODES: readonly PluginErrorCode[] = ['E_PLUGIN_SCHEMA', 'E_PLUGIN_CONTRACT', 'E_NO_STATIC_PROJECTION', 'E_NO_CONTRIBUTION'];

/** Deep enough to reach `checkArray`/`checkObject` recursion, shallow enough to stay fast. */
const anyJson = fc.jsonValue({ maxDepth: 4 });

/**
 * Plain JSON rarely lands on the interesting branches — `{name: string, spinners: {...}}` is
 * where the schema walker actually does work — so half the corpus is shaped like a plugin and
 * then corrupted. Every field is optional and every value is arbitrary: the shape is a hint to
 * the generator, not a guarantee to the code under test.
 */
const plugintish = fc.record(
  {
    name: fc.oneof(fc.string(), anyJson),
    contract: fc.oneof(fc.integer(), anyJson),
    glyphs: fc.dictionary(fc.string(), anyJson),
    spinners: fc.dictionary(fc.string(), fc.record({ frames: anyJson, interval: anyJson, static: anyJson }, { requiredKeys: [] })),
    borders: fc.dictionary(fc.string(), anyJson),
    components: fc.dictionary(fc.string(), anyJson),
    tokens: fc.dictionary(fc.string(), anyJson),
  },
  { requiredKeys: [] },
);

describe('R2/U3 · every refusal is a PluginError, whatever is handed in', () => {
  it('arbitrary input is registered or refused with a code and a fix — never an unhandled throw', () => {
    // A corpus that never reaches the catch would pass this forever while testing nothing.
    let refused = 0;
    fc.assert(
      fc.property(fc.oneof(anyJson, plugintish), (input) => {
        try {
          register(input);
        } catch (e) {
          refused += 1;
          // The assertion. An `expect` here would report the failing input as a vitest
          // diff; fast-check reports it as the shrunk counterexample, which is the one
          // worth reading.
          if (!(e instanceof PluginError)) throw e;
          expect(CODES).toContain(e.code);
          expect(e.fix).toBeTruthy();
        }
      }),
      { numRuns: 2000 },
    );
    expect(refused).toBeGreaterThan(0);
  });
});
