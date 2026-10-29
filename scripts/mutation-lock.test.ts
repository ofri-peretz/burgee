/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Mutation lock — the parts of `scripts/mutation.ts` that decide a verdict, and the files it
 * reads (.sdlc/intents/mutation-tested/, R1–R8).
 *
 * Stryker itself is not run here: one run is tens of seconds, and the lane's red-then-green
 * proof is recorded in the intent instead. What is held here is everything between Stryker's
 * report and the exit code — which lines are mutated, how a report is scored, when a report is
 * refused as measuring nothing — and the committed state: every `// Stryker disable` carries a
 * reason, and the ratchet file only moves up.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { readDecisions } from './ledgers.js';
import { flattenProjects } from './mutation-vitest-flatten.js';
import { widenTestNamePattern } from './mutation-vitest-setup.js';
import {
  changedReport,
  disableProblems,
  floorOf,
  type FullResult,
  isMutationSource,
  mutateSpecs,
  parseChangedLines,
  RATCHETS_FILE,
  type RatchetsDoc,
  record,
  type ReportMutant,
  SKIPPED_TESTS,
  summarise,
  wrapperConfig,
} from './mutation.js';
import { decisionNumber } from './ratchet-steps.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = readdirSync(join(REPO_ROOT, 'packages'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(REPO_ROOT, 'packages', d.name, 'package.json')))
  .map((d) => d.name)
  .toSorted();
const doc = JSON.parse(readFileSync(join(REPO_ROOT, RATCHETS_FILE), 'utf8')) as RatchetsDoc;

const mutant = (over: Partial<ReportMutant> & Pick<ReportMutant, 'status'>): ReportMutant => ({
  id: '1',
  mutatorName: 'ArithmeticOperator',
  replacement: 'a - b',
  location: { start: { line: 10, column: 3 }, end: { line: 10, column: 8 } },
  ...over,
});

describe('which lines a pull request changed (R1)', () => {
  const diff = [
    'diff --git a/packages/roundel/src/contrast.ts b/packages/roundel/src/contrast.ts',
    '--- a/packages/roundel/src/contrast.ts',
    '+++ b/packages/roundel/src/contrast.ts',
    '@@ -10,0 +11,3 @@ export function channels',
    '+a',
    '@@ -40 +44 @@',
    '-b',
    '+c',
    '@@ -60,2 +63,0 @@',
    'diff --git a/packages/roundel/src/gone.ts b/packages/roundel/src/gone.ts',
    '--- a/packages/roundel/src/gone.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    'diff --git a/packages/roundel/src/contrast.test.ts b/packages/roundel/src/contrast.test.ts',
    '+++ b/packages/roundel/src/contrast.test.ts',
    '@@ -1 +1,2 @@',
  ].join('\n');

  it('reads the new side of each hunk, skips pure deletions and deleted files', () => {
    expect(Object.fromEntries(parseChangedLines(diff))).toEqual({
      'packages/roundel/src/contrast.ts': [[11, 13], [44, 44]],
      'packages/roundel/src/contrast.test.ts': [[1, 2]],
    });
  });

  it('turns them into Stryker ranges for source files of affected packages only', () => {
    const changed = parseChangedLines(diff);
    expect(Object.fromEntries(mutateSpecs(changed, new Set(['roundel'])))).toEqual({ roundel: ['src/contrast.ts:11-13', 'src/contrast.ts:44-44'] });
    expect(mutateSpecs(changed, new Set(['burgee'])).size).toBe(0);
  });

  it('mutates what coverage measures, and nothing else', () => {
    expect(isMutationSource('src/contrast.ts')).toBe(true);
    expect(isMutationSource('src/deep/dir/x.mts')).toBe(true);
    for (const no of ['src/contrast.test.ts', 'src/types.d.ts', 'src/__fixtures__/tar.ts', 'src/chalk.ts', 'src/commander/command.ts', 'scripts/gen.ts', 'src/schema.json', 'README.md']) {
      expect(isMutationSource(no), no).toBe(false);
    }
  });
});

describe('the vitest 5 name-filter shim', () => {
  // What the runner sends for `describe('contrast') > it('accepts short hex and rejects nonsense')`.
  const sent = /contrast accepts short hex and rejects nonsense|fly \u2014 the contrast gate \(R5\) rejects/;
  it('matches the full name vitest 5 compares it to, and still the plain one', () => {
    const widened = widenTestNamePattern(sent);
    expect(sent.test('contrast > accepts short hex and rejects nonsense')).toBe(false);
    expect(widened.test('contrast > accepts short hex and rejects nonsense')).toBe(true);
    expect(widened.test('contrast accepts short hex and rejects nonsense')).toBe(true);
    expect(widened.test('contrast > matches the WCAG reference values')).toBe(false);
  });

  it('keeps the runner flags and accepts a string pattern', () => {
    expect(widenTestNamePattern(/a b/i).flags).toBe('i');
    expect(widenTestNamePattern('a b').test('a > b')).toBe(true);
  });
});

describe('scoring a report (R2)', () => {
  it('scores detected over detected + undetected, leaving ignored and invalid mutants out', () => {
    const s = summarise({
      files: {
        'src/a.ts': {
          mutants: [
            mutant({ status: 'Killed' }),
            mutant({ status: 'Killed' }),
            mutant({ status: 'Timeout' }),
            mutant({ status: 'Survived', testsCompleted: 4, coveredBy: ['t1'] }),
            mutant({ status: 'NoCoverage' }),
            mutant({ status: 'Ignored' }),
            mutant({ status: 'CompileError' }),
          ],
        },
      },
    }, 'packages/x/');
    expect(s).toMatchObject({ killed: 2, timeout: 1, survived: 1, noCoverage: 1, ignored: 1, invalid: 1, score: 60 });
    expect(s.undetected.map((u) => [u.file, u.status])).toEqual([['packages/x/src/a.ts', 'Survived'], ['packages/x/src/a.ts', 'NoCoverage']]);
    expect(s.silentSurvivors).toEqual([]);
  });

  it('has no score when nothing could be scored', () => {
    expect(summarise({ files: { 'src/a.ts': { mutants: [mutant({ status: 'Ignored' })] } } }).score).toBeNull();
  });

  // The signature of @stryker-mutator/vitest-runner@10.0.0 under vitest 5, read off the real
  // report for roundel/src/contrast.ts:74 on 2026-10-18: covered by two tests, ran none.
  it('refuses a covered survivor that ran no test — the runner measured nothing', () => {
    const s = summarise({ files: { 'src/contrast.ts': { mutants: [mutant({ status: 'Survived', mutatorName: 'StringLiteral', testsCompleted: 0, coveredBy: ['25', '115'] })] } } });
    expect(s.silentSurvivors).toHaveLength(1);
    // A survivor no test covers is NoCoverage, and a static one ran tests: neither is silent.
    expect(summarise({ files: { 'src/a.ts': { mutants: [mutant({ status: 'Survived', testsCompleted: 159, coveredBy: [] })] } } }).silentSurvivors).toEqual([]);
  });
});

describe('`// Stryker disable` carries a reason (R4)', () => {
  it('accepts a mutator and a reason, and refuses one without', () => {
    expect(disableProblems('a.ts', '// Stryker disable next-line StringLiteral: the message is not part of the contract')).toEqual([]);
    expect(disableProblems('a.ts', '/* Stryker disable all: generated table, checked by its generator */')).toEqual([]);
    expect(disableProblems('a.ts', '// Stryker restore all')).toEqual([]);
    for (const bad of ['// Stryker disable next-line StringLiteral', '// Stryker disable all', '// Stryker disable next-line Regex: flaky', '// Stryker disable next-line: no mutator named here at all']) {
      expect(disableProblems('a.ts', `const x = 1;\n${bad}`), bad).toEqual([expect.stringMatching(/^a\.ts:2: /u)]);
    }
  });

  it('every disable comment in a package source has one', () => {
    const files = execFileSync('git', ['ls-files', '--', 'packages/*/src/**'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.[cm]?[jt]sx?$/u.test(f));
    const problems = files.flatMap((f) => disableProblems(f, readFileSync(join(REPO_ROOT, f), 'utf8')));
    expect(problems).toEqual([]);
  });
});

describe('the vitest config an oxmutate run uses', () => {
  // burgee's config splits its tests into two projects, and oxmutate's runner reaches neither:
  // every pull request that changed a burgee line failed with "the dry run ran no tests".
  it("folds a package's projects into one that includes every file they did", () => {
    // burgee's shape: a pool of everything but the shell-driving files, then those files alone.
    const shells = ['src/completions-shells.test.ts'];
    const split = {
      test: {
        testTimeout: 60_000,
        projects: [
          { extends: true, test: { name: 'pool', include: ['src/**/*.test.ts'], exclude: shells } },
          { extends: true, test: { name: 'shells', include: shells, fileParallelism: false } },
          'packages/*',
        ],
      },
    };
    expect(flattenProjects(split)).toEqual({ test: { testTimeout: 60_000, include: ['src/**/*.test.ts', ...shells] } });
  });

  it('reads the package config that has projects, so the fold is not for nothing', () => {
    expect(readFileSync(join(REPO_ROOT, 'packages', 'burgee', 'vitest.config.ts'), 'utf8')).toMatch(/^\s+projects: \[/mu);
  });

  it('leaves a config without projects as it is', () => {
    const plain = { test: { include: ['src/**/*.test.ts'] } };
    expect(flattenProjects(plain)).toBe(plain);
  });

  it('is what the wrapper hands oxmutate, and only oxmutate', () => {
    expect(wrapperConfig('/pkg', [], 'oxmutate')).toContain('mergeConfig(flattenProjects(base), ');
    expect(wrapperConfig('/pkg', [], 'stryker')).toContain('mergeConfig(base, ');
    expect(wrapperConfig('/pkg', [], 'stryker')).not.toContain('flattenProjects');
  });
});

describe('the suites a mutation run skips', () => {
  it.each(Object.entries(SKIPPED_TESTS).flatMap(([pkg, files]) => Object.entries(files).map(([f, why]) => [pkg, f, why] as const)))('%s/%s exists and says why', (pkg, file, why) => {
    expect(existsSync(join(REPO_ROOT, 'packages', pkg, file))).toBe(true);
    expect(why.length).toBeGreaterThan(30);
  });
});

describe('the mutation ratchets (R5–R7)', () => {
  it('name every package, and nothing else', () => {
    expect(Object.keys(doc.ratchets).toSorted()).toEqual(PACKAGES);
  });

  it('are what the weekly workflow measures', () => {
    const wf = loadYaml(readFileSync(join(REPO_ROOT, '.github/workflows/mutation.yml'), 'utf8')) as { jobs: { full: { strategy: { matrix: { package: string[] } } } } };
    expect(wf.jobs.full.strategy.matrix.package.toSorted()).toEqual(PACKAGES);
  });

  const decisions: ReadonlySet<string> = new Set(readDecisions(REPO_ROOT).entries.map((d) => d.id));

  it.each(Object.entries(doc.ratchets))('%s is measured with a floor that only rises, or says why it is not', (pkg, r) => {
    if (r.status === 'unmeasured') {
      expect(r.reason.length, `${pkg}: an unmeasured package says why`).toBeGreaterThan(30);
      return;
    }
    expect(r.history.length).toBeGreaterThan(0);
    expect(r.floor, `${pkg}: the floor is the last history step`).toBe(r.history.at(-1)!.floor);
    expect(r.observations.length, `${pkg}: a floor with no measurement behind it`).toBeGreaterThan(0);
    r.history.forEach((step, i) => {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.setOn).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      const before = r.history[i - 1];
      if (!before || step.floor >= before.floor) return;
      expect(step.decision && decisions.has(step.decision), `${pkg} step ${String(i)} lowers the floor without a decision in .sdlc/decisions/`).toBe(true);
      expect(decisionNumber(step.decision!) > decisionNumber(before.decision ?? 'D-000')).toBe(true);
    });
    // A floor is never above what was measured when it was set.
    const first = r.observations[0]!;
    expect(r.history[0]!.floor).toBeLessThanOrEqual(first.score);
  });

  it('keeps the committed history — steps and observations are appended, never rewritten', () => {
    let before: RatchetsDoc;
    try {
      before = JSON.parse(execFileSync('git', ['show', `HEAD:${RATCHETS_FILE}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) as RatchetsDoc;
    } catch {
      return; // the commit that introduces the file has nothing to compare
    }
    for (const [pkg, old] of Object.entries(before.ratchets)) {
      const now = doc.ratchets[pkg];
      expect(now, `${pkg} was removed`).toBeDefined();
      if (old.status !== 'measured') continue;
      expect(now?.status, `${pkg} went back to unmeasured`).toBe('measured');
      if (now?.status !== 'measured') continue;
      old.history.forEach((s, i) => expect(now.history[i], `${pkg} history ${String(i)}`).toEqual(s));
      old.observations.forEach((o, i) => expect(now.observations[i], `${pkg} observation ${String(i)}`).toEqual(o));
    }
  });
});

/** One package's weekly result, 7 killed and 3 survived around `score`. */
const res = (pkg: string, score: number | null, ok = true): FullResult => ({
  pkg,
  commit: 'abc',
  ok,
  minutes: 1,
  summary: { killed: 7, timeout: 0, survived: 3, noCoverage: 0, invalid: 0, ignored: 0, score, undetected: [], silentSurvivors: [] },
});

describe('recording a weekly run (R6)', () => {
  const base: RatchetsDoc = {
    $comment: '',
    ratchets: {
      a: { status: 'measured', floor: 70, history: [{ floor: 70, setOn: '2026-10-01', why: 'first full run, recorded by hand' }], observations: [] },
      b: { status: 'unmeasured', reason: 'never run' },
    },
  };
  it('raises a floor the run beat, rounded down to one decimal', () => {
    const out = record(base, [res('a', 75.47)], '2026-10-24');
    expect(out.breaches).toEqual([]);
    expect(out.doc.ratchets.a).toMatchObject({ floor: 75.4, observations: [{ score: 75.47, date: '2026-10-24' }] });
    expect(floorOf(75.47)).toBe(75.4);
  });

  it('records a run below the floor and reports the breach, without lowering it', () => {
    const out = record(base, [res('a', 69.9)], '2026-10-24');
    expect(out.breaches).toHaveLength(1);
    expect(out.doc.ratchets.a).toMatchObject({ floor: 70, observations: [{ score: 69.9 }] });
  });

  it('sets a first floor when an unmeasured package is measured', () => {
    expect(record(base, [res('b', 50.05)], '2026-10-24').doc.ratchets.b).toMatchObject({ status: 'measured', floor: 50 });
  });

  it('a measured package that produced no score is a breach; an unmeasured one records why', () => {
    const out = record(base, [{ ...res('a', null, false), error: 'dry run failed' }, { ...res('b', null, false), error: 'dry run failed' }], '2026-10-24');
    expect(out.breaches).toEqual([expect.stringContaining('a: ')]);
    expect(out.doc.ratchets.b).toMatchObject({ status: 'unmeasured', reason: expect.stringContaining('dry run failed') });
  });
});

describe('the lane report', () => {
  const gap = { file: 'packages/roundel/src/contrast.ts', line: 95, column: 21, mutator: 'MethodExpression', replacement: 'Math.min(a, b)', status: 'Survived' as const };
  const summary = { killed: 2, timeout: 0, survived: 1, noCoverage: 0, invalid: 0, ignored: 0, score: 66.67, undetected: [gap], silentSurvivors: [] };
  const specs = new Map([['roundel', ['src/contrast.ts:93-96']]]);

  it('names each undetected mutant on a changed line', () => {
    const text = changedReport(specs, [{ pkg: 'roundel', ok: true, summary, minutes: 0.1 }]).join('\n');
    expect(text).toContain('`packages/roundel/src/contrast.ts:95:21` | MethodExpression | Survived');
    expect(text).not.toContain('✅');
  });

  it('lists no gaps for a run refused as measuring nothing, and says why it was refused', () => {
    const text = changedReport(specs, [{ pkg: 'roundel', ok: false, error: 'ran no test', summary: { ...summary, silentSurvivors: [gap] }, minutes: 0.1 }]).join('\n');
    expect(text).toContain('❌ **roundel**: ran no test');
    expect(text).not.toContain('MethodExpression');
  });

  it('passes when every mutant is detected', () => {
    expect(changedReport(specs, [{ pkg: 'roundel', ok: true, summary: { ...summary, survived: 0, undetected: [] }, minutes: 0.1 }]).at(-1)).toMatch(/^✅/u);
  });
});
