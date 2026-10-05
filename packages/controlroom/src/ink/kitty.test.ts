/**
 * The kitty query's answer, read as ink reads it: ink's own suite grades the negotiation end to
 * end (584 / 584); this pins the parser's four outcomes on their own.
 */
import { describe, expect, it } from 'vitest';

import { kittyReply } from './keypress.js';

const bytes = (s: string): number[] => [...Buffer.from(s)];

describe('kittyReply', () => {
  it('finds a complete reply anywhere, and keeps every other byte in order', () => {
    expect(kittyReply(bytes('a\u001B[?1ub'))).toEqual({ replied: true, rest: bytes('ab') });
    expect(kittyReply(bytes('\u001B[?15u'))).toEqual({ replied: true, rest: [] });
  });

  it('drops a reply still arriving at the end, rather than leaking it as keys', () => {
    expect(kittyReply(bytes('x\u001B[?1'))).toEqual({ replied: false, rest: bytes('x') });
  });

  it('keeps what only looks like a reply: no digits, or the wrong final byte', () => {
    expect(kittyReply(bytes('\u001B[?'))).toEqual({ replied: false, rest: bytes('\u001B[?') });
    expect(kittyReply(bytes('\u001B[?u'))).toEqual({ replied: false, rest: bytes('\u001B[?u') });
    expect(kittyReply(bytes('\u001B[?1x'))).toEqual({ replied: false, rest: bytes('\u001B[?1x') });
    expect(kittyReply(bytes('\u001B[A'))).toEqual({ replied: false, rest: bytes('\u001B[A') });
  });
});
