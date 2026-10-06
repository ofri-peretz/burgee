/**
 * The kitty query's answer, read as ink 8 reads it: one input event `ESC [ ? <flags> u`, which
 * `App` consumes instead of handing to `useInput`. ink's own suite grades the negotiation end
 * to end (`kitty-negotiation.tsx`); this pins the recognizer's edges on their own.
 */
import { describe, expect, it } from 'vitest';

import { createInputParser, isKittyQueryReply, resolveFlags } from './keypress.js';

describe('isKittyQueryReply', () => {
  it('reads a complete reply, whatever its flags', () => {
    expect(isKittyQueryReply('\u001B[?1u')).toBe(true);
    expect(isKittyQueryReply('\u001B[?15u')).toBe(true);
  });

  it('refuses what only looks like one: no digits, a non-digit, the wrong final byte or introducer', () => {
    expect(isKittyQueryReply('\u001B[?u')).toBe(false);
    expect(isKittyQueryReply('\u001B[?1xu')).toBe(false);
    expect(isKittyQueryReply('\u001B[?1x')).toBe(false);
    expect(isKittyQueryReply('\u001B[1u')).toBe(false);
    expect(isKittyQueryReply('[?1u')).toBe(false);
  });

  it('arrives as one event from the input splitter, even when it lands in two chunks', () => {
    const parser = createInputParser();
    expect(parser.push('a\u001B[?')).toEqual(['a']);
    expect(parser.push('1ub')).toEqual(['\u001B[?1u', 'b']);
  });
});

describe('resolveFlags', () => {
  it('ORs the named flags, and associated text brings all-keys reporting with it', () => {
    expect(resolveFlags(['disambiguateEscapeCodes', 'reportEventTypes'])).toBe(3);
    expect(resolveFlags(['reportAssociatedText'])).toBe(24);
  });
});
