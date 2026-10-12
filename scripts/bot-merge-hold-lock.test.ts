/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Bot-merge hold lock: no workflow merges, or arms auto-merge on, a pull request labelled `hold`,
 * `do-not-merge` or `wip`.
 *
 * On 2026-10-12 every open PR was labelled `hold` and its auto-merge turned off so a release could
 * land. Three bot PRs merged anyway (#1049, #1050, #1055), each merged directly by the
 * RELEASE_BOT_PAT user with no auto-merge event. The bot workflows refresh their rolling PR and then
 * run `gh pr merge --auto --squash`, and `--auto` on a PR that is already mergeable merges it at once
 * instead of arming auto-merge, so the label never got a say.
 *
 * Every `gh pr merge` in `.github/workflows` must sit in the `else` of one shared guard that reads
 * the PR's labels first. Each guarded block is lifted out of the parsed workflow and run under
 * `bash` with `gh` stubbed: held, it must make no `pr merge` call; not held, it must make one, which
 * proves the block lifted out is the one that merges. `gh pr merge --disable-auto` is not a merge.
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(REPO_ROOT, '.github/workflows');

/** The shared guard: the PR's labels, true when any of them says "do not merge". */
const GUARD =
  /^\s*if gh pr view "\$(\w+)" --json labels --jq '\[\.labels\[\]\.name\]\|any\(\.=="hold" or \.=="do-not-merge" or \.=="wip"\)' \| grep -qx true; then$/;

interface Step {
  name?: string;
  run?: string;
}
interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

interface MergeSite {
  where: string;
  run: string;
  /** Index of the line in `run` that calls `gh pr merge`. */
  line: number;
}

/** Strip quoted text and comments, so `echo "… gh pr merge …"` is not mistaken for a call. */
const code = (line: string): string =>
  line
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/(^|\s)#.*$/, '$1');

const isMergeCall = (line: string): boolean => /\bgh pr merge\b(?!.*--disable-auto)/.test(code(line));

function mergeSites(): MergeSite[] {
  const sites: MergeSite[] = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const wf = loadYaml(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow;
    for (const [jobId, job] of Object.entries(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.run !== 'string') continue;
        step.run.split('\n').forEach((l, line) => {
          if (isMergeCall(l)) sites.push({ where: `${file} → ${jobId} → ${step.name ?? '(unnamed)'}:${line + 1}`, run: step.run!, line });
        });
      }
    }
  }
  return sites;
}

/** The guarded block around a merge call — guard line to its `fi` — or why there is none. */
function guardedBlock(site: MergeSite): { block: string; variable: string } | string {
  const lines = site.run.split('\n');
  let at = site.line - 1;
  while (at >= 0 && !GUARD.test(lines[at]!)) at--;
  if (at < 0) return 'no label guard before it';
  const indent = /^\s*/.exec(lines[at]!)![0];
  const elseAt = lines.findIndex((l, i) => i > at && l === `${indent}else`);
  const fiAt = lines.findIndex((l, i) => i > at && l === `${indent}fi`);
  if (fiAt < site.line) return 'the nearest label guard closes before it';
  if (elseAt < 0 || elseAt > site.line || elseAt > fiAt) return 'it is not in the guard’s `else`';
  return { block: lines.slice(at, fiAt + 1).join('\n'), variable: GUARD.exec(lines[at]!)![1]! };
}

function runBlock(block: string, variable: string, labels: string[]): { calls: string[]; status: number; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'bot-merge-hold-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'gh.log');
  // `pr view --json labels --jq …` answers like gh would: the jq expression applied to the labels.
  writeFileSync(
    join(bin, 'gh'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$GH_LOG"',
      'if [ "$1 $2" = "pr view" ]; then',
      '  for ((i = 1; i <= $#; i++)); do if [ "${!i}" = "--jq" ]; then j=$((i + 1)); expr="${!j}"; fi; done',
      '  printf "%s" "$LABELS" | jq -r "$expr"; exit 0',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'gh'), 0o755);
  writeFileSync(log, '');
  writeFileSync(join(dir, 'step.sh'), `set -euo pipefail\n${block}\n`);
  const r = spawnSync('bash', [join(dir, 'step.sh')], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}`,
      HOME: dir,
      GH_LOG: log,
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      LABELS: JSON.stringify({ labels: labels.map((name) => ({ name })) }),
      BREACHED: 'false',
      SOURCE: 'pat',
      [variable]: variable === 'PR' ? '1049' : 'chore/rolling',
    },
  });
  return {
    calls: readFileSync(log, 'utf8').split('\n').filter(Boolean),
    status: r.status ?? -1,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
}

const executes = it.skipIf(process.platform === 'win32');
const SITES = mergeSites();

describe('every `gh pr merge` in .github/workflows', () => {
  it('is found (the scan is not silently empty)', () => {
    // bench ×2, changesets-pr ×2, citation-probe, control-bands, dependabot-automerge, evals.
    expect(SITES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(SITES.map((s) => [s.where, s] as const))('%s sits behind the hold/do-not-merge/wip guard', (_, site) => {
    expect(guardedBlock(site), site.run.split('\n')[site.line]).toEqual(expect.objectContaining({ variable: expect.any(String) }));
  });

  describe.each(SITES.map((s) => [s.where, s] as const))('%s', (_, site) => {
    for (const label of ['hold', 'do-not-merge', 'wip']) {
      executes(`makes no merge call on a PR labelled \`${label}\``, () => {
        const g = guardedBlock(site);
        if (typeof g === 'string') throw new Error(`unguarded: ${g}`);
        const r = runBlock(g.block, g.variable, ['skip-changeset', label]);
        expect(r.status, r.output).toBe(0);
        expect(r.calls.filter((c) => c.startsWith('pr merge')), r.output).toEqual([]);
      });
    }

    executes('still merges a PR that is not held', () => {
      const g = guardedBlock(site);
      if (typeof g === 'string') throw new Error(`unguarded: ${g}`);
      const r = runBlock(g.block, g.variable, ['skip-changeset', 'holding-pattern']);
      expect(r.calls.filter((c) => c.startsWith('pr merge')), r.output).toHaveLength(1);
    });
  });
});
