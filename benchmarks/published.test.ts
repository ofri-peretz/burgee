/**
 * Lock — a CI observation cannot become a published number.
 *
 * Proven necessary before it was written. On 2026-09-09 the recorder ran on a two-core
 * runner and opened a PR replacing `2026-09-09.json` wholesale. Merging it would have
 * demanded `+8.0 ms` of `comparison.mdx` where the page states `+22.6 ms`, turned
 * `docs.test.ts` red on five assertions, and — had the page been updated to match — moved
 * the project's public speed figures to whichever box picked up the job. Nothing got
 * faster; the runner was different, which is exactly what `perf.ts` warns its own readers
 * about.
 *
 * Both halves are checked, because the fix has two halves: the name says which kind of
 * file this is, and every reader that publishes a number honours it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { observations, publishedResults } from './published.js';
import { resultsName } from './run.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
const RESULTS_DIR = join(REPO_ROOT, 'benchmarks', 'results', 'cli-benchmarks');
const ISO_DATE = 10;

const scratch = (files: string[]): string => {
  const dir = mkdtempSync(join(tmpdir(), 'published-'));
  for (const f of files) writeFileSync(join(dir, f), '{}');
  return dir;
};

describe('publishedResults', () => {
  it('skips an observation taken after the last published measurement', () => {
    // The date is deliberately later, and the first version of this test got it wrong. An
    // observation from the *same* day sorts before its measurement by an accident of ASCII
    // — `-` is 0x2D and `.` is 0x2E — so a same-day fixture passes under the old
    // "whichever landed last" rule too, and proves nothing. The case that actually happens
    // is the next morning's run: `2026-09-10-abc1234.json` sorts after `2026-09-09.json`,
    // and "newest file" hands the docs a CI runner's numbers.
    const dir = scratch(['2026-09-09.json', '2026-09-10-abc1234.json']);
    try {
      expect(publishedResults(dir)).toBe('2026-09-09.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still hands every file to the bands, which want the whole series', () => {
    const dir = scratch(['2026-09-09.json', '2026-09-09-4c97680.json']);
    try {
      expect(observations(dir).toSorted()).toEqual(['2026-09-09-4c97680.json', '2026-09-09.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('picks the newest measurement when several have been published', () => {
    const dir = scratch(['2026-09-08.json', '2026-09-10.json', '2026-09-09.json']);
    try {
      expect(publishedResults(dir)).toBe('2026-09-10.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has nothing to publish from a suite that has never run here', () => {
    expect(publishedResults(join(REPO_ROOT, 'benchmarks', 'results', 'no-such-suite'))).toBeUndefined();
  });
});

const SPAWN = 30_000;

describe('the generated page', () => {
  /**
   * End to end, against the real results directory and the real generator: an observation
   * landing beside the measurement must not change a single byte of `/docs/benchmarks`.
   * This is the assertion the workflow's `bench:page --check` step makes on every run, and
   * the one that goes red if a future reader reaches for "the newest file" again.
   */
  /**
   * 30 s, which is the clock the repo's other spawning suites declare (#99). This one
   * starts Node, then tsx, then the generator, and vitest's 5 s default is calibrated for
   * in-process assertions — it timed out on windows-latest and nowhere else.
   */
  it('ignores an observation landing beside the published measurement', { timeout: SPAWN }, () => {
    const published = publishedResults(RESULTS_DIR) as string;
    // Tomorrow's date, so the observation sorts *after* the measurement — see the ASCII
    // note above; a same-day name would leave this green under the rule it exists to refuse.
    const day = new Date(`${published.replace('.json', '')}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    const observation = join(RESULTS_DIR, `${day.toISOString().slice(0, ISO_DATE)}-ffffff0.json`);
    // Divergent on purpose, and on the axis that actually diverges: a copy would pass under
    // the old "newest file" rule too, and would prove nothing. Every duration is doubled,
    // the way a slower runner reads.
    const doc = JSON.parse(readFileSync(join(RESULTS_DIR, published), 'utf8')) as { records: { unit: string; median: number; p95: number }[] };
    for (const r of doc.records) {
      if (r.unit !== 'ms') continue;
      r.median *= 2;
      r.p95 *= 2;
    }
    writeFileSync(observation, JSON.stringify(doc, null, 2));
    try {
      // Exits non-zero when the committed page is not what the results generate.
      // Node, tsx's own entry, and the script — not `npm run bench:page`. On Windows the
      // npm launcher is `npm.cmd`, which `execFileSync` will not find without PATHEXT and
      // then refuses to spawn at all (EINVAL, since the `.cmd` argument-injection fix).
      // Spawning through a shell to get around that would be a shell for the sake of one
      // filename; resolving tsx is the same command with no launcher in it.
      execFileSync(process.execPath, [tsxCli, join(REPO_ROOT, 'scripts', 'bench-page.ts'), '--check'], { cwd: REPO_ROOT, stdio: 'pipe' });
    } finally {
      rmSync(observation, { force: true });
    }
  });
});

/**
 * The third half, added 2026-09-16: **a run that did not measure everything cannot write the
 * published name at all.**
 *
 * The two cases above check that a reader honours the name. Nothing checked that a *writer*
 * earns it, and every caller but `bench.yml`'s two shell lines wrote `YYYY-MM-DD.json`
 * whatever it had measured. `npm run bench -- --axis weight` writes a document with four
 * axes reading `not-run`, under the name `docs.test.ts` pins `comparison.mdx` against —
 * measured the same day, nine cases red, and the only thing between it and a published page
 * stating four missing numbers was a person noticing a dirty file in `git status`.
 */
/** A results document with nothing in it but the two fields the name is built from. */
const doc = (axes: Record<string, { status: string }>): Parameters<typeof resultsName>[0] =>
  ({ suite: 'cli-benchmarks', measured: '2026-09-16T00:00:00.000Z', commit: 'abcdef1234567890', machine: {}, axes, bands: {}, claims: {}, records: [] }) as unknown as Parameters<typeof resultsName>[0];

describe('a document names itself', () => {
  it('publishes when every axis was measured', () => {
    expect(resultsName(doc({ perf: { status: 'measured' }, weight: { status: 'measured' } }), true)).toBe('2026-09-16.json');
  });

  it('is an observation when an axis was not selected — the `--axis weight` case', () => {
    expect(resultsName(doc({ perf: { status: 'not-run' }, weight: { status: 'measured' } }))).toBe('2026-09-16-abcdef1-local.json');
  });

  it('is an observation when a selected axis produced nothing', () => {
    expect(resultsName(doc({ perf: { status: 'skipped' }, weight: { status: 'measured' } }))).toBe('2026-09-16-abcdef1-local.json');
  });

  /**
   * The case that cost a published page on 2026-09-21, and the one completeness alone could
   * not catch: a plain `npm run bench` on a developer's machine measures all four cheap axes,
   * so it *was* complete, so it wrote the name the docs read. The figures it would have
   * republished were an M4 Pro's against a two-core runner's — `+14.0 ms` becoming `+33.8 ms`
   * — which is a change of box, not of code. `bench.yml` already moves a published-named file
   * aside; nothing guarded a laptop.
   *
   * Fails on the unfixed `resultsName`, which returned the dated name for any complete
   * document whatever the caller asked for.
   */
  it('does not publish a complete run the caller did not ask to publish', () => {
    const complete = doc({ perf: { status: 'measured' }, weight: { status: 'measured' } });
    expect(resultsName(complete)).toBe('2026-09-16-abcdef1-local.json');
    expect(resultsName(complete, false)).toBe('2026-09-16-abcdef1-local.json');
  });

  it('and the observation name is one `publishedResults` refuses', () => {
    const name = resultsName(doc({ perf: { status: 'not-run' }, weight: { status: 'measured' } }));
    const dir = mkdtempSync(join(tmpdir(), 'named-'));
    try {
      writeFileSync(join(dir, name), '{}');
      expect(publishedResults(dir), 'the writer and the reader disagree about what an observation looks like').toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * The fourth half, added 2026-09-22: **two runs of one commit on two machines are two
 * observations, and the name has to say so.**
 *
 * `<date>-<sha>.json` named a commit, not a run. On 2026-09-22 a local `npm run bench` of
 * `c0fa8a3` (an M4 Pro, `ci: false`) landed in #420 under the exact path the nightly's run of
 * the same commit (a four-core EPYC, `ci: true`) was about to land at in #419 — so #419 could
 * only have landed by deleting #420's file, and was closed instead. One of two observations
 * of the same code was lost to a filename. D-142.
 */
const SUITES = ['cli-benchmarks', 'agent-cli-bench'] as const;
const SUFFIX = /-(ci|local)\.json$/;

describe('two runs of one commit', () => {
  const complete = { perf: { status: 'measured' }, weight: { status: 'measured' } };
  const on = (ci: boolean): Parameters<typeof resultsName>[0] => ({ ...doc(complete), machine: { ci } }) as unknown as Parameters<typeof resultsName>[0];

  it('a CI observation and a local one of the same commit on the same day never share a name', () => {
    expect(resultsName(on(true))).not.toBe(resultsName(on(false)));
  });

  it('the name is derived from where it ran, so it cannot be asserted wrongly', () => {
    expect(resultsName(on(true))).toBe('2026-09-16-abcdef1-ci.json');
    expect(resultsName(on(false))).toBe('2026-09-16-abcdef1-local.json');
  });

  it('and publishing stays one name, chosen by a person, wherever it ran', () => {
    expect(resultsName(on(true), true)).toBe('2026-09-16.json');
    expect(resultsName(on(false), true)).toBe('2026-09-16.json');
  });

  /**
   * The committed directories, not a fixture. Observations named before the suffix existed
   * are all CI runs — the eleven local ones were renamed when it arrived — so an unsuffixed
   * observation may only be CI, and a suffixed one must agree with its own `machine.ci`.
   */
  it.each(SUITES)('every committed %s observation names the machine class it ran on', (suite) => {
    const dir = join(REPO_ROOT, 'benchmarks', 'results', suite);
    const wrong = observations(dir)
      .filter((f) => f !== publishedResults(dir))
      .filter((f) => {
        const ci = (JSON.parse(readFileSync(join(dir, f), 'utf8')) as { machine: { ci: boolean } }).machine.ci;
        const tag = SUFFIX.exec(f)?.[1];
        const where = ci ? 'ci' : 'local';
        return tag === undefined ? !ci : tag !== where;
      });
    expect(wrong).toEqual([]);
  });
});
