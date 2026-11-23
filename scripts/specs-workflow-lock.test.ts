/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Specification watch workflow lock — `spec-release-watch` R4 and R7.
 *
 * The daily job gained a third pass, and the part of it nobody reads until it misbehaves is the
 * shell that opens issues. So the issue step is lifted out of `compat-upstream.yml` and run under
 * `bash` with `gh` stubbed: a release already tracked by an open issue with the same title opens
 * nothing, a new one opens exactly one with the right labels, and a pre-release carries both.
 * The pass step is held to the shape R7 needs: after `--competitors`, authenticated with the
 * job's token, its log in the step summary.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

const scratchDir = scratchDirs();

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface Step {
  name?: string;
  if?: string;
  env?: Record<string, string>;
  run?: string;
}
interface Workflow {
  jobs: { watch: { permissions: Record<string, string>; steps: Step[] } };
}

const workflow = loadYaml(readFileSync(join(ROOT, '.github/workflows/compat-upstream.yml'), 'utf8')) as Workflow;
const steps = workflow.jobs.watch.steps;
const stepNamed = (name: string): Step => steps.find((s) => s.name === name) as Step;
const indexOf = (name: string): number => steps.findIndex((s) => s.name === name);

const PASS = 'Check specification releases';
const ISSUES = 'Open one issue per specification release';

describe('the specification pass in compat-upstream.yml (R2, R7)', () => {
  it('runs --specs after --competitors, on the build’s success, with the job’s token', () => {
    const pass = stepNamed(PASS);
    expect(pass.run).toContain('node packages/compat-oracle/dist/bin.js --specs');
    expect(pass.env?.GITHUB_TOKEN).toBe('${{ github.token }}');
    expect(pass.if).toContain("steps.build.outcome == 'success'");
    expect(indexOf(PASS)).toBeGreaterThan(indexOf('Check competitor releases'));
  });

  it('keeps its log, and puts it in the step summary, where an unchecked repo is named (R7)', () => {
    expect(stepNamed(PASS).run).toContain('tee specs.log');
    expect(stepNamed('Summary').run).toContain('cat specs.log');
    expect(stepNamed('Summary').run).toContain('## Specification releases');
  });

  it('opens issues from the same job, which already holds `issues: write`', () => {
    expect(workflow.jobs.watch.permissions.issues).toBe('write');
    expect(indexOf(ISSUES)).toBeGreaterThan(indexOf('Open one issue per competitor release'));
    expect(stepNamed(ISSUES).if).toBe('always()');
  });
});

/** Run the issue step against a report, with `gh` stubbed, and say what it asked `gh` to do. */
function runIssueStep(updates: unknown[] | null, existing = ''): { calls: string[]; stdout: string; status: number | null } {
  const dir = scratchDir('specs-workflow-');
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'packages/compat-oracle'), { recursive: true });
  if (updates !== null) writeFileSync(join(dir, 'packages/compat-oracle/specs-upstream.json'), JSON.stringify({ updates }));
  const log = join(dir, 'gh.log');
  writeFileSync(join(dir, 'bin/gh'), `#!/bin/bash\necho "$@" >> "${log}"\nif [ "$1 $2" = "issue list" ]; then printf '%s' "$EXISTING"; fi\n`);
  chmodSync(join(dir, 'bin/gh'), 0o755);
  writeFileSync(join(dir, 'step.sh'), stepNamed(ISSUES).run as string);
  const result = spawnSync('bash', [join(dir, 'step.sh')], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`, EXISTING: existing },
  });
  let calls: string[] = [];
  try {
    calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  } catch {
    // gh was never called.
  }
  return { calls, stdout: result.stdout, status: result.status };
}

const update = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'OpenAPI',
  title: 'spec: OpenAPI 3.2.0 released (we read 3.0, 3.1)',
  prerelease: false,
  report: '## OpenAPI 3.2.0\n',
  ...over,
});

const creates = (calls: string[]): string[] => calls.filter((c) => c.startsWith('issue create'));

describe('the issue step (R4)', () => {
  it('opens one issue per update, titled as the pass wrote it, labelled `upstream-spec`', () => {
    const { calls, status } = runIssueStep([update(), update({ title: 'spec: OpenAPI 3.2.1 released (we read 3.0, 3.1)' })]);
    expect(status).toBe(0);
    expect(creates(calls)).toEqual([
      'issue create --title spec: OpenAPI 3.2.0 released (we read 3.0, 3.1) --label upstream-spec --body-file spec-body.md',
      'issue create --title spec: OpenAPI 3.2.1 released (we read 3.0, 3.1) --label upstream-spec --body-file spec-body.md',
    ]);
  });

  it('creates both labels first, so a first run does not fail on a missing one', () => {
    const { calls } = runIssueStep([update()]);
    expect(calls.filter((c) => c.startsWith('label create')).map((c) => c.split(' ')[2])).toEqual(['upstream-spec', 'upstream-spec-prerelease']);
    expect(calls.findIndex((c) => c.startsWith('label create'))).toBeLessThan(calls.findIndex((c) => c.startsWith('issue create')));
  });

  it('searches open issues for the exact title under `upstream-spec`, and opens nothing when one is found', () => {
    const { calls, stdout } = runIssueStep([update()], '41');
    const search = calls.find((c) => c.startsWith('issue list')) ?? '';
    expect(search).toContain('--state open');
    expect(search).toContain('--label upstream-spec');
    expect(search).toContain('--search "spec: OpenAPI 3.2.0 released (we read 3.0, 3.1)" in:title');
    expect(creates(calls)).toEqual([]);
    expect(stdout).toContain('#41 already tracks: spec: OpenAPI 3.2.0 released (we read 3.0, 3.1)');
  });

  it('labels a pre-release `upstream-spec-prerelease` as well, and a release only `upstream-spec`', () => {
    const { calls } = runIssueStep([update({ prerelease: true, title: 'spec: OpenAPI 3.3.0-rc1 released (we read 3.0)' }), update()]);
    expect(creates(calls).map((c) => /--label (\S+)/.exec(c)?.[1])).toEqual(['upstream-spec,upstream-spec-prerelease', 'upstream-spec']);
  });

  it('does nothing, and succeeds, when the pass found no update or produced no report', () => {
    expect(runIssueStep([]).calls).toEqual([]);
    const none = runIssueStep(null);
    expect(none.calls).toEqual([]);
    expect(none.status).toBe(0);
    expect(none.stdout).toContain('No specification report was produced.');
  });

  it('writes nothing to `.changeset/` and opens no pull request: a new spec version is a design question', () => {
    const run = stepNamed(ISSUES).run ?? '';
    expect(run).not.toContain('.changeset');
    expect(run).not.toContain('pr create');
  });
});
