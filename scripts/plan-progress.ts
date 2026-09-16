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
import { execFileSync, spawnSync } from 'node:child_process';
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

/** The chalk gate's output, run once per process. See 0.4 for why once matters. */
let chalkOutput: string | undefined;
const chalkGrade = (): string => {
  if (chalkOutput === undefined) {
    try {
      chalkOutput = execFileSync(shim('npm'), ['run', 'compat', '--silent', '--', 'chalk'], spawnOpts({ cwd: ROOT, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'ignore'] as const }));
    } catch {
      chalkOutput = '';
    }
  }
  return chalkOutput;
};

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
/**
 * `npm`, `npx` and `shasum` by a name Windows can actually find.
 *
 * `npm` and `npx` are `.cmd` shims there and neither `execFileSync` nor `spawnSync` searches
 * `PATHEXT`, so every one of these returned nothing on `windows-latest` — and `landed()` catches,
 * so five steps read as unfinished work for a reason that had nothing to do with the roadmap.
 * That is the fifth condition in this file to be false for the wrong reason, and the same bug
 * `bellpull` was built for; `bellpull/which` is the answer once it lands.
 *
 * `shell` is safe here only because every argument in this file is a literal.
 */
const WINDOWS = process.platform === 'win32';
const shim = (cmd: string): string => (WINDOWS && (cmd === 'npm' || cmd === 'npx') ? `${cmd}.cmd` : cmd);
const spawnOpts = <T extends object>(o: T): T & { shell: boolean } => ({ ...o, shell: WINDOWS });

const pkgJson = (pkg: string): { version: string; description?: string; private?: boolean } => json(`packages/${pkg}/package.json`);
/**
 * Band ids, from the runner rather than the config file — the compat ones are derived, so
 * `control-bands.json` deliberately does not list them.
 *
 * **Both channels.** `control-bands.ts` prints its listing to stderr and `execFileSync`
 * returns stdout, so this read `0` bands against 19 suites and 2.17 could not go green no
 * matter what the repository did — the third condition in this file to be false for a reason
 * that had nothing to do with the step. A checker that reads the wrong stream is the same
 * defect as one that greps a renamed slug: it cannot fail for the reason the step fails.
 */
const bands = (): string[] => {
  const run = spawnSync(shim('npx'), ['tsx', 'scripts/control-bands.ts'], spawnOpts({ cwd: ROOT, encoding: 'utf8' as const }));
  return `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n').flatMap((l) => [...l.matchAll(/\bcompat-[a-z0-9-]+-pass-rate\b/g)].map((m) => m[0]));
};
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
  // The rename broke its own check: 0.1 replaced `agent-native-cli-layer` with `burgee` in
  // 132 files, this one included, so the condition became "the burgee intent does not exist"
  // and went red the moment the step succeeded. It asks the real question now — does any file
  // still carry the old slug — which is also what the step's "Done when" says.
  {
    id: '0.1',
    what: 'no file still names the pre-0.1 slug',
    // `git grep` exits **1 when it finds nothing**, so the success case threw and `landed()`
    // read the throw as "not done" — the step was finished and the gate said otherwise for a
    // day. Status 1 is the answer here, not an error; only a real failure (status ≥ 2) is.
    done: () => {
      try {
        // Two exclusions, both deliberate. `benchmarks/results/` holds recorded measurements —
        // renaming a slug inside a result someone already took would be rewriting an
        // observation, and the rename was never meant to reach them. This file is excluded
        // because it has to name the old slug to look for it.
        const args = ['grep', '-l', ['agent', 'native', 'cli', 'layer'].join('-'), '--', ':!benchmarks/results', ':!scripts/plan-progress.ts'];
        return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '';
      } catch (cause) {
        return (cause as { status?: number }).status === 1;
      }
    },
  },
  // `existsSync` was the first version, and a file that exists proves nothing about drift.
  { id: '0.2', what: 'every roadmap row agrees with its intent (runs the check)', done: () => { execFileSync(shim('npx'), ['tsx', 'scripts/roadmap-index.ts', '--check'], spawnOpts({ cwd: ROOT, stdio: 'ignore' as const })); return true; } },
  {
    id: '0.4',
    what: 'chalk back to its 58 baseline (runs the gate, does not read it)',
    // First version read `baseline.json` and printed a tick while `npm run compat -- chalk`
    // said 57. A check that reads the number it is meant to verify cannot fail for the
    // reason the thing is broken — the same mistake as trusting `npm ci --dry-run` on the
    // machine that pruned the lockfile. It runs the gate.
    done: () => {
      // `58 passing` is what the ava suite prints; the oracle prints `58 / 58`. Matching the
      // wrong tool's wording made this unfailable in the pass direction too.
      //
      // Memoized, and that is not a speed optimisation: this file also spawns the control-band
      // watcher, which itself runs measurements, and the two racing inside one process made
      // the chalk grade flake — red here while `npm run compat -- chalk` printed 58 / 58 in
      // the very next shell. A number that depends on what else this process is doing is not
      // a reading of the tree.
      const out = chalkGrade();
      return out.includes('58 / 58') && !out.includes('\u2716');
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
  { id: '2.5.0', what: 'the six engine surfaces re-measured against the tree', done: () => { execFileSync(shim('npx'), ['tsx', 'scripts/roadmap-index.ts', '--check'], spawnOpts({ cwd: ROOT, stdio: 'ignore' as const })); return readdirSync(join(ROOT, '.sdlc/intents')).filter((s) => s.startsWith('commander-') || s.startsWith('yargs-')).every((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md'))); } },
  { id: '2.5.1', what: 'help snapshots exist at three widths', done: () => existsSync(join(ROOT, 'packages/burgee/src/__snapshots__')) && readdirSync(join(ROOT, 'packages/burgee/src/__snapshots__')).some((f) => f.startsWith('help')) },
  { id: '2.5.2', what: 'dependsOn/exclusive are spelled in the schema', done: () => has('packages/burgee/src/schema.ts', 'dependsOn') && has('packages/burgee/src/schema.ts', 'exclusive') },
  { id: '2.5.3', what: 'the Fig spec is validated, not just emitted', done: () => existsSync(join(ROOT, 'packages/burgee/src/fig-schema.test.ts')) },
  /**
   * Keyed on what a pty test *contains*, not on where someone guessed it would live.
   *
   * This read `has('packages/caique/src/prompt.test.ts', 'openpty')`, and that file has never
   * existed — caique's raw-mode test is `raw.test.ts`. So the step could not go green however
   * much of it was built, and when a lane did build a real pty test it had nowhere to land.
   * Its fallback, `.github/workflows/quality.yml` containing `pty`, was wrong twice over: that
   * file is integrator-owned, and the three-OS matrix is in `compat.yml`.
   *
   * A condition naming a filename breaks on a rename — which is exactly how 0.1 broke. A
   * condition naming the *mechanism* does not.
   */
  {
    id: '2.5.4',
    what: 'the Ctrl+C test runs under a real PTY',
    done: () =>
      readdirSync(join(ROOT, 'packages'))
        .filter((pkg) => existsSync(join(ROOT, 'packages', pkg, 'src')))
        .some((pkg) =>
          readdirSync(join(ROOT, 'packages', pkg, 'src'))
            .filter((f) => f.endsWith('.test.ts'))
            .some((f) => /openpty|pty\.fork|zpty|forkpty/.test(read(`packages/${pkg}/src/${f}`))),
        ),
  },
  { id: '3.1', what: 'paratext R8-R12 built', done: () => designComplete('paratext') },
  { id: '3.2', what: 'seniority at 1.0', done: () => designComplete('seniority') },
  { id: '3.3', what: 'closeout at 1.0', done: () => designComplete('closeout') },
  // `split('export').length > 2` was green: the file's own doc comment says "exports only
  // its own name". Count declarations, not the word.
  /**
   * Counts exported **names**, not export statements.
   *
   * It counted `^export (const|function|…)` declarations, which is a style this repository's own
   * linter forbids: `import-next/group-exports` requires one grouped `export { … }` per module,
   * and it fired on a two-statement export earlier the same night this was found. So bellpull
   * could export thirty-three names through the mandated form and still read as "a name" — the
   * checker demanding what the linter refuses.
   *
   * Eighth condition in this file found false for a reason unrelated to its step.
   */
  {
    id: '3.4',
    what: 'bellpull exists as more than a name',
    done: () => {
      const file = 'packages/bellpull/src/index.ts';
      if (!existsSync(join(ROOT, file))) return false;
      const src = read(file);
      const declared = [...src.matchAll(/^export (?:const|function|class|type|interface) /gm)].length;
      const grouped = [...src.matchAll(/^export \{([\s\S]*?)^\};?$/gm)].flatMap((m) => (m[1] as string).split(',')).filter((n) => n.trim().length > 0).length;
      return declared + grouped > 1;
    },
  },
  { id: '3.5', what: 'linegauge R9-R10 built', done: () => designComplete('linegauge') },
  { id: '4.2', what: 'no uncovered issue above the reaction floor is left', done: () => readdirSync(join(ROOT, '.sdlc/intents')).filter((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md'))).length >= PUBLISHED_PACKAGES && citations() > 0 && !readdirSync(join(ROOT, '.sdlc/intents')).some((s) => existsSync(join(ROOT, '.sdlc/intents', s, 'issues.md')) && read(`.sdlc/intents/${s}/issues.md`).includes('covered: no')) },
  /**
   * One place or none — not "every package has a `runtime.ts`".
   *
   * A package that names `process` nowhere has already done what the seam is for, and better:
   * seniority takes `env`, `cwd` and `argv` as arguments and locks that in its own
   * `shape.test.ts` (R11). Demanding it grow an empty `runtime.ts` to satisfy a count is the
   * ceremony this repository exists not to ship. So the condition reads the allow-list — the
   * thing 4.3 is actually about — and asks that no package hold more than one entry, and that
   * any entry it holds be the seam file.
   */
  {
    id: '4.3',
    what: 'no package scatters its process reads — one seam or none',
    done: () => {
      const lock = read('packages/burgee/src/process-reference-lock.test.ts');
      const listed = [...(/const ALLOWED = new Set\(\[([\s\S]*?)^\]\);$/m.exec(lock)?.[1] ?? '').matchAll(/^\s*'([^']+)',$/gm)].map((m) => m[1] as string);
      const byPackage = new Map<string, string[]>();
      for (const entry of listed) {
        const pkg = entry.split('/')[0] as string;
        byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), entry]);
      }
      // The step is about the published family. `compat-oracle` is `private: true` tooling and
      // its three entries are each the job of owning a process rather than a lapse into one —
      // `shim.ts` in particular is copied into the vendored package's own module graph, where
      // an import of anything in this repository would not resolve, so it cannot go behind a
      // seam at all. Read from the manifest rather than keyed on the name, so a package that
      // becomes published stops being exempt on the day it does.
      const published = (pkg: string): boolean => existsSync(join(ROOT, 'packages', pkg, 'package.json')) && pkgJson(pkg).private !== true;
      return [...byPackage.entries()]
        .filter(([pkg]) => published(pkg))
        .every(([, entries]) => entries.length === 1 && /\/(runtime|install)\.ts$/.test(entries[0] as string));
    },
  },
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
