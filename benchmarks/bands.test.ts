/**
 * Lock — a band cannot reference a number nothing emits.
 *
 * `.sdlc/bands/control-bands.json` and `benchmarks/bands.ts` are two halves of one wire:
 * the first says which metrics Stage 6 watches, the second says which axis writes each
 * one and where. When they drift, the watcher reports "band not computed yet" forever,
 * which is indistinguishable from a young band that is simply still collecting points —
 * and that is exactly what `agent-tokens-per-task` did from the day it was written.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BANDS, type ConfiguredBand, producerProblems, SUITE } from './bands.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = join(REPO_ROOT, '.sdlc/bands/control-bands.json');

const configured = (JSON.parse(readFileSync(CONFIG, 'utf8')) as { bands: ConfiguredBand[] }).bands;

describe('every band that reads benchmark results has a producer', () => {
  it('agrees with .sdlc/bands/control-bands.json, band for band', () => {
    expect(producerProblems(configured)).toEqual([]);
  });

  it('goes red for a band nothing produces', () => {
    const invented: ConfiguredBand = { id: 'tokens-saved-per-task', collector: 'benchmark-json', suite: SUITE.agent, jsonPath: 'bands.tokens-saved-per-task.value' };
    expect(producerProblems([...configured, invented])).toEqual([
      'band tokens-saved-per-task reads benchmark results but no axis in benchmarks/bands.ts produces it',
    ]);
  });

  it('goes red when the config reads a different path from the one the document writes', () => {
    const moved = configured.map((b) => (b.id === 'core-bundled-bytes' ? { ...b, jsonPath: 'median.bytes' } : b));
    expect(producerProblems(moved)).toEqual(['band core-bundled-bytes: config reads median.bytes, the results document puts it at bands.core-bundled-bytes.value']);
  });

  it('goes red when the config reads the wrong suite directory', () => {
    const moved = configured.map((b) => (b.id === 'cold-start-ratio' ? { ...b, suite: SUITE.agent } : b));
    expect(producerProblems(moved)).toEqual([`band cold-start-ratio: config reads suite ${SUITE.agent}, perf writes ${SUITE.cheap}`]);
  });

  it('goes red for a producer no band reads — the other direction, so an axis cannot emit into the void', () => {
    expect(producerProblems(configured.filter((b) => b.id !== 'core-bundled-bytes'))).toEqual([
      'benchmarks/bands.ts produces core-bundled-bytes but no band in control-bands.json reads it',
    ]);
  });

  it('leaves collectors that do not read benchmark results alone', () => {
    const others = configured.filter((b) => b.collector !== 'benchmark-json');
    expect(others.length).toBeGreaterThan(0);
    expect(producerProblems(others, [])).toEqual([]);
  });

  it('declares a suite and a jsonPath for every band, in the one shape the collector reads', () => {
    for (const spec of BANDS) expect(spec.jsonPath).toBe(`bands.${spec.id}.value`);
  });
});
