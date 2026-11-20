import { describe, expect, it } from 'vitest';

import { flakyCandidates, type Reran } from './flaky.js';

type Mutant = Reran & { id: string };

// Test id → its file. `flaky` and `neighbour` share a file; `steady` has one of its own.
const files: Record<string, string> = { flaky: '/t/flaky.spec.ts', neighbour: '/t/flaky.spec.ts', steady: '/t/steady.spec.ts', other: '/t/other.spec.ts' };
const fileOf = (t: string): string | undefined => files[t];
const flaky = new Set(['flaky']);
const ids = (ms: Mutant[]): string[] => ms.map((m) => m.id);

// Step 7 re-runs a mutant `flakyReruns` times to see whether its verdict moves. A kill by a test
// the flakiness cannot reach moves on no re-run, so re-running it is time spent on nothing: 416 of
// 786 isolated runs on unjs/pathe (2026-11-19).
describe('the mutants a flaky test could have decided, which are re-run', () => {
  it('skips a kill by a steady test in a file of its own, and keeps one only the flaky test made', () => {
    const bySteady: Mutant = { id: 'a', status: 'Killed', coveredBy: ['steady', 'flaky'], killedBy: ['steady'] };
    const byFlaky: Mutant = { id: 'b', status: 'Killed', coveredBy: ['steady', 'flaky'], killedBy: ['flaky'] };
    const byBoth: Mutant = { id: 'c', status: 'Killed', coveredBy: ['steady', 'flaky'], killedBy: ['flaky', 'steady'] };
    expect(ids(flakyCandidates([bySteady, byFlaky, byBoth], flaky, fileOf))).toEqual(['b']);
  });

  it('keeps a kill by a steady test that shares its file with the flaky one: run before it, the flaky test can leave state behind', () => {
    const m: Mutant = { id: 'a', status: 'Killed', coveredBy: ['neighbour', 'flaky'], killedBy: ['neighbour'] };
    expect(ids(flakyCandidates([m], flaky, fileOf))).toEqual(['a']);
  });

  it('keeps a kill credited to no known test (a file whose hook or import failed)', () => {
    const m: Mutant = { id: 'a', status: 'Killed', coveredBy: ['flaky'], killedBy: ['file-task-id'] };
    expect(ids(flakyCandidates([m], flaky, fileOf))).toEqual(['a']);
  });

  it('keeps survivors and Timeouts, whatever else covers them', () => {
    const survived: Mutant = { id: 'a', status: 'Survived', coveredBy: ['steady', 'flaky'] };
    const timeout: Mutant = { id: 'b', status: 'Timeout', coveredBy: ['steady', 'flaky'], killedBy: ['steady'] };
    const compile: Mutant = { id: 'c', status: 'CompileError', coveredBy: ['flaky'] };
    expect(ids(flakyCandidates([survived, timeout, compile], flaky, fileOf))).toEqual(['a', 'b', 'c']);
  });

  it('re-runs nothing a flaky test does not cover, and nothing when no test is flaky', () => {
    const m: Mutant = { id: 'a', status: 'Survived', coveredBy: ['steady', 'other'] };
    expect(flakyCandidates([m], flaky, fileOf)).toEqual([]);
    expect(flakyCandidates([{ ...m, coveredBy: ['flaky'] }], new Set(), fileOf)).toEqual([]);
  });
});
