/**
 * mcp-current R5, the flagstaff half — `flagstaff/progress` inside an MCP tool call that asked for
 * progress sends the count through the call's `ctx.progress` and draws nothing.
 *
 * burgee's server publishes the call it is serving as a function under `Symbol.for('burgee.mcp')`;
 * this stands one up by hand, which is the whole contract between the two packages. The end-to-end
 * case, a real server and a real client frame, is `scripts/mcp-messages.test.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { progress as bar } from './progress-bar.js';
import { progress } from './progress.js';

const KEY = Symbol.for('burgee.mcp');

/** Serve `call` as the current MCP call; what was sent comes back. */
function serving(call: 'none' | 'no-token' | 'token'): unknown[][] {
  const sent: unknown[][] = [];
  const current = { none: undefined, 'no-token': {}, token: { progress: (...args: unknown[]) => sent.push(args) } }[call];
  Reflect.set(globalThis, KEY, () => current);
  return sent;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, KEY);
});

describe('flagstaff/progress inside an MCP call (mcp-current R5)', () => {
  it('sends done, total and the static line through ctx.progress, and draws nothing in either projection', () => {
    const sent = serving('token');
    const p = progress({ width: 10 });
    expect(p.static({ done: 12, total: 30, label: 'files' })).toBe('');
    expect(p.frame?.(0, { done: 15, total: 30 })).toBe('');
    expect(sent).toEqual([
      [12, 30, '12/30 files · 40%'],
      [15, 30, '15/30 · 50%'],
    ]);
  });

  it('tells the client no more than the total, nothing below zero, and no total when there is none', () => {
    const sent = serving('token');
    const p = progress();
    p.static({ done: 50, total: 30 });
    p.static({ done: -2, total: 30 });
    p.static({ done: 4, total: 0 });
    expect(sent).toEqual([
      [30, 30, '50/30 · 100%'],
      [0, 30, '-2/30 · 0%'],
      [4, undefined, '4/0 · 100%'],
    ]);
  });

  it('reads the call on every render, so a bar made before the call starts still reports inside it', () => {
    const p = progress();
    expect(p.static({ done: 1, total: 2 })).toBe('1/2 · 50%');
    const sent = serving('token');
    expect(p.static({ done: 2, total: 2 })).toBe('');
    expect(sent).toEqual([[2, 2, '2/2 · 100%']]);
  });

  it.each(['none', 'no-token'] as const)('draws as the root entry does when the call is %s', (call) => {
    serving(call);
    const state = { done: 3, total: 4, label: 'steps' };
    expect(progress({ width: 8 }).static(state)).toBe(bar({ width: 8 }).static(state));
    expect(progress({ width: 8 }).frame?.(0, state)).toBe(bar({ width: 8 }).frame?.(0, state));
  });

  it('draws as the root entry does with no server at all, and keeps its name', () => {
    const state = { done: 1, total: 4 };
    expect(progress().frame?.(0, state)).toBe(bar().frame?.(0, state));
    expect(progress().name).toBe('progress');
  });
});
