/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a σ figure says which run it came from.
 *
 * `npm run bench -- --axis perf` writes a complete document with
 * `{"status":"not-run","reason":"not selected by --axis"}` for every axis it skipped. The
 * band collector reads `<id>.value` off it, gets nothing, and moves on — correctly, and
 * silently. The band then reports `latest 40562` for a metric the tree measures at 58,027,
 * because 40562 is the newest *complete* point and the complete run is weekly.
 *
 * Nothing there is broken. What is missing is the sentence that says so, and without it
 * "latest" reads as "now" — which is how an afternoon went into diagnosing a dead loop that
 * was alive and on schedule.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type BandConfig, unmeasured } from './control-bands.js';

const SUITE = 'cli-benchmarks';

/** A results directory holding one partial document, the shape a pull request writes. */
function withPartialRun(): string {
  const root = mkdtempSync(join(tmpdir(), 'bands-'));
  const dir = join(root, 'benchmarks/results', SUITE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '2026-09-15-aaaaaaa.json'),
    JSON.stringify({ bands: { 'core-bundled-bytes': { value: 40562 }, 'cold-start-ratio': { value: 1.068 } } }),
  );
  writeFileSync(
    join(dir, '2026-09-21-bbbbbbb.json'),
    JSON.stringify({
      bands: {
        'core-bundled-bytes': { status: 'not-run', reason: 'not selected by --axis' },
        'cold-start-ratio': { value: 1.391 },
      },
    }),
  );
  return root;
}

const band = (id: string): BandConfig =>
  ({ id, collector: 'benchmark-json', suite: SUITE, jsonPath: `bands.${id}.value` }) as BandConfig;

describe('a band the newest results document did not measure', () => {
  const root = withPartialRun();

  it('names the document and repeats the reason the document gives', () => {
    expect(unmeasured(band('core-bundled-bytes'), root)).toEqual({
      newest: '2026-09-21-bbbbbbb',
      reason: 'not selected by --axis',
    });
  });

  it('says nothing about a band that document did measure', () => {
    expect(unmeasured(band('cold-start-ratio'), root)).toBeUndefined();
  });

  it('says nothing when there are no results at all, rather than inventing a gap', () => {
    expect(unmeasured(band('core-bundled-bytes'), mkdtempSync(join(tmpdir(), 'bands-empty-')))).toBeUndefined();
  });

  it('is not a gate: only a 2σ breach fails --check', () => {
    // The complete four-axis run is weekly and every pull request writes a partial one, so a
    // dark series is the normal case. Failing on it would fail on every PR — which is how a
    // check earns the reputation that makes the next real red go unread.
    const source = readFileSync(new URL('control-bands.ts', import.meta.url), 'utf8');
    expect(source).toContain("if (args.has('--check') && actionable.length > 0) process.exitCode = 1;");
  });
});
