import { describe, expect, it } from 'vitest';

import { decide, ESCAPE_AFTER, MODES, recentBlocks, sessionOf, type LogEntry } from './gate.js';

const entry = (session: string, blocked: boolean): LogEntry => ({
  at: '',
  session,
  mode: 'enforce',
  ok: !blocked,
  blocked,
  bypass: false,
  reason: '',
});
const bad = { ok: false, reason: 'no Verified-by: line' };
const good = { ok: true, reason: 'receipt' };

describe('recentBlocks', () => {
  it("counts the session's blocks since its last run that was not blocked", () => {
    const log = [entry('s', true), entry('s', false), entry('s', true), entry('t', false), entry('s', true)];
    expect(recentBlocks(log, 's')).toBe(2);
    expect(recentBlocks(log, 't')).toBe(0);
  });

  it('counts every block when the session never passed, and none for an unknown session', () => {
    expect(recentBlocks([entry('s', true), entry('s', true), entry('s', true)], 's')).toBe(3);
    expect(recentBlocks([], 's')).toBe(0);
  });
});

describe('decide', () => {
  it('passes everything in off and observe', () => {
    const log = [entry('s', true), entry('s', true)];
    expect(decide('off', bad, log, 's')).toEqual({
      blocked: false,
      bypass: false,
    });
    expect(decide('observe', bad, log, 's')).toEqual({
      blocked: false,
      bypass: false,
    });
  });

  it('passes a good message in enforce', () => {
    expect(decide('enforce', good, [entry('s', true), entry('s', true)], 's')).toEqual({ blocked: false, bypass: false });
  });

  it(`blocks in enforce until ${String(ESCAPE_AFTER)} blocks in the session, then lets the next one through as a bypass`, () => {
    expect(ESCAPE_AFTER).toBe(2);
    expect(decide('enforce', bad, [], 's')).toEqual({
      blocked: true,
      bypass: false,
    });
    expect(decide('enforce', bad, [entry('s', true)], 's')).toEqual({
      blocked: true,
      bypass: false,
    });
    expect(decide('enforce', bad, [entry('s', true), entry('s', true)], 's')).toEqual({ blocked: false, bypass: true });
    expect(decide('enforce', bad, [entry('t', true), entry('t', true)], 's')).toEqual({ blocked: true, bypass: false });
  });
});

describe('sessionOf', () => {
  it('prefers PROVEDONE_SESSION, then the agent session ids, then the branch', () => {
    const all = {
      PROVEDONE_SESSION: 'p',
      CLAUDE_CODE_SESSION_ID: 'c',
      CLAUDE_SESSION_ID: 'd',
    };
    expect(sessionOf(all, 'main')).toBe('p');
    expect(sessionOf({ ...all, PROVEDONE_SESSION: undefined }, 'main')).toBe('c');
    expect(sessionOf({ CLAUDE_SESSION_ID: 'd' }, 'main')).toBe('d');
    expect(sessionOf({}, 'feat/x')).toBe('branch:feat/x');
  });
});

it('has three modes, off first', () => {
  expect(MODES).toEqual(['off', 'observe', 'enforce']);
});
