/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The three renderings, over every outcome — with no process.
 *
 * `matrix.test.ts` renders the results real children produced, which reaches `failed` and
 * `timedOut` and nothing else: no `ok` line, no signal, no result without an executable. The
 * projections are pure functions of a `Result`, so the rest are written out here as values,
 * and each assertion is the whole string rather than a `toContain` a wrong line would pass.
 */
import { describe, expect, it } from 'vitest';

import { format, outcomeOf, toEvent, toJson } from './project.js';
import { type Result } from './run.js';

const result = (over: Partial<Result> = {}): Result => ({
  ok: true,
  code: 0,
  signal: null,
  stdout: '',
  stderr: '',
  duration: 12,
  command: 'node',
  args: ['-v'],
  executable: { path: '/opt/bin/node', from: '/opt/bin' },
  timedOut: false,
  ...over,
});

describe('outcomeOf — one word, derived once', () => {
  it.each<[string, Partial<Result>, string]>([
    ['exit 0', {}, 'ok'],
    ['a non-zero exit', { ok: false, code: 2 }, 'failed'],
    ['a signal', { ok: false, code: null, signal: 'SIGKILL' }, 'signalled'],
    // The precedence the module exists to fix in one place: a deadline kill also carries the
    // signal it was killed by, and it is still a timeout first.
    ['a deadline, which also carries a signal', { ok: false, code: null, signal: 'SIGTERM', timedOut: true }, 'timedOut'],
  ])('%s is %s', (_what, over, expected) => {
    expect(outcomeOf(result(over))).toBe(expected);
  });
});

describe('format — how a result reads to a person', () => {
  it('is one line and the provenance on success, with no output tail', () => {
    expect(format(result({ stdout: 'v24.13.0\n' }))).toBe('ok  node (12 ms)\n     /opt/bin/node (from /opt/bin)');
  });

  it('names the signal that killed it', () => {
    expect(format(result({ ok: false, code: null, signal: 'SIGKILL', stderr: 'bye\n' }))).toBe('killed  node by SIGKILL after 12 ms\n     /opt/bin/node (from /opt/bin)\n     bye');
  });

  it('shows stdout when a failure said nothing on stderr, since that is where it said it', () => {
    expect(format(result({ ok: false, code: 1, stdout: 'lint: 3 problems\n' }))).toBe('failed  node exited 1 after 12 ms\n     /opt/bin/node (from /opt/bin)\n     lint: 3 problems');
  });

  it('prefers stderr when there is any', () => {
    expect(format(result({ ok: false, code: 1, stdout: 'progress\n', stderr: 'the reason\n' }))).toBe('failed  node exited 1 after 12 ms\n     /opt/bin/node (from /opt/bin)\n     the reason');
  });

  it('adds no tail for a failure that printed nothing', () => {
    expect(format(result({ ok: false, code: 1 }))).toBe('failed  node exited 1 after 12 ms\n     /opt/bin/node (from /opt/bin)');
  });

  it('keeps the last ten lines of a long failure, which are the ones that say what went wrong', () => {
    const lines = Array.from({ length: 14 }, (_, i) => `line ${String(i + 1)}`);
    const text = format(result({ ok: false, code: 1, stderr: `${lines.join('\n')}\n` }));
    expect(text.split('\n').slice(2)).toEqual(lines.slice(-10).map((l) => `     ${l}`));
  });

  it('drops the provenance line when nothing was resolved — a shell resolved it', () => {
    expect(format(result({ executable: undefined }))).toBe('ok  node (12 ms)');
  });

  it('prints the path alone for a command that carried its own path, where PATH was never read', () => {
    expect(format(result({ command: './node', executable: { path: '/w/node', from: '' } }))).toBe('ok  ./node (12 ms)\n     /w/node');
  });
});

describe('toJson and toEvent — the same record for a script and an agent', () => {
  it('carries a missing executable as null, in both', () => {
    const r = result({ executable: undefined });
    expect(toJson(r)['executable']).toBeNull();
    expect(toEvent(r)).toMatchObject({ executable: null, from: null });
  });

  it('carries every field of the record, and a copy of the args rather than the args', () => {
    const r = result({ ok: false, code: null, signal: 'SIGTERM', stdout: 'o', stderr: 'e', timedOut: true });
    const json = toJson(r);
    expect(json).toEqual({
      ok: false,
      code: null,
      signal: 'SIGTERM',
      stdout: 'o',
      stderr: 'e',
      durationMs: 12,
      command: 'node',
      args: ['-v'],
      executable: { path: '/opt/bin/node', from: '/opt/bin' },
      timedOut: true,
    });
    expect(json['args']).not.toBe(r.args);
    expect(toEvent(r)).toEqual({ type: 'run', outcome: 'timedOut', command: 'node', args: ['-v'], code: null, signal: 'SIGTERM', durationMs: 12, executable: '/opt/bin/node', from: '/opt/bin' });
  });
});
