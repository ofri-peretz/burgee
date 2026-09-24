#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * release-order.mts — the order `release.yml` publishes in, computed from the package.json files.
 *
 * On 2026-09-23 run 35822025894 published every package from a parallel matrix. The
 * `burgee@0.10.0` leg reached npm at 05:34:36Z; the `closeout@0.4.0` and `linegauge@0.4.3` legs
 * it depends on (`^0.4.0`, `^0.4.3`) arrived at 05:39:56Z and 05:42:49Z. For those ~8 minutes
 * `npm i burgee` failed with ETARGET. Nothing in the matrix knew that burgee needed them first.
 *
 * So the order is a topological sort of the workspace graph — `dependencies`,
 * `peerDependencies` and `optionalDependencies` that name another workspace package — taken
 * at run time, never a list somebody wrote down and forgot to update. The publish job walks
 * it in one loop and, before each package, waits until every in-family dependency is on npm
 * at the workspace's version.
 *
 * Plain Node (type stripping, builtins only): the publish job has no `node_modules`.
 *
 *   node scripts/release-order.mts        # JSON: every public package, dependencies first
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

/** A workspace package, as the release sees it. */
export interface WorkspacePackage {
  /** Directory under `packages/`. */
  dir: string;
  name: string;
  version: string;
  private: boolean;
  /** Names of the other workspace packages it depends on, on any of the three fields. */
  deps: string[];
}

/** One row of the plan `release.yml` publishes from. */
export interface PlanRow {
  dir: string;
  name: string;
  version: string;
  /** In-family dependencies at the version the workspace holds — what must be on npm first. */
  deps: { name: string; version: string }[];
}

/** The manifest fields a workspace dependency can sit on. `devDependencies` never ship. */
export const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const;

interface Manifest {
  name?: string;
  version?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Every `packages/<dir>/package.json` under `root`, with its in-family edges resolved. */
export function readWorkspace(root: string): WorkspacePackage[] {
  const base = path.join(root, 'packages');
  const manifests = fs
    .readdirSync(base)
    .toSorted()
    .map((dir) => ({ dir, file: path.join(base, dir, 'package.json') }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ dir, file }) => ({ dir, manifest: JSON.parse(fs.readFileSync(file, 'utf8')) as Manifest }));
  const names = new Set(manifests.map(({ manifest }) => manifest.name ?? ''));
  return manifests.map(({ dir, manifest }) => ({
    dir,
    name: manifest.name ?? dir,
    version: manifest.version ?? '0.0.0',
    private: manifest.private === true,
    deps: [...new Set(DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {})))].filter((n) => names.has(n)).toSorted(),
  }));
}

/**
 * The public packages, every one after all the workspace packages it depends on. Kahn's
 * algorithm, taking ready packages by name so the order is stable run to run. Throws on a
 * cycle, and on a public package that depends on a private one — neither can be installed
 * from npm in any order.
 */
export function publishOrder(pkgs: readonly WorkspacePackage[]): WorkspacePackage[] {
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  const pub = pkgs.filter((p) => !p.private);
  for (const p of pub) {
    const hidden = p.deps.filter((d) => byName.get(d)?.private === true);
    if (hidden.length > 0) throw new Error(`${p.name} depends on private workspace package(s) ${hidden.join(', ')} — npm can never install it.`);
  }
  const pending = new Map(pub.map((p) => [p.name, new Set(p.deps)]));
  const order: WorkspacePackage[] = [];
  while (pending.size > 0) {
    const ready = [...pending].filter(([, deps]) => deps.size === 0).map(([name]) => name).toSorted();
    if (ready.length === 0) throw new Error(`dependency cycle among ${[...pending.keys()].toSorted().join(', ')} — no publish order exists.`);
    for (const name of ready) {
      pending.delete(name);
      for (const deps of pending.values()) deps.delete(name);
      order.push(byName.get(name) as WorkspacePackage);
    }
  }
  return order;
}

/** Every place `order` publishes a package before a workspace package it depends on. */
export function orderProblems(order: readonly string[], pkgs: readonly WorkspacePackage[]): string[] {
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  const at = new Map(order.map((name, i) => [name, i]));
  return order.flatMap((name, i) =>
    (byName.get(name)?.deps ?? [])
      .filter((d) => (at.get(d) ?? -1) > i)
      .map((d) => `${name} is published before ${d}, which it depends on.`),
  );
}

/** The plan: the public packages in publish order, each with its dependencies' workspace versions. */
export function plan(pkgs: readonly WorkspacePackage[]): PlanRow[] {
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  return publishOrder(pkgs).map((p) => ({
    dir: p.dir,
    name: p.name,
    version: p.version,
    deps: p.deps.map((d) => ({ name: d, version: byName.get(d)?.version ?? '' })),
  }));
}

interface WorkflowStep {
  run?: string;
}
interface WorkflowJob {
  needs?: string | string[];
  strategy?: { matrix?: unknown };
  steps?: WorkflowStep[];
}
export interface WorkflowShape {
  jobs?: Record<string, WorkflowJob | null | undefined>;
}

const PUBLISHES = /\bnpm publish\b/;
const THIS_SCRIPT = 'scripts/release-order.mts';

/**
 * A workflow that runs `npm publish` must publish in the computed order: from exactly one
 * job, without a matrix (legs run in parallel and cannot wait on each other), reading the
 * `plan` output of a job it needs that runs this script. A hand-written package list fails
 * the last rule, because it is not that output.
 */
const INCIDENT = 'burgee@0.10.0 reached npm ~8 minutes before closeout@0.4.0 and linegauge@0.4.3 on 2026-09-23';

/** Does this job read the `plan` output of a job it needs that runs this script? */
function readsComputedPlan(wf: WorkflowShape, job: WorkflowJob): boolean {
  const needs = typeof job.needs === 'string' ? [job.needs] : (job.needs ?? []);
  const text = JSON.stringify(job);
  return needs.some((n) => (wf.jobs?.[n]?.steps ?? []).some((s) => (s.run ?? '').includes(THIS_SCRIPT)) && text.includes(`needs.${n}.outputs.plan`));
}

/** What is wrong with one publishing job. */
function publisherProblems(file: string, wf: WorkflowShape, key: string, job: WorkflowJob): string[] {
  const problems: string[] = [];
  if (job.strategy?.matrix !== undefined) {
    problems.push(
      `[publish-order] ${file} → ${key}: publishes from a matrix — its legs run in parallel with no dependency waits (${INCIDENT}). Walk the plan from ${THIS_SCRIPT} in one ordered loop.`,
    );
  }
  if (!readsComputedPlan(wf, job)) {
    problems.push(
      `[publish-order] ${file} → ${key}: does not publish from \`needs.<job>.outputs.plan\` of a needed job that runs ${THIS_SCRIPT} — the order must be computed from the package.json files at run time, not written by hand.`,
    );
  }
  if (!(job.steps ?? []).some((s) => /\bnpm view\b/.test(s.run ?? ''))) {
    problems.push(`[publish-order] ${file} → ${key}: never runs \`npm view\` — it cannot wait for a dependency to be on npm, nor skip a version that already is.`);
  }
  return problems;
}

/**
 * A workflow that runs `npm publish` must publish in the computed order: from exactly one
 * job, without a matrix (legs run in parallel and cannot wait on each other), reading the
 * `plan` output of a job it needs that runs this script. A hand-written package list fails
 * the last rule, because it is not that output.
 */
export function publishOrderProblems(file: string, wf: WorkflowShape): string[] {
  const jobs = Object.entries(wf.jobs ?? {}).filter((e): e is [string, WorkflowJob] => !!e[1]);
  const publishers = jobs.filter(([, job]) => (job.steps ?? []).some((s) => PUBLISHES.test(s.run ?? '')));
  const problems = publishers.flatMap(([key, job]) => publisherProblems(file, wf, key, job));
  if (publishers.length > 1) {
    problems.unshift(
      `[publish-order] ${file}: ${publishers.length} jobs run \`npm publish\` (${publishers.map(([k]) => k).join(', ')}) — jobs run in parallel, so a package can reach npm before a sibling it depends on (${INCIDENT}). Publish from one job, in the order ${THIS_SCRIPT} computes.`,
    );
  }
  return problems;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  process.stdout.write(`${JSON.stringify(plan(readWorkspace(root)))}\n`);
}
