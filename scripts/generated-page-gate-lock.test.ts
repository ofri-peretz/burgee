/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * A drift gate that does not block is a drift gate that reports.
 *
 * Both generated pages in this repo — `benchmarks.mdx` and `compatibility.mdx` — carry
 * "Do not edit by hand", and both have a `--check` that regenerates and compares. Neither
 * gate was ever wrong. Both sat in jobs whose check name branch protection does not
 * require:
 *
 *   compat.yml  ratchet  `Ratchet · each host's suite against burgee`
 *   bench.yml   cheap    `B2 cold start · B3 compatibility · B4 weight`
 *
 * On 2026-09-10 that cost a red main. PR #197 graded `linegauge` against string-width's
 * suite and did not regenerate `compatibility.mdx`. `compat:page --check` failed at
 * 14:44:16. The PR merged at 14:44:45 — twenty-nine seconds later — and main stayed red
 * until #199. It was found because #191, #195 and #198 all went red on a job none of them
 * had touched, which reads as three broken PRs rather than one broken main.
 *
 * So the invariant is not "the check exists". It is: **every job that regenerates a
 * committed page and compares must report a REQUIRED context.** Asserted against the
 * workflow YAML, so a new generated page parked in a convenient informational job fails
 * here rather than the next time someone forgets to regenerate.
 *
 * `REQUIRED_CHECKS` in `lint-workflows.ts` is a committed copy of branch protection —
 * that trade is documented there. Read the real list back with:
 *
 *   gh api repos/ofri-peretz/burgee/branches/main/protection/required_status_checks \
 *     --jq '.contexts[]'
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const WORKFLOWS = join(root, '.github', 'workflows');

/**
 * The required contexts, read out of the linter rather than restated here. Two copies of
 * the same list drift, and the one that drifts is always the one in the test.
 */
const REQUIRED = new Set(
  [
    ...(
      /const REQUIRED_CHECKS = new Set\(\[([\s\S]*?)\]\);/.exec(
        readFileSync(join(root, 'scripts', 'lint-workflows.ts'), 'utf8'),
      )?.[1] ?? ''
    )
      // Every quoted literal in the array body, whether the list is written on one line
      // or across many. Comments there are prose, not context names — none of the reasons
      // recorded beside these entries contains a quoted string, and one that did would add
      // a name here rather than remove one, so the failure direction stays loud.
      .matchAll(/(['"])(.+?)\1/g),
  ].map((m) => m[2]),
);

/**
 * A step that regenerates a committed page and compares.
 *
 * Matched on the `*:page` script plus `--check`, which is this repo's one convention for
 * it (`compat:page`, `bench:page`). A third page would follow the same naming or it is
 * not one of these; anything else is a different kind of check and does not belong in
 * this gate's scope.
 */
const PAGE_CHECK = /\b\w[\w-]*:page\b[^\n]*--check/;

type Step = { run?: unknown; name?: unknown; env?: Record<string, unknown> };
type Job = {
  name?: unknown;
  steps?: Step[];
  uses?: unknown;
  needs?: string | string[];
};

const needsOf = (j: Job): string[] =>
  Array.isArray(j.needs) ? j.needs : typeof j.needs === 'string' ? [j.needs] : [];

/**
 * Does a red `job` stop a merge in `jobs`?
 *
 * Directly, when its own context is required. Indirectly, when a required AGGREGATE job
 * needs it — the shape `Quality Gate` and `Quality (Full) Gate` both use, and the reason
 * this repo has only three required contexts for twenty-odd jobs.
 *
 * An aggregate must be shown to READ the result, not merely to list the job in `needs`.
 * `needs` alone only orders the jobs: `if: always()` is on every one of these aggregates,
 * so a feeder that nothing reads is a feeder that cannot fail the gate. That is a
 * one-line omission when adding a job to an aggregate, it looks exactly like coverage,
 * and it is the failure this whole file exists to refuse.
 */
function blocks(jobKey: string, jobs: Record<string, Job>, required: Set<string>): boolean {
  const context = (j: Job, key: string) => (typeof j.name === 'string' ? j.name : key);
  if (required.has(context(jobs[jobKey] ?? {}, jobKey))) return true;

  for (const [aggKey, agg] of Object.entries(jobs)) {
    if (!required.has(context(agg, aggKey))) continue;
    // Transitive: an aggregate may sit behind another gate job.
    const seen = new Set<string>();
    const queue = needsOf(agg);
    while (queue.length > 0) {
      const n = queue.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(...needsOf(jobs[n] ?? {}));
    }
    if (!seen.has(jobKey)) continue;

    const body = JSON.stringify(agg.steps ?? []);
    if (
      body.includes(`needs['${jobKey}'].result`) ||
      body.includes(`needs["${jobKey}"].result`) ||
      body.includes(`needs.${jobKey}.result`)
    ) {
      return true;
    }
  }
  return false;
}

interface Finding {
  file: string;
  job: string;
  context: string;
  step: string;
  /** The `<name>:page` npm script the step runs — the page this gate covers. */
  script: string;
  blocking: boolean;
}

function findPageGates(): Finding[] {
  const out: Finding[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml'))) {
    const doc = loadYaml(readFileSync(join(WORKFLOWS, file), 'utf8')) as {
      jobs?: Record<string, Job>;
    };
    for (const [key, job] of Object.entries(doc?.jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (typeof step.run !== 'string' || !PAGE_CHECK.test(step.run)) continue;
        out.push({
          file,
          job: key,
          // A check reports under the job's `name:` where it has one, its key otherwise.
          context: typeof job.name === 'string' ? job.name : key,
          step: typeof step.name === 'string' ? step.name : step.run.trim(),
          script: /\b(\w[\w-]*:page)\b/.exec(step.run)![1],
          blocking: blocks(key, doc?.jobs ?? {}, REQUIRED),
        });
      }
    }
  }
  return out;
}

describe('a generated page is gated by a check that can block a merge', () => {
  const gates = findPageGates();

  it('finds the page gates at all', () => {
    // A regex that matches nothing passes the assertion below vacuously, and this repo
    // has two pages. If a rename drops the `*:page --check` convention, fail HERE — with
    // the reason — rather than reporting full coverage of an empty set.
    // Named, not counted: this repo has exactly two generated pages, and a lock that
    // only counted would keep passing if one gate were deleted and another added.
    const scripts = gates.map((g) => g.script);
    const raw = gates.map((g) => `${g.file}:${g.job}`);
    expect(
      [...new Set(scripts)].sort(),
      `no \`*:page ... --check\` step found for both pages (saw ${raw.join(', ') || 'nothing'}). ` +
        'Either a page gate is gone or it no longer follows the naming this lock matches ' +
        'on — in which case this file reports coverage of an empty set.',
    ).toEqual(['bench:page', 'compat:page']);
  });

  it.each(gates.map((g) => [`${g.file} › ${g.job}`, g] as const))(
    '%s reports a required context',
    (_label, gate) => {
      expect(
        gate.blocking,
        `${gate.file}: the job \`${gate.job}\` runs "${gate.step}" but reports ` +
          `\`${gate.context}\`, which neither branch protection requires nor a required ` +
          `aggregate reads. A red page check there does not stop a merge — that is ` +
          `exactly how PR #197 landed a stale compatibility.mdx and left main red. ` +
          `Either add the job to a required aggregate's \`needs\` AND to the results it ` +
          `reads (\`Quality Gate\` aggregates the cheap ones), or add this context to ` +
          `REQUIRED_CHECKS in scripts/lint-workflows.ts *and* to branch protection.`,
      ).toBe(true);
    },
  );

  it('a required aggregate that never READS the result does not count as blocking', () => {
    // The half of `blocks` that is not exercised by the repo as it stands, and the one
    // that would silently reopen this hole. `if: always()` is on every aggregate here, so
    // a job listed in `needs` but absent from the results the gate reads runs, goes red,
    // and the aggregate still reports success. Adding a feeder to `needs` and forgetting
    // the `R_*` line is a one-line omission that looks exactly like coverage.
    const feeder = { name: 'Generated Pages', steps: [{ run: 'npm run x:page -- --check' }] };
    const reads = {
      'generated-pages': feeder,
      gate: {
        name: 'Quality Gate',
        needs: ['generated-pages'],
        steps: [{ env: { R: "${{ needs['generated-pages'].result }}" }, run: 'check "$R"' }],
      },
    };
    const ignores = {
      'generated-pages': feeder,
      gate: { name: 'Quality Gate', needs: ['generated-pages'], steps: [{ run: 'echo hi' }] },
    };
    const required = new Set(['Quality Gate']);
    expect(blocks('generated-pages', reads, required)).toBe(true);
    expect(blocks('generated-pages', ignores, required)).toBe(false);
  });

  it('parsed the required-context list out of lint-workflows.ts', () => {
    // The list is scraped from source. A refactor that changes its shape would empty this
    // set and turn every assertion above into a guaranteed failure — loud, not silent —
    // but say so plainly rather than making someone diff the regex.
    expect(REQUIRED.has('Quality Gate'), 'REQUIRED_CHECKS did not parse').toBe(true);
  });
});
