/**
 * Lock — the capability-parity stack cannot be padded.
 *
 * `bundled-bytes-ratio-parity` is the most flattering number this suite publishes: `burgee`
 * reads 2.636 against `cac` alone and **0.282** against `cac` plus the three packages a user
 * of `cac` installs to reach the same capability set. A number that good has to be harder to
 * write than the number it replaces, or it is marketing with a `.ts` extension.
 *
 * So `PARITY` carries one rule and this file enforces it: **an incumbent may be added to a
 * stack only where this repository publishes a graded drop-in for it** — a `compat-oracle`
 * row with `status: 'active'`, which means that package's own test suite runs against our
 * replacement and a pass rate is published. That is evidence we do the job. Resemblance is
 * not, and neither is a sentence in a doc comment.
 *
 * The rule is deliberately self-limiting. It admits `cosmiconfig`, `exit-hook` and
 * `restore-cursor`, and it would refuse `commander` padding its own stack with, say, `yargs`
 * — and it refuses, today, every capability we have that no incumbent packages up. Those are
 * listed in `unmatched` and priced at **zero**, which is the honest place to put them.
 */
import { HOSTS } from 'compat-oracle/hosts';
import { describe, expect, it } from 'vitest';

import { DEFAULT_EXPORT, PAIRS, PARITY } from './fixtures/entry-points.js';

const active = new Set(HOSTS.filter((h) => h.status === 'active').map((h) => h.name));

describe('the capability-parity stack', () => {
  it('names a pair that exists, so a stack cannot be measured against nothing', () => {
    const ids = new Set(PAIRS.map((p) => p.id));
    for (const stack of PARITY) expect(ids, `PARITY names ${stack.id}, which is not an entry pair`).toContain(stack.id);
  });

  const additions = PARITY.flatMap((stack) => stack.adds.map((add) => [stack.id, add] as const));

  it.each(additions)('%s adds a package we publish a graded drop-in for', (_id, add) => {
    expect(
      active.has(add.specifier),
      `\`${add.specifier}\` is in a parity stack but is not an active compat-oracle host. The rule is that an ` +
        `addition has to be a package whose own suite runs against our replacement and publishes a pass rate — ` +
        `without that, the stack is a list of things we say we do, and the ratio it produces is worth nothing.`,
    ).toBe(true);
  });

  it.each(additions)('%s names the drop-in that grades it, and the capability it buys', (_id, add) => {
    expect(add.gradedBy, `${add.specifier} must name our drop-in subpath`).toMatch(/^[a-z-]+\/[a-z-]+$/);
    expect(add.gradedBy.split('/')[1], `${add.gradedBy} must be the drop-in for ${add.specifier}`).toBe(add.specifier);
    expect(add.capability.length, `${add.specifier} must say what it buys, in the words of the thing it buys`).toBeGreaterThan(20);
  });

  it('adds nothing twice to one stack', () => {
    for (const stack of PARITY) {
      const names = stack.adds.map((a) => a.specifier);
      expect(new Set(names).size, `${stack.id} lists a package twice, which would count it twice`).toBe(names.length);
    }
  });

  it('never adds the incumbent to its own stack', () => {
    for (const stack of PARITY) {
      const pair = PAIRS.find((p) => p.id === stack.id);
      expect(stack.adds.some((a) => a.specifier === pair?.incumbent.specifier), `${stack.id} adds its own incumbent`).toBe(false);
    }
  });

  it('prices the unmatched capabilities at zero, and says what they are', () => {
    for (const stack of PARITY) {
      expect(stack.unmatched.length, `${stack.id} claims no unmatched capability — if that is true, delete the field`).toBeGreaterThan(0);
      for (const line of stack.unmatched) expect(line.length, `${stack.id} has an unmatched entry too short to mean anything`).toBeGreaterThan(15);
    }
  });

  it('uses a symbol on every side, so the bundler keeps what each package reaches', () => {
    for (const stack of PARITY) for (const add of stack.adds) expect(add.symbol === DEFAULT_EXPORT || /^[A-Za-z_$][\w$]*$/.test(add.symbol)).toBe(true);
  });
});
