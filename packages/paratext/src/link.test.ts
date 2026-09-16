/**
 * `paratext/link` — the subpath the engine could take.
 *
 * Two promises, and they fail in different directions, so they are asserted separately:
 *
 *   1. **it emits the right bytes** — OSC 8 on a terminal believed to do it, and
 *      `Docs (https://x.dev)` everywhere else, which is the sentence the `--help` renderer
 *      asked for by name;
 *   2. **importing it registers nothing.** The whole reason for the subpath is that the root
 *      barrel runs `registerBuiltins()` at import; a narrow entry that quietly did the same
 *      would be the same 16 KB in a smaller wrapper.
 *
 * The second is asserted by importing the subpath and then finding the registry empty. Vitest
 * gives each test file its own module graph, so this file is the only place that observation
 * is meaningful — anything that has already imported `index.js` sees a full registry and the
 * assertion would be green on a broken build.
 */
import { describe, expect, it } from 'vitest';

// Both halves of the observation: the subject, and the registry it must not have touched.
// Import *order* is not what makes the assertion work — `link.js` does not reach
// `capability.js` at all, which is what `weight.test.ts` pins — so these sit in the order the
// lint rule wants and the claim is unaffected.
import { capabilities, emit } from './capability.js';
import { LINK, link, linkFor, supportsLink } from './link.js';

const BEL = '';
const OSC = ']';

/** A terminal believed to do OSC 8, and one that is not. Two literals, no `process`. */
const supporting = { env: { TERM_PROGRAM: 'iTerm.app' }, isTTY: { stdout: true } };
const piped = { env: { TERM_PROGRAM: 'iTerm.app' }, isTTY: { stdout: false } };

describe('the subpath registers nothing', () => {
  it('leaves the capability registry empty', () => {
    // If `link.js` ever reaches `builtins.js` or `index.js`, this is seven names.
    expect(capabilities()).toEqual([]);
  });

  it('still emits through the capability nobody registered', () => {
    // The corollary, and the reason the assertion above is not just an accounting trick:
    // `emit()` on the empty registry answers an unknown name with the caller's own text, so
    // a subpath that went through the registry would silently drop the URL. This one does
    // not go through the registry.
    expect(emit(supporting, 'link', { text: 'Docs', url: 'https://x.dev' })).toBe('Docs');
    expect(linkFor(supporting)('Docs', 'https://x.dev')).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
  });
});

describe('the bytes', () => {
  it('emits OSC 8 where the terminal is believed to understand it', () => {
    expect(linkFor(supporting)('Docs', 'https://x.dev')).toBe(`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`);
  });

  it('projects to `text (url)` on a pipe, and carries no escape at all', () => {
    const projected = linkFor(piped)('Docs', 'https://x.dev');
    expect(projected).toBe('Docs (https://x.dev)');
    expect(projected).not.toContain('');
  });

  it('a link with no url is just its text — the optional group, not an empty pair of parens', () => {
    expect(linkFor(piped)('Docs', '')).toBe('Docs');
  });

  it('`supportsLink` answers the same question the emit path asked', () => {
    expect(supportsLink(supporting)).toBe(true);
    expect(supportsLink(piped)).toBe(false);
  });

  it('`link()` binds the real process, and is the same function over `processRuntime`', () => {
    // No assertion about *which* branch: the test runner's tty is not ours to decide. What
    // is asserted is that the unbound form is one of the two answers and never a bare text.
    const out = link('Docs', 'https://x.dev');
    expect([`${OSC}8;;https://x.dev${BEL}Docs${OSC}8;;${BEL}`, 'Docs (https://x.dev)']).toContain(out);
  });
});

describe('the record is the registry’s own', () => {
  it('carries a fallback, which is what rule 6 has no opt-out from', () => {
    expect(LINK.fallback).toBe('{text}[ ({url})]');
    expect(LINK.osc).toBe(8);
  });
});
