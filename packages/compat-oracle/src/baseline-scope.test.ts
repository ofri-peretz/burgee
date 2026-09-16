/**
 * Lock — the baseline directory and `hosts.ts` must agree on which hosts publish a rate.
 *
 * `benchmarks/bands.ts` derives its compat band list by reading `baseline/`, so that
 * directory decides what the benchmark publishes, and `hosts.ts` decides what the oracle
 * grades. Those are two files, and between wave 2 and 2026-09-16 they disagreed: fragments
 * existed for `cosmiconfig` and `dotenv`, whose `status` is `planned`, so the benchmark
 * demanded grades the oracle never intended to produce, the compat axis failed closed, and
 * every compat band and claim read `? unmeasured` on every CI run. Nothing went red —
 * an axis that emits no records has no gate to fail.
 *
 * The `"planned": true` flag is what reconciles them, and a flag nothing checks is a
 * comment. Both directions are asserted, because both drift silently: a planned host that
 * loses its flag takes the axis down again, and a host promoted to `active` that keeps its
 * flag is graded into a rate nobody publishes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HOSTS } from './hosts.js';

const BASELINE = resolve(fileURLToPath(new URL('..', import.meta.url)), 'baseline');

const fragments = readdirSync(BASELINE)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f.slice(0, -'.json'.length), JSON.parse(readFileSync(join(BASELINE, f), 'utf8')) as { planned?: boolean }] as const);

const statusOf = (host: string): string | undefined => HOSTS.find((h) => h.name === host)?.status;

describe('baseline fragments and host status', () => {
  it('has fragments to check', () => {
    expect(fragments.length).toBeGreaterThan(0);
  });

  it.each(fragments)('%s: the flag says exactly what hosts.ts says', (host, fragment) => {
    // A fragment for a host `hosts.ts` does not name at all is its own bug, caught here
    // rather than silently treated as active.
    expect(statusOf(host), `baseline/${host}.json records a host hosts.ts does not declare`).toBeDefined();
    expect(fragment.planned === true, `baseline/${host}.json planned=${String(fragment.planned === true)} against hosts.ts status '${String(statusOf(host))}'`).toBe(statusOf(host) === 'planned');
  });
});
