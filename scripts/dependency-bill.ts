/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The complete-CLI dependency bill — `cli-output-stack` S2.
 *
 * A finished CLI parses its arguments, colours its output, shows a spinner, prints a table and
 * asks a question. Each incumbent publishes its own dependency count, and nobody publishes the
 * sum: what `npm install` puts on disk for the five of them together. This module computes both
 * columns from files the repository already holds and other locks already keep honest, so the
 * row on `/docs/benchmarks` is a projection, never a typed number:
 *
 *   - **ours** is read from `benchmarks/install-graph.json`: the union of what installing each of
 *     `burgee`, `roundel`, `flagstaff` and `caique` alone puts on disk, measured offline from the
 *     packed tarballs and held to a fresh install by `install-graph-lock.test.ts`.
 *   - **theirs** is read from `package-lock.json`: each incumbent's tree walked the way Node
 *     resolves it (nearest `node_modules` first), the same resolution B3 grades and B4 weighs.
 *     `dependency-bill-lock.test.ts` checks each incumbent's tree size against the one
 *     `upstream-watch` resolved from the registry for the same release (`competitors.json`
 *     `seen.packages`), so two instruments must agree before the sum is published.
 *
 * A package is counted once per version on disk: the incumbents install chalk 5 (inside ora) beside
 * chalk 6, and both are on the adopter's disk. The pairing is by role, not by façade: `burgee`
 * parses where commander does, `flagstaff` draws both the spinner and the table.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { publishedManifests } from './family-install.js';

/** One job a complete CLI does, with the package each side installs for it. */
export interface Role {
  job: string;
  ours: string;
  theirs: string;
}

/**
 * The five jobs `cli-output-stack`'s metrics table names, in its order. inquirer is
 * `@inquirer/prompts` (the restatement of 2026-10-18). A function rather than a constant so a
 * mutation run can change it per test: a value built at import time is one Stryker cannot reach.
 */
export function roles(): Role[] {
  return [
  { job: 'parse arguments', ours: 'burgee', theirs: 'commander' },
  { job: 'colour', ours: 'roundel', theirs: 'chalk' },
  { job: 'spinner', ours: 'flagstaff', theirs: 'ora' },
  { job: 'table', ours: 'flagstaff', theirs: 'cli-table3' },
  { job: 'prompts', ours: 'caique', theirs: '@inquirer/prompts' },
  ];
}

/** The fields of a `package-lock.json` (v2/v3) entry this reads. */
export interface LockEntry {
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
}

export interface Lockfile {
  packages: Record<string, LockEntry>;
}

/** The package name a lockfile path installs: `node_modules/a/node_modules/@s/b` → `@s/b`. */
export function nameAt(path: string): string {
  const marker = 'node_modules/';
  return path.slice(path.lastIndexOf(marker) + marker.length);
}

/**
 * Where `dep`, required by the package at `from`, resolves: `from/node_modules/dep`, then each
 * enclosing `node_modules` outward, then the root. Undefined when no level holds it.
 */
export function resolveIn(lock: Lockfile, from: string, dep: string): string | undefined {
  let base = from;
  for (;;) {
    const at = `${base}/node_modules/${dep}`;
    if (lock.packages[at] !== undefined) return at;
    const up = base.lastIndexOf('/node_modules/');
    if (up === -1) break;
    base = base.slice(0, up);
  }
  const top = `node_modules/${dep}`;
  return lock.packages[top] === undefined ? undefined : top;
}

/**
 * Every `name@version` installing `roots` together puts on disk, by the lockfile's resolution:
 * dependencies, non-optional peers (npm installs those), and optional dependencies the lockfile
 * carries. A required dependency the lockfile cannot resolve is an error, because the count would
 * otherwise be short without saying so.
 */
export function lockClosure(lock: Lockfile, roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const entry = lock.packages[path]!;
    out.add(`${nameAt(path)}@${String(entry.version)}`);
    const required = [...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.peerDependencies ?? {}).filter((p) => entry.peerDependenciesMeta?.[p]?.optional !== true)];
    for (const dep of required) {
      const at = resolveIn(lock, path, dep);
      if (at === undefined) throw new Error(`package-lock.json does not resolve ${dep}, which ${nameAt(path)} requires — the bill would be short`);
      visit(at);
    }
    for (const dep of Object.keys(entry.optionalDependencies ?? {})) {
      const at = resolveIn(lock, path, dep);
      if (at !== undefined) visit(at);
    }
  };
  for (const root of roots) {
    const at = `node_modules/${root}`;
    if (lock.packages[at] === undefined) throw new Error(`package-lock.json has no ${root} at the root — add it to a workspace so the bill can be measured`);
    visit(at);
  }
  return [...out].toSorted();
}

/** The fields of `benchmarks/install-graph.json` this reads. */
export interface Graph {
  packages: { name: string; installed: string[] }[];
}

/** Every package installing `roots` alone puts on disk, unioned — the family resolves one version of each. */
export function graphClosure(graph: Graph, roots: readonly string[]): string[] {
  const out = new Set<string>();
  for (const root of roots) {
    const row = graph.packages.find((p) => p.name === root);
    if (row === undefined) throw new Error(`benchmarks/install-graph.json has no row for ${root} — run \`npm run install-graph\``);
    for (const name of row.installed) out.add(name);
  }
  return [...out].toSorted();
}

/** One column of the bill. */
export interface Column {
  /** The packages a user names in `npm install`, deduplicated. */
  asked: string[];
  /** Every package on disk afterwards, the asked ones included. */
  installed: string[];
}

export interface Bill {
  /** Which package each side installs for each job. */
  pairs: Role[];
  /** `outside`: installed packages that are not from the family. Ours only: the incumbents have no family. */
  ours: Column & { outside: string[] };
  theirs: Column;
}

function unique(names: readonly string[]): string[] {
  return [...new Set(names)];
}

/** Both columns, from the measured install graph, the lockfile, and the family's published names. */
export function bill(graph: Graph, lock: Lockfile, family: ReadonlySet<string>): Bill {
  const pairs = roles();
  const oursAsked = unique(pairs.map((r) => r.ours));
  const theirsAsked = unique(pairs.map((r) => r.theirs));
  const ours = graphClosure(graph, oursAsked);
  return {
    pairs,
    ours: { asked: oursAsked, installed: ours, outside: ours.filter((name) => !family.has(name)) },
    theirs: { asked: theirsAsked, installed: lockClosure(lock, theirsAsked) },
  };
}

/** Names installed at more than one version: `chalk@5.6.2` and `chalk@6.0.1` → `chalk`. */
export function twice(installed: readonly string[]): string[] {
  const names = installed.map((spec) => spec.slice(0, spec.lastIndexOf('@')));
  return unique(names.filter((name, i) => names.indexOf(name) !== i)).toSorted();
}

function code(names: readonly string[]): string {
  return names.map((n) => `\`${n}\``).join(' + ');
}

/** The B4 subsection the benchmarks page prints. */
export function section({ pairs, ours, theirs }: Bill): string {
  const doubled = twice(theirs.installed);
  return [
    '### A complete CLI — the dependency bill',
    '',
    'What `npm install` puts on disk for a CLI that parses its arguments, colours its output, shows a',
    'spinner, prints a table and asks a question. Ours is the union of each package installed alone,',
    'offline, from its tarball ([supply chain](/docs/supply-chain)). Theirs is each incumbent\'s tree as',
    '`package-lock.json` resolves it, and each tree\'s size agrees with the one the upstream watch',
    'resolved from the registry for the same release. A package installed at two versions counts twice:',
    'both are on disk.',
    '',
    `Paired by job: ${pairs.map((p) => `${p.job} (\`${p.ours}\` for \`${p.theirs}\`)`).join(', ')}.`,
    '',
    '| `npm install` | Packages installed | Beyond the ones named | Installed at two versions | From outside the family |',
    '| :--- | ---: | ---: | ---: | ---: |',
    `| ${code(ours.asked)} | **${String(ours.installed.length)}** | ${String(ours.installed.length - ours.asked.length)} | 0 | **${String(ours.outside.length)}** |`,
    `| ${code(theirs.asked)} | **${String(theirs.installed.length)}** | ${String(theirs.installed.length - theirs.asked.length)} | ${String(doubled.length)} | — |`,
    '',
    `Ours installs ${ours.installed.map((n) => `\`${n}\``).join(', ')}, every one published from this repository. Theirs installs ${doubled.map((n) => `\`${n}\``).join(', ')} twice, at two versions each; the incumbents are separate projects, so the last column has no meaning for them.`,
  ].join('\n');
}

/** The bill as the repository holds it at `root`: the committed install graph, the lockfile, the published family. */
export function readBill(root: string): Bill {
  const json = <T>(file: string): T => JSON.parse(readFileSync(join(root, file), 'utf8')) as T;
  return bill(json<Graph>('benchmarks/install-graph.json'), json<Lockfile>('package-lock.json'), new Set(publishedManifests(root).keys()));
}
