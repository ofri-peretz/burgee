/**
 * Lock — a control band re-bases only on a recorded decision that names it.
 *
 * `rebase` in `.sdlc/bands/control-bands.json` drops a series' history before a deliberate step,
 * so it is as strong as widening the band and has to be as accountable. Each entry names a
 * decision file, and that file has to exist and say, in its own text, which band it re-bases and
 * at which observation. A re-base nobody wrote down is a band quietly emptied.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { type BandConfig } from './control-bands';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bands = (JSON.parse(readFileSync(join(ROOT, '.sdlc/bands/control-bands.json'), 'utf8')) as { bands: BandConfig[] }).bands;
const steps = bands.flatMap((band) => (band.rebase ?? []).map((step) => ({ band: band.id, ...step })));

/** `<YYYY-MM-DD>-<sha7>-ci`: the observation key a CI results document is recorded under. */
const CI_OBSERVATION = /^\d{4}-\d{2}-\d{2}-[0-9a-f]{7}-ci$/;

describe('every control-band re-base is a recorded decision (D-20261019-front-end-byte-steps-rebase-bands)', () => {
  it('finds the re-bases, so a broken reader cannot make this vacuous', () => {
    expect(steps.length).toBeGreaterThan(0);
  });

  it.each(steps)('$band at $from', ({ band, from, decision }) => {
    expect(from, 'a re-base names the CI observation the step was first measured at').toMatch(CI_OBSERVATION);
    const file = join(ROOT, '.sdlc/decisions', `${decision}.md`);
    expect(existsSync(file), `${decision} names no file in .sdlc/decisions`).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text, `${decision} does not name the band it re-bases`).toContain(band);
    expect(text, `${decision} does not name the observation ${from}`).toContain(from);
  });
});
