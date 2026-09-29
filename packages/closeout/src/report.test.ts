/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * One record, three renderings (design R2, Y5): what the handler was handed, the `--json`
 * line, and the agent event — the last two *projected* from the first rather than described
 * again beside it.
 *
 * The case that matters is `error`. `JSON.stringify(new Error('x'))` is `{}` — an `Error`
 * has no enumerable own properties — so a projection that forgot to flatten it would emit a
 * line that looks like a report, passes every schema, and says nothing about what went
 * wrong. That is why these are functions and not a `toJSON`.
 */
import { describe, expect, it } from 'vitest';

import { reportToEvent, reportToJson, timeoutMessage } from './index.js';
import { toReport, type ShutdownReport } from './report.js';

const report = (over: Partial<ShutdownReport> = {}): ShutdownReport => ({
  path: 'signal',
  signal: 'SIGINT',
  code: null,
  error: null,
  timedOut: false,
  unfinished: [],
  ...over,
});

describe('the record a trigger fills out', () => {
  it('infers the path from the signal when the caller did not say', () => {
    expect(toReport({ code: null, signal: 'SIGTERM' })).toEqual({ path: 'signal', signal: 'SIGTERM', code: null, error: null });
    expect(toReport({ code: 2, signal: null })).toEqual({ path: 'exit', signal: null, code: 2, error: null });
  });

  it('never invents a path the caller stated', () => {
    expect(toReport({ code: 1, signal: null, path: 'rejection', error: 'nope' }).path).toBe('rejection');
  });
});

describe('the --json projection', () => {
  it('flattens an Error into text rather than into {}', () => {
    const parsed = JSON.parse(reportToJson(report({ path: 'uncaught', signal: null, code: 1, error: new Error('mid-render') }))) as { error: string };
    expect(parsed.error).toContain('mid-render');
  });

  it('carries a non-Error rejection value, which is most of them', () => {
    const parsed = JSON.parse(reportToJson(report({ path: 'rejection', error: 404 }))) as { error: string };
    expect(parsed.error).toBe('404');
  });

  it('is one line and names every handler that hung', () => {
    const line = reportToJson(report({ timedOut: true, unfinished: ['acme:unlock', 'closeTheDatabase'] }));
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({ timedOut: true, unfinished: ['acme:unlock', 'closeTheDatabase'] });
  });
});

describe('the agent projection', () => {
  it('is the same values under the family’s event key', () => {
    const source = report({ timedOut: true, unfinished: ['acme:unlock'] });
    const event = reportToEvent(source);

    expect(event.type).toBe('closeout.shutdown');
    // Projected, not re-derived: every field of the event that exists on the record has the
    // record's value, so the two cannot drift.
    for (const key of ['path', 'signal', 'code', 'timedOut'] as const) expect(event[key]).toEqual(source[key]);
    expect(event.unfinished).toEqual([...source.unfinished]);
  });

  it('does not share the array with the record it projected', () => {
    const source = report({ timedOut: true, unfinished: ['acme:unlock'] });
    reportToEvent(source).unfinished.push('not-a-real-handler');
    expect(source.unfinished).toEqual(['acme:unlock']);
  });
});

describe('the line the deadline prints', () => {
  it('names the handlers, because that sentence is the product', () => {
    const line = timeoutMessage(report({ timedOut: true, unfinished: ['acme:unlock'] }), 2000);
    expect(line).toContain('2000ms');
    expect(line).toContain('acme:unlock');
  });

  it('says so when the deadline fired with nothing left running, rather than printing an empty list', () => {
    expect(timeoutMessage(report({ timedOut: true, unfinished: [] }), 2000)).toBe(
      'closeout: shutdown deadline of 2000ms expired; exiting anyway. Handlers that had not returned: none — the handlers had all returned',
    );
  });

  it('lists every handler that had not returned, in order, comma-separated', () => {
    expect(timeoutMessage(report({ timedOut: true, unfinished: ['acme:unlock', 'flush-log'] }), 50)).toBe(
      'closeout: shutdown deadline of 50ms expired; exiting anyway. Handlers that had not returned: acme:unlock, flush-log',
    );
  });
});

describe('an error with no stack', () => {
  it('is rendered as its name and message, never as undefined', () => {
    // A stack is not guaranteed — `Object.create(Error.prototype)` has none, and code that
    // scrubs one before rethrowing deletes it — and the projection must still say what went wrong.
    const error = new RangeError('out of disk');
    Reflect.deleteProperty(error, 'stack');
    const line = JSON.parse(reportToJson(report({ path: 'uncaught', error }))) as { error: string };
    expect(line.error).toBe('RangeError: out of disk');
    expect(reportToEvent(report({ path: 'uncaught', error })).error).toBe('RangeError: out of disk');
  });
});
