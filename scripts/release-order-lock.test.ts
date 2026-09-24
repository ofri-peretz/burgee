import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Release-order lock — a package reaches npm only after every workspace package it depends on.
 *
 * 2026-09-23, run 35822025894: `release.yml` published from a parallel matrix. The
 * `burgee@0.10.0` leg finished at 05:33:25Z (npm time 05:34:36Z); `closeout@0.4.0` and
 * `linegauge@0.4.3`, which burgee pins at `^0.4.0` and `^0.4.3`, reached npm at 05:39:56Z and
 * 05:42:49Z. For ~8 minutes `npm i burgee` failed. The fix is an order computed from the
 * package.json files (`scripts/release-order.mts`), walked by one loop that waits for each
 * in-family dependency before publishing.
 *
 * The loop is **executed, not grepped**: the publish step's real `run:` block is lifted out of
 * the parsed workflow and run under `bash` against a fake workspace, with `npm`, `git`, `gh`
 * and `sleep` stubbed and a file standing in for the registry. What it publishes, and in what
 * order, is read back from that file.
 *
 * Proven red, one mutation at a time (2026-09-23):
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | `release.yml` as it was on main (matrix, one job per package) | the workflow publishes in the computed order |
 * | add `strategy.matrix` to the publish job | refuses a publishing matrix |
 * | detect lists the packages by hand instead of running the script | refuses an order that is not the computed plan |
 * | a second job that runs `npm publish` | refuses two publishing jobs |
 * | `publishOrder` drops `peerDependencies` | counts peerDependencies as edges |
 * | `publishOrder` returns packages alphabetically | puts every package after its dependencies |
 * | publish loop: delete the "listed after it" branch | refuses a hand-shuffled plan |
 * | publish loop: delete the `failed` check | holds back the dependents of a package that failed |
 * | publish loop: delete the `until installable` wait | waits for a dependency the registry has not served yet |
 */

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { orderProblems, plan, publishOrder, publishOrderProblems, readWorkspace, type PlanRow, type WorkflowShape, type WorkspacePackage } from './release-order.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = join(REPO_ROOT, '.github', 'workflows', 'release.yml');

interface Step {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  needs?: string[];
  strategy?: { matrix?: unknown };
  steps?: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
}

const release = (): Workflow => loadYaml(readFileSync(RELEASE, 'utf8')) as Workflow;
const workspace = readWorkspace(REPO_ROOT);
const pkg = (name: string, deps: string[] = [], extra: Partial<WorkspacePackage> = {}): WorkspacePackage => ({ dir: name, name, version: '1.0.0', private: false, deps, ...extra });

describe('the order is a topological sort of the workspace graph', () => {
  it('puts every package after its dependencies, on the real workspace', () => {
    const order = publishOrder(workspace).map((p) => p.name);
    expect(orderProblems(order, workspace)).toEqual([]);
  });

  it('publishes burgee after the five siblings it depends on', () => {
    const order = publishOrder(workspace).map((p) => p.name);
    const burgee = workspace.find((p) => p.name === 'burgee');
    expect(burgee?.deps.length, 'burgee lost its in-family edges').toBeGreaterThan(0);
    for (const dep of burgee?.deps ?? []) expect(order.indexOf(dep), `${dep} after burgee`).toBeLessThan(order.indexOf('burgee'));
  });

  it('covers every public package, and no private one', () => {
    const names = plan(workspace).map((r) => r.name).toSorted();
    expect(names).toEqual(workspace.filter((p) => !p.private).map((p) => p.name).toSorted());
  });

  it('refuses a hand-shuffled order', () => {
    const order = publishOrder(workspace).map((p) => p.name);
    const shuffled = ['burgee', ...order.filter((n) => n !== 'burgee')];
    expect(orderProblems(shuffled, workspace).join('\n')).toMatch(/burgee is published before closeout/);
  });

  it('counts peerDependencies as edges, and ignores packages outside the family', () => {
    const root = mkdtempSync(join(tmpdir(), 'release-order-'));
    const write = (dir: string, manifest: object) => {
      mkdirSync(join(root, 'packages', dir), { recursive: true });
      writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(manifest));
    };
    write('a', { name: 'a', version: '1.0.0', peerDependencies: { b: '^1' }, dependencies: { chalk: '^5' } });
    write('b', { name: 'b', version: '1.0.0', optionalDependencies: { c: '^1' } });
    write('c', { name: 'c', version: '1.0.0', devDependencies: { a: '*' } });
    const pkgs = readWorkspace(root);
    expect(pkgs.map((p) => [p.name, p.deps])).toEqual([
      ['a', ['b']],
      ['b', ['c']],
      ['c', []],
    ]);
    expect(publishOrder(pkgs).map((p) => p.name)).toEqual(['c', 'b', 'a']);
  });

  it('throws on a cycle, and on a public package that needs a private one', () => {
    expect(() => publishOrder([pkg('a', ['b']), pkg('b', ['a'])])).toThrow(/cycle/);
    expect(() => publishOrder([pkg('a', ['p']), pkg('p', [], { private: true })])).toThrow(/private/);
  });
});

describe('release.yml publishes in the computed order', () => {
  it('passes the workflow rule', () => {
    expect(publishOrderProblems('release.yml', release() as WorkflowShape)).toEqual([]);
  });

  it('refuses a publishing matrix — parallel legs with no dependency waits', () => {
    const wf = release();
    (wf.jobs.publish as Job).strategy = { matrix: { include: [] } };
    expect(publishOrderProblems('release.yml', wf as WorkflowShape).join('\n')).toMatch(/publishes from a matrix/);
  });

  it('refuses an order that is not the computed plan', () => {
    const wf = release();
    for (const s of wf.jobs.detect?.steps ?? []) if (s.run) s.run = s.run.replace('node scripts/release-order.mts', `echo '[{"name":"burgee"},{"name":"closeout"}]'`);
    expect(publishOrderProblems('release.yml', wf as WorkflowShape).join('\n')).toMatch(/not written by hand/);
  });

  it('refuses two publishing jobs', () => {
    const wf = release();
    wf.jobs['publish-again'] = structuredClone(wf.jobs.publish as Job);
    expect(publishOrderProblems('release.yml', wf as WorkflowShape).join('\n')).toMatch(/2 jobs run `npm publish`/);
  });
});

/** The publish job's loop, as the runner executes it. */
const loopStep = (): Step => {
  const s = (release().jobs.publish?.steps ?? []).find((x) => /\bnpm publish\b/.test(x.run ?? ''));
  if (!s?.run) throw new Error('release.yml → publish has no step that runs `npm publish`');
  return s;
};

interface Run {
  status: number;
  output: string;
  /** name@version in the order `npm publish` ran. */
  published: string[];
  /** `<pkg> before <dep>`: published while the registry did not yet serve a dependency. */
  early: string[];
}

/**
 * Runs the loop over `rows` in a fake workspace. `onNpm` is what the registry holds before
 * the run; `failPublish` names packages whose `npm publish` exits 1; `lag` is how many
 * `npm view` calls a fresh publish misses before the registry serves it.
 */
function runLoop(rows: PlanRow[], opts: { onNpm?: string[]; failPublish?: string[]; lag?: number } = {}): Run {
  const dir = mkdtempSync(join(tmpdir(), 'release-loop-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, '.sdlc', 'bands'), { recursive: true });
  copyFileSync(join(REPO_ROOT, 'scripts', 'changelog-section.sh'), join(dir, 'scripts', 'changelog-section.sh'));
  writeFileSync(join(dir, '.sdlc', 'bands', 'scoreboard-public.json'), JSON.stringify({ commanderCompatibilityPage: 'https://example.test/compat' }));
  for (const r of rows) {
    mkdirSync(join(dir, 'packages', r.dir, 'dist'), { recursive: true });
    const dependencies = Object.fromEntries(r.deps.map((d) => [d.name, d.version]));
    writeFileSync(join(dir, 'packages', r.dir, 'package.json'), JSON.stringify({ name: r.name, version: r.version, dependencies }));
  }
  const registry = join(dir, 'registry');
  const log = join(dir, 'published');
  const early = join(dir, 'early');
  writeFileSync(early, '');
  writeFileSync(registry, (opts.onNpm ?? []).map((x) => `${x}\n`).join(''));
  writeFileSync(log, '');
  const shim = (name: string, body: string[]) => {
    writeFileSync(join(bin, name), ['#!/usr/bin/env bash', ...body, ''].join('\n'));
    chmodSync(join(bin, name), 0o755);
  };
  // The registry serves a fresh publish only after it has been asked for it LAG times — a
  // stand-in for the seconds of lag between `npm publish` returning and `npm i` resolving it.
  // A publish whose dependency is not served yet is written to EARLY: that is the incident.
  shim('npm', [
    'served() { grep -qxF "$1" "$REGISTRY" || return 1; grep -qxF "$1" "$PUBLISHED_LOG" || return 0; [ "$(grep -cxF "$1" "$REGISTRY.views" 2>/dev/null || true)" -gt "${LAG:-0}" ]; }',
    'if [ "$1" = "view" ]; then',
    '  echo "$2" >> "$REGISTRY.views"',
    '  served "$2" || exit 1',
    '  echo "${2##*@}"; exit 0',
    'fi',
    'if [ "$1" = "publish" ]; then',
    '  id=$(node -p "const p=require(\'./package.json\'); p.name+\'@\'+p.version")',
    '  case " $FAIL_PUBLISH " in *" ${id%@*} "*) echo "E403 $id" >&2; exit 1 ;; esac',
    '  for dep in $(node -p "Object.entries(require(\'./package.json\').dependencies||{}).map(([n,v])=>n+\'@\'+v).join(\' \')"); do',
    '    served "$dep" || echo "$id before $dep" >> "$EARLY"',
    '  done',
    '  echo "$id" >> "$REGISTRY"; echo "$id" >> "$PUBLISHED_LOG"; exit 0',
    'fi',
    'exit 2',
  ]);
  shim('git', ['exit 0']);
  shim('gh', ['[ "$1 $2" = "release view" ] && exit 1', 'exit 0']);
  shim('sleep', ['exit 0']);

  const script = join(dir, 'step.sh');
  writeFileSync(script, loopStep().run ?? '');
  const summary = join(dir, 'summary');
  writeFileSync(summary, '');
  const r = spawnSync('bash', [script], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      HOME: dir,
      RUNNER_TEMP: dir,
      GITHUB_STEP_SUMMARY: summary,
      DRY_RUN: 'false',
      DIST_TAG: 'latest',
      DEP_WAIT_SECONDS: '60',
      PLAN: JSON.stringify(rows),
      REGISTRY: registry,
      PUBLISHED_LOG: log,
      FAIL_PUBLISH: (opts.failPublish ?? []).join(' '),
      LAG: String(opts.lag ?? 0),
      EARLY: early,
    },
  });
  return {
    status: r.status ?? -1,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    published: readFileSync(log, 'utf8').split('\n').filter(Boolean),
    early: readFileSync(early, 'utf8').split('\n').filter(Boolean),
  };
}

const names = (ids: string[]) => ids.map((id) => id.slice(0, id.lastIndexOf('@')));
const executes = it.skipIf(process.platform === 'win32');
const realPlan = plan(workspace);

describe('the publish loop, executed', () => {
  executes('publishes the whole plan, every package after its dependencies', () => {
    const r = runLoop(realPlan);
    expect(r.status, r.output).toBe(0);
    expect(r.published.length).toBe(realPlan.length);
    expect(orderProblems(names(r.published), workspace)).toEqual([]);
    expect(r.early).toEqual([]);
  });

  executes('waits for a dependency the registry has not served yet', () => {
    const r = runLoop(realPlan, { lag: 2 });
    expect(r.status, r.output).toBe(0);
    expect(r.published.length).toBe(realPlan.length);
    expect(r.early, 'published while a dependency was not yet installable').toEqual([]);
  });

  executes('refuses a hand-shuffled plan instead of publishing burgee first', () => {
    const shuffled = [...realPlan.filter((x) => x.name === 'burgee'), ...realPlan.filter((x) => x.name !== 'burgee')];
    const r = runLoop(shuffled);
    expect(r.status).not.toBe(0);
    expect(names(r.published)).not.toContain('burgee');
    expect(r.output).toMatch(/Not publishing burgee@.* after it/);
  });

  executes('holds back the dependents of a package that failed, and still releases the unrelated ones', () => {
    const r = runLoop(realPlan, { failPublish: ['closeout'] });
    expect(r.status).not.toBe(0);
    const out = names(r.published);
    const dependents = workspace.filter((p) => p.deps.includes('closeout')).map((p) => p.name);
    expect(dependents.length).toBeGreaterThan(0);
    for (const d of dependents) expect(out, `${d} published without closeout`).not.toContain(d);
    expect(out).toContain('paratext');
    expect(r.output).toMatch(/Not publishing burgee@\S+ — its dependency closeout@\S+ did not publish in this run/);
  });

  executes('publishes against a dependency already on npm, and refuses one that is not', () => {
    const burgee = realPlan.find((x) => x.name === 'burgee') as PlanRow;
    const already = burgee.deps.map((d) => `${d.name}@${d.version}`);
    const ok = runLoop([burgee], { onNpm: already });
    expect(ok.status, ok.output).toBe(0);
    expect(names(ok.published)).toEqual(['burgee']);

    const missing = runLoop([burgee], { onNpm: already.slice(1) });
    expect(missing.status).not.toBe(0);
    expect(missing.published).toEqual([]);
    expect(missing.output).toMatch(/is not on npm and this run does not publish it/);
  });

  executes('skips a version already on npm, and still tags and releases it', () => {
    const leaf = realPlan[0] as PlanRow;
    const r = runLoop([leaf], { onNpm: [`${leaf.name}@${leaf.version}`] });
    expect(r.status, r.output).toBe(0);
    expect(r.published).toEqual([]);
    expect(r.output).toMatch(/already on npm — skipping publish/);
  });
});

it('the fake workspace helper really sees the step it runs', () => {
  expect(existsSync(RELEASE)).toBe(true);
  expect(loopStep().run).toContain('npm publish --tag "$DIST_TAG" --access public --provenance');
});
