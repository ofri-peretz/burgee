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

const baselineSize = (): number => readdirSync(join(ROOT, 'packages/compat-oracle/baseline')).filter((f) => f.endsWith('.json')).length;

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


const has = (p: string, needle: string): boolean => existsSync(join(ROOT, p)) && read(p).includes(needle);
/**
 * A design is complete when every requirement it states appears in a `## What shipped (R…)`
 * heading, and nothing is marked `Not built`.
 *
 * The first version was `!includes('Not built')`, which was green for seniority, closeout
 * and linegauge — because those three designs never use that phrase. A condition that can
 * only fail on the one file that happens to use a wording is not a condition. This one
 * fails on all four until the requirements are actually accounted for.
 */
const designComplete = (slug: string): boolean => {
  const file = `.sdlc/intents/${slug}/design.md`;
  if (!existsSync(join(ROOT, file))) return false;
  const text = read(file);
  if (text.includes('Not built')) return false;
  const wanted = new Set([...text.matchAll(/^- \*\*(R\d+)/gm)].map((m) => m[1] as string));
  if (wanted.size === 0) return false;
  const shipped = new Set([...text.matchAll(/^## What shipped \(([^)]*)\)/gm)].flatMap((m) => [...(m[1] as string).matchAll(/R\d+/g)].map((r) => r[0])));
  return [...wanted].every((r) => shipped.has(r));
};
const pkgJson = (pkg: string): { version: string; description?: string } => json(`packages/${pkg}/package.json`);
/** Band ids, from the runner rather than the config file — the compat ones are derived. */
const bands = (): string[] => execFileSync('npx', ['tsx', 'scripts/control-bands.ts'], { cwd: ROOT, encoding: 'utf8' }).split('\n').flatMap((l) => [...l.matchAll(/\bcompat-[a-z0-9-]+-pass-rate\b/g)].map((m) => m[0]));
const citations = (): number => {
  const out = new Set<string>();
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const dir = join(ROOT, 'packages', pkg, 'src');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.test.ts'))) {
      for (const m of readFileSync(join(dir, f), 'utf-8').matchAll(/#\d+/g)) out.add(m[0]);
    }
  }
  return out.size;
};

/** Steps whose truth is not in the tree. A condition that guessed at these would report
 *  progress that has not happened — the `0.4` mistake, repeated six times. */
const MANUAL: { id: string; why: string }[] = [
  { id: '0.3', why: 'a repository setting; only the owner can create the merge-queue ruleset' },
  { id: '2.1', why: 'the claim lives in the npm registry, not in the tree — read it with `npm view <pkg> description`' },
  { id: '2.5.5', why: 'which sixteen commander-env issues to cover is a reading of 4.1 output, not a count' },
  { id: '4.4', why: 'needs a workflow *run* that opened an issue — `gh run list -w compat-upstream.yml`' },
  { id: '5.3', why: 'a person adopts it, and a person who did not build it reviews' },
  { id: 'D3', why: 'the grep below proves the wording landed; it cannot prove a human meant it' },
];

const STEPS: Step[] = [
  { id: '0.1', what: 'burgee renamed to burgee', done: () => !existsSync(join(ROOT, '.sdlc/intents/burgee')) },
  // `existsSync` was the first version, and a file that exists proves nothing about drift.
  { id: '0.2', what: 'every roadmap row agrees with its intent (runs the check)', done: () => { execFileSync('npx', ['tsx', 'scripts/roadmap-index.ts', '--check'], { cwd: ROOT, stdio: 'ignore' }); return true; } },
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
  { id: '1.2', what: 'caique hosts widgets, and PromptKind is open (D5)', done: () => existsSync(join(ROOT, 'packages/caique/src/plugin.ts')) && has('packages/caique/src/spec.ts', '(string & {})') },
  { id: '1.3', what: 'seniority hosts sources, and Source is open (D5)', done: () => existsSync(join(ROOT, 'packages/seniority/src/plugin.ts')) && has('packages/seniority/src/precedence.ts', '(string & {})') },
  { id: '1.4', what: 'closeout hosts handlers', done: () => existsSync(join(ROOT, 'packages/closeout/src/plugin.ts')) },
  { id: '1.5', what: 'bellpull hosts resolvers', done: () => existsSync(join(ROOT, 'packages/bellpull/src/plugin.ts')) },
  { id: '1.6', what: 'linegauge says why it has no plugins', done: () => has('packages/linegauge/README.md', '## Plugins') },
  { id: '2.17', what: 'one control band per graded suite', done: () => bands().filter((b) => b.startsWith('compat-')).length >= baselineSize() },
  { id: '2.5.0', what: 'the six engine surfaces re-measured against the tree', done: () => { execFileSync('npx', ['tsx', 'scripts/roadmap-index.ts', '--check'], { cwd: ROOT, stdio: 'ignore' }); return readdirSync(join(ROOT, '.sdlc/intents')).filter((s) => s.startsWith('commander-') || s.startsWith('yargs-')).every((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md'))); } },
  { id: '2.5.1', what: 'help snapshots exist at three widths', done: () => existsSync(join(ROOT, 'packages/burgee/src/__snapshots__')) && readdirSync(join(ROOT, 'packages/burgee/src/__snapshots__')).some((f) => f.startsWith('help')) },
  { id: '2.5.2', what: 'dependsOn/exclusive are spelled in the schema', done: () => has('packages/burgee/src/schema.ts', 'dependsOn') && has('packages/burgee/src/schema.ts', 'exclusive') },
  { id: '2.5.3', what: 'the Fig spec is validated, not just emitted', done: () => existsSync(join(ROOT, 'packages/burgee/src/fig-schema.test.ts')) },
  { id: '2.5.4', what: 'the Ctrl+C test runs under a real PTY', done: () => has('packages/caique/src/prompt.test.ts', 'openpty') || has('.github/workflows/quality.yml', 'pty') },
  { id: '3.1', what: 'paratext R8-R12 built', done: () => designComplete('paratext') },
  { id: '3.2', what: 'seniority at 1.0', done: () => designComplete('seniority') },
  { id: '3.3', what: 'closeout at 1.0', done: () => designComplete('closeout') },
  // `split('export').length > 2` was green: the file's own doc comment says "exports only
  // its own name". Count declarations, not the word.
  { id: '3.4', what: 'bellpull exists as more than a name', done: () => existsSync(join(ROOT, 'packages/bellpull/src/index.ts')) && [...read('packages/bellpull/src/index.ts').matchAll(/^export (?:const|function|class|type|interface) /gm)].length > 1 },
  { id: '3.5', what: 'linegauge R9-R10 built', done: () => designComplete('linegauge') },
  { id: '4.2', what: 'no uncovered issue above the reaction floor is left', done: () => readdirSync(join(ROOT, '.sdlc/intents')).filter((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md'))).length >= PUBLISHED_PACKAGES && citations() > 0 && !readdirSync(join(ROOT, '.sdlc/intents')).some((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md')) && read(`.sdlc/intents/${s}/issues.md`).includes('covered: no')) },
  { id: '4.3', what: 'every package owns its Runtime seam', done: () => readdirSync(join(ROOT, 'packages')).filter((p) => existsSync(join(ROOT, 'packages', p, 'src'))).every((p) => readdirSync(join(ROOT, 'packages', p, 'src')).some((f) => f === 'runtime.ts' || f === 'install.ts')) },
  { id: '5.2', what: 'READMEs are generated and locked', done: () => existsSync(join(ROOT, 'scripts/readme-lock.test.ts')) },
  { id: 'D1', what: 'a tree-inclusive ceiling per foundation package', done: () => existsSync(join(ROOT, '.sdlc/bands/foundation-ceilings.json')) },
  // `has('oneOf')` was green while `required` was still `[name, osc, when, encode, fallback]`
  // — the word appears inside a property. The migration is the nested shape, so read it.
  { id: 'D2', what: 'paratext validates the nested capabilities shape', done: () => 'capabilities' in json<{ properties: Record<string, unknown> }>('packages/paratext/src/schema.json').properties },
  { id: 'D5', what: 'both closed unions widened', done: () => has('packages/caique/src/spec.ts', '(string & {})') && has('packages/seniority/src/precedence.ts', '(string & {})') },
  { id: 'D8', what: 'paratext shipped its break alone, at 0.3.0', done: () => pkgJson('paratext').version.startsWith('0.3') || pkgJson('paratext').version >= '0.3.0' },
  { id: 'LANES', what: 'the lane contract exists and is enforced', done: () => existsSync(join(ROOT, '.sdlc/LANES.md')) && existsSync(join(ROOT, 'scripts/lane-boundaries-lock.test.ts')) },
  // Byte budgets needed no sharding: they already live in each package's own `weight.test.ts`.
  // `release-budgets.json` holds one cross-package ratio and is integrator-owned by design.
  { id: 'SHARD', what: 'the shared state is sharded, so lanes do not collide', done: () => existsSync(join(ROOT, 'packages/compat-oracle/baseline')) && !existsSync(join(ROOT, 'packages/compat-oracle/baseline.json')) && !read('.sdlc/bands/control-bands.json').includes('compat-chalk-pass-rate') },
];


const results = STEPS.map((step) => ({ ...step, ok: landed(step) }));
for (const r of results) console.log(`${r.ok ? '✓' : '·'} ${r.id.padEnd(ID_WIDTH)} ${r.what}`);
const left = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - left}/${results.length} landed. ${left === 0 ? 'The plan is done.' : `${String(left)} to go.`}`);
console.log(`\nmanual: ${String(MANUAL.length)} steps whose truth is not in the tree`);
for (const m of MANUAL) console.log(`  ${m.id.padEnd(ID_WIDTH)} ${m.why}`);
process.exitCode = left === 0 ? 0 : 1;
