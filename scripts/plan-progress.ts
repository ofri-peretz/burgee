/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `.sdlc/PLAN.md`'s progress, read from the tree rather than from ticked boxes.
 *
 * A plan with checkboxes is a plan someone has to keep honest by hand, and this
 * repository has watched that fail twice in three days — nine roadmap rows stale on
 * 09-10, two more by 09-13, every one of them a box somebody forgot. So the plan holds
 * no boxes. Each step declares the condition that makes it true and this reads the
 * condition.
 *
 * Run it to see what is left; run it in CI to see the plan finish.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf-8');
const json = <T>(p: string): T => JSON.parse(read(p)) as T;

interface Step {
  id: string;
  what: string;
  /** True when the step has landed. Reads the tree; never a stored flag. */
  done: () => boolean;
}

const baselineSize = (): number => Object.keys(json<Record<string, unknown>>('packages/compat-oracle/baseline.json')).length;

const schemaHashes = (): Set<string> => {
  const out = new Set<string>();
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const file = join(ROOT, 'packages', pkg, 'src/schema.json');
    if (existsSync(file)) out.add(execFileSync('shasum', ['-a', '256', file], { encoding: 'utf8' }).split(' ')[0] as string);
  }
  return out;
};

const gated = (): number =>
  readdirSync(join(ROOT, '.sdlc/intents')).filter((slug) => {
    const design = join(ROOT, '.sdlc/intents', slug, 'design.md');
    return existsSync(design) && readFileSync(design, 'utf-8').includes('Accepted at the Design→Build gate');
  }).length;

/** The counts each condition compares against, named so the plan and the code agree. */
const SUITES_NOW = 8;
const SUITES_AFTER_SUPPORTED_RUNNERS = 20;
const SUITES_ALL = 23;
const PUBLISHED_PACKAGES = 9;
const GATED_DESIGNS = 6;
const ID_WIDTH = 10;

/** True when `done()` throws — an unreadable tree is "not landed", never a pass. */
const landed = (step: Step): boolean => {
  try {
    return step.done();
  } catch {
    return false;
  }
};

const STEPS: Step[] = [
  { id: '0.1', what: 'agent-native-cli-layer renamed to burgee', done: () => !existsSync(join(ROOT, '.sdlc/intents/agent-native-cli-layer')) },
  { id: '0.2', what: 'roadmap index regenerated, not hand-edited', done: () => existsSync(join(ROOT, 'scripts/roadmap-index.ts')) },
  {
    id: '0.4',
    what: 'chalk back to its 58 baseline (runs the gate, does not read it)',
    // First version read `baseline.json` and printed a tick while `npm run compat -- chalk`
    // said 57. A check that reads the number it is meant to verify cannot fail for the
    // reason the thing is broken — the same mistake as trusting `npm ci --dry-run` on the
    // machine that pruned the lockfile. It runs the gate.
    done: () => {
      try {
        return execFileSync('npm', ['run', 'compat', '--silent', '--', 'chalk'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).includes('58 passing');
      } catch {
        return false;
      }
    },
  },
  { id: '1.1', what: 'one plugin schema across the family', done: () => schemaHashes().size === 1 },
  { id: '1.7', what: 'the plugin-contract lock exists', done: () => existsSync(join(ROOT, 'scripts/plugin-contract-lock.test.ts')) },
  { id: '2.0', what: 'every vendored suite records its provenance', done: () => readdirSync(join(ROOT, 'packages/compat-oracle/vendor')).every((d) => existsSync(join(ROOT, 'packages/compat-oracle/vendor', d, 'PROVENANCE'))) },
  { id: '2.2-2.13', what: 'twelve supported-runner suites graded (baseline ≥ 20)', done: () => baselineSize() >= SUITES_AFTER_SUPPORTED_RUNNERS },
  { id: '2.14-2.16', what: 'jest, custom and monorepo suites graded (baseline ≥ 23)', done: () => baselineSize() >= SUITES_ALL },
  { id: '4.1', what: 'issues mined into every intent', done: () => readdirSync(join(ROOT, '.sdlc/intents')).filter((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md'))).length >= PUBLISHED_PACKAGES },
  { id: 'D3', what: 'every foundation design gated', done: () => gated() >= GATED_DESIGNS },
  { id: '5.1', what: 'every README links its benchmark', done: () => readdirSync(join(ROOT, 'packages')).filter((p) => existsSync(join(ROOT, 'packages', p, 'README.md'))).every((p) => read(`packages/${p}/README.md`).includes('/benchmarks')) },
];

const results = STEPS.map((step) => ({ ...step, ok: landed(step) }));
for (const r of results) console.log(`${r.ok ? '✓' : '·'} ${r.id.padEnd(ID_WIDTH)} ${r.what}`);
const left = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - left}/${results.length} landed. ${left === 0 ? 'The plan is done.' : `${String(left)} to go.`}`);
process.exitCode = left === 0 ? 0 : 1;
