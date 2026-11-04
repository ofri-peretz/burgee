/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — mutation runs on the owner's machine, never in GitHub Actions
 * (D-20261101-no-mutation-in-gha). The owner, 2026-11-01: "No oxmutate in GHA", and "We are
 * running it locally and post PRs".
 *
 * Until then three workflows mutated: `quality-full.yml` → `Mutation (changed lines)` on every
 * pull request, `mutation.yml` every package in full each Saturday, and `oxmutate-bench.yml`
 * Stryker beside oxmutate on dispatch. Now the changed lines are pre-push's
 * (`npm run mutation:changed`), the weekly full run is `npm run mutation:weekly`, started by a
 * launchd agent, and it lands its ratchet PR the way the workflow's `record` job did.
 *
 * What fails here:
 *  - a step of any workflow or composite action that runs a mutation: `scripts/mutation.ts`, the
 *    two npm scripts or their shell files, the oxmutate bin, the paired bench, Stryker;
 *  - `Quality (Full) Gate` naming a mutation job again;
 *  - the weekly script losing a step of what `mutation.yml` did, or doing them out of order;
 *  - the launchd agent not starting it with Node 24 on PATH, or starting it on a schedule.
 *
 * Building oxmutate's native cores for a release (`oxmutate-native.yml`) and running oxmutate's
 * own unit suite in `quality-full.yml` → `test` are not mutation runs, and are allowed.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';
import { beforeAll, describe, expect, it } from 'vitest';

import { discard } from './scratch-dir.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
/** Read when a case runs, so a missing file fails that case rather than the whole file. */
const readIfThere = (file: string): string => (existsSync(join(ROOT, file)) ? read(file) : '');
const WEEKLY = 'scripts/mutation-weekly.sh';
const PLIST = 'tools/launchd/dev.burgee.mutation-weekly.plist';

/** A command that mutates, in a step's `run:` text. */
const MUTATION_RUN: RegExp[] = [
  /scripts\/mutation\.ts/u,
  /\bmutation:(?:changed|weekly)\b/u,
  /mutation-(?:changed|weekly)\.sh/u,
  // The bin in command position: a line's first word, after `;`, `&&`, `|` or `(`, or after npx.
  // `-w oxmutate` and `packages/oxmutate` name the package, and do not run it.
  /(?:^\s*|[;&|(]\s*|\bnpx\s+(?:--no\s+)?)oxmutate(?:\s|$)/mu,
  /packages\/oxmutate\/dist\/bin/u,
  /bench\/burgee-pair/u,
  /\bstryker\s+run\b/iu,
];
const mutates = (run: string): string[] => MUTATION_RUN.filter((re) => re.test(run)).map(String);

interface Step { name?: string; run?: string; uses?: string }
interface Run { where: string; run: string }

/** Every YAML file under `dir`, recursively, relative to the repository. */
function yamlFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return yamlFiles(rel);
    return /\.ya?ml$/u.test(e.name) ? [rel] : [];
  });
}

/** The `run:` steps of one workflow's jobs, or of one composite action. */
function runsIn(file: string): Run[] {
  const doc = loadYaml(read(file)) as { jobs?: Record<string, { steps?: Step[] }>; runs?: { steps?: Step[] } } | null;
  const groups: [string, Step[]][] = [
    ...Object.entries(doc?.jobs ?? {}).map(([k, j]): [string, Step[]] => [`${file} → ${k}`, j.steps ?? []]),
    [`${file} → runs`, doc?.runs?.steps ?? []],
  ];
  return groups.flatMap(([where, steps]) => steps.filter((s) => s.run).map((s) => ({ where: `${where} → ${s.name ?? '(unnamed)'}`, run: s.run! })));
}

/** A YAML file's text without its comment lines: what it sets and runs. */
const uncommented = (file: string): string => read(file).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

/** Every `run:` of every workflow job and composite action under `.github/`, with where it is. */
const githubRuns = (): Run[] => yamlFiles('.github').flatMap(runsIn);

describe('no GitHub Actions workflow mutates (D-20261101-no-mutation-in-gha)', () => {
  it('no step under .github/ runs mutation.ts, the mutation npm scripts, the oxmutate bin, the paired bench or Stryker', () => {
    const offenders = githubRuns().flatMap(({ where, run }) => mutates(run).map((re) => `${where}: ${re}`));
    expect(offenders, 'mutation runs on the owner\'s machine: pre-push (mutation:changed) and launchd (mutation:weekly)').toEqual([]);
  });

  it('the workflows that did are gone', () => {
    for (const wf of ['mutation.yml', 'oxmutate-bench.yml']) expect(existsSync(join(ROOT, '.github/workflows', wf)), wf).toBe(false);
  });

  it('is not blind: it catches each command the removed jobs ran, and passes the release build of the native cores', () => {
    for (const run of [
      'npm run mutation:changed',
      'npx tsx scripts/mutation.ts full --package "$PKG" --concurrency 4 --out "mutation-results/$PKG.json"',
      'npx tsx scripts/mutation.ts record --results mutation-results 2>&1 | tee record.log',
      'npx tsx packages/oxmutate/bench/burgee-pair.mts --package "$PKG" --concurrency 4 --out bench-results',
      'npx oxmutate --changed origin/main',
      'cd app && oxmutate run',
      'npx stryker run',
    ]) expect(mutates(run), run).not.toEqual([]);
    for (const run of ['cd packages/oxmutate && npm run build:native', 'npm run build:native -w oxmutate', 'cp target/release/liboxmutate.dylib "npm/$P/oxmutate.node"', 'node -e "require(\'./oxmutate.node\').nativeVersion()"']) {
      expect(mutates(run), run).toEqual([]);
    }
  });

  // BURGEE_NIGHTLY turns on NIGHTLY_ONLY, oxmutate's whole-run cases: each runs a mutation end to
  // end (D-20261101-tests-under-5s). #1424 ran them in compat.yml's nightly `heavy-tests`; they
  // run in `npm run mutation:weekly` instead. oxmutate's own unit suite, which skips them, stays in
  // quality-full.yml → test.
  it('no workflow sets BURGEE_NIGHTLY, or runs oxmutate\'s whole-run test files', () => {
    const files = yamlFiles('.github').filter((f) => /^\.github\/(workflows|actions)\//u.test(f));
    const offenders = files.flatMap((f) => {
      const text = uncommented(f);
      return [
        ...(/\bBURGEE_NIGHTLY\b/u.test(text) ? [`${f}: BURGEE_NIGHTLY`] : []),
        ...(/working-directory:\s*packages\/oxmutate\b/u.test(text) && /\bvitest\b/u.test(text) ? [`${f}: vitest in packages/oxmutate`] : []),
      ];
    });
    expect(offenders, 'the nightly-only oxmutate cases run in npm run mutation:weekly').toEqual([]);
  });

  it('Quality (Full) Gate neither needs nor reports a mutation job', () => {
    const wf = loadYaml(read('.github/workflows/quality-full.yml')) as { jobs: Record<string, { name?: string; needs?: string[]; steps?: Step[] }> };
    expect(Object.keys(wf.jobs)).not.toContain('mutation');
    expect(Object.values(wf.jobs).map((j) => j.name)).not.toContain('Mutation (changed lines)');
    const gate = wf.jobs['quality-full-gate']!;
    expect(gate.needs).not.toContain('mutation');
    expect((gate.steps ?? []).map((s) => s.run ?? '').join('\n')).not.toMatch(/mutation/iu);
  });
});

describe('the weekly full run is a local script that does what mutation.yml did', () => {
  /** Without comments: what the script runs, not what it says about itself. */
  let code = '';
  beforeAll(() => {
    code = readIfThere(WEEKLY).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  });

  it('is `npm run mutation:weekly`', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['mutation:weekly']).toBe(`bash ${WEEKLY}`);
  });

  it('runs every step of the workflow, in its order', () => {
    const steps = [
      'git fetch',
      'switch --detach origin/main',
      "npx turbo run build --filter='./packages/*'",
      'npm run build:native',
      'env BURGEE_NIGHTLY=1 OXMUTATE_REQUIRE_NATIVE=1 npm exec -w oxmutate -- vitest run',
      'npx tsx scripts/mutation.ts full --package "$pkg" --concurrency "$concurrency" --out "$results/$pkg.json"',
      'npx tsx scripts/mutation.ts record --results "$results"',
      'git status --porcelain "$RATCHETS"',
      'git commit',
      'git push "$PUSH_URL"',
      'gh pr create --base main --head "$branch" --label skip-changeset',
      'gh pr merge --auto --squash',
    ];
    const at = steps.map((s) => code.indexOf(s));
    expect(steps.filter((_, i) => at[i] === -1), 'every step is in the script').toEqual([]);
    expect(at.toSorted((a, b) => a - b)).toEqual(at);
  });

  it('lands the PR the workflow landed: same titles, a held PR left alone, the trailer, the hooks on', () => {
    expect(code).toContain('chore(workspace): record mutation scores — a floor was breached');
    expect(code).toContain('chore(workspace): record mutation scores');
    expect(code).toMatch(/any\(\.=="hold" or \.=="do-not-merge" or \.=="wip"\)/u);
    expect(code).toContain('Co-Authored-By:');
    expect(code).toContain('https://github.com/ofri-peretz/burgee.git');
    expect(code).not.toMatch(/--no-verify|--force\b|push -f\b/u);
  });

  it('waits for load and disk before each package, cleans its temp dirs after, and fails on a breach', () => {
    expect(code).toMatch(/LOAD_MAX=\$\{MUTATION_LOAD_MAX:-50\}/u);
    expect(code).toMatch(/DISK_MIN_GB=\$\{MUTATION_DISK_MIN_GB:-15\}/u);
    expect(code).toMatch(/concurrency=\$\{MUTATION_CONCURRENCY:-2\}/u);
    expect(code).toContain('rm -rf "$pkg_tmp"');
    expect(code).toContain('$HOME/Library/Logs/burgee-mutation-weekly.log');
    expect(code).toMatch(/exit 2/u);
  });

  it.skipIf(process.platform === 'win32')('--dry-run plans every package in mutation-ratchets.json, and changes nothing', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'mutation-weekly-'));
    try {
      const wt = join(scratch, 'wt');
      const r = spawnSync('bash', [WEEKLY, '--dry-run', '--worktree', wt], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, MUTATION_WEEKLY_LOG: join(scratch, 'log') } });
      // The script sends stderr to its log through stdout, so stdout is where a failure says why.
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      const doc = JSON.parse(read('.sdlc/bands/mutation-ratchets.json')) as { ratchets: Record<string, unknown> };
      const planned = [...r.stdout.matchAll(/scripts\/mutation\.ts full --package (\S+)/gu)].map((m) => m[1]);
      expect(planned).toEqual(Object.keys(doc.ratchets));
      expect(r.stdout).toContain('mutation.ts record');
      expect(existsSync(wt), 'a dry run creates no worktree').toBe(false);
    } finally {
      discard(scratch);
    }
  });

  // Actions checks out a detached commit with no `origin/main`, and the first cut of the script
  // exited 1 there (#1421's Node 24 cells) while passing on every laptop that had fetched main.
  it.skipIf(process.platform === 'win32')('--dry-run plans in a checkout that has no origin/main', () => {
    const repo = mkdtempSync(join(tmpdir(), 'mutation-weekly-bare-'));
    try {
      for (const f of [WEEKLY, '.sdlc/bands/mutation-ratchets.json', 'package-lock.json']) {
        mkdirSync(dirname(join(repo, f)), { recursive: true });
        copyFileSync(join(ROOT, f), join(repo, f));
      }
      // No repository at all, and git barred from finding one above it: `origin/main` does not
      // resolve, the same path Actions' detached checkout takes, without `git init`'s second.
      const env = { ...process.env, MUTATION_WEEKLY_LOG: join(repo, 'log'), GIT_CEILING_DIRECTORIES: dirname(repo) };
      const r = spawnSync('bash', [WEEKLY, '--dry-run', '--worktree', join(repo, 'wt')], { cwd: repo, encoding: 'utf8', env });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      expect([...r.stdout.matchAll(/scripts\/mutation\.ts full --package /gu)]).toHaveLength(Object.keys((JSON.parse(read('.sdlc/bands/mutation-ratchets.json')) as { ratchets: object }).ratchets).length);
    } finally {
      discard(repo);
    }
  });
});

describe('launchd starts it by hand, never on a schedule', () => {
  let plist = '';
  beforeAll(() => {
    plist = readIfThere(PLIST);
  });

  // One full run, then deltas: a schedule re-measured hours of unchanged code every Saturday
  // (D-20261104-mutation-full-once-then-deltas). `launchctl kickstart` starts it.
  it('runs `npm run mutation:weekly` with Node 24 on PATH, and on no schedule', () => {
    expect(plist).toContain('<string>dev.burgee.mutation-weekly</string>');
    expect(plist).toMatch(/npm run mutation:weekly/u);
    expect(plist).toMatch(/\.nvm\/versions\/node\/v24\.[\d.]+\/bin/u);
    expect(plist).not.toMatch(/<key>(?:StartCalendarInterval|StartInterval|KeepAlive)<\/key>|<key>RunAtLoad<\/key>\s*<true/u);
  });

  // The developer's checkout is usually on some feature branch, often without this script; the
  // first install ran `npm run mutation:weekly` there and would have failed every Saturday. launchd
  // runs the script from the dedicated worktree, put on origin/main first (2026-11-02).
  it("runs from its own worktree on origin/main, never the developer's checkout", () => {
    const command = /<string>-c<\/string>\s*<string>([^<]*)<\/string>/u.exec(plist)?.[1] ?? '';
    const onMain = command.indexOf('switch -q --detach origin/main');
    expect(onMain).toBeGreaterThan(command.indexOf('fetch -q origin main'));
    expect(command.indexOf('cd "$W"')).toBeGreaterThan(onMain);
    expect(command.indexOf('npm run mutation:weekly')).toBeGreaterThan(command.indexOf('cd "$W"'));
    expect(command).not.toMatch(/cd "\$HOME\/repos\/ofriperetz\.dev\/burgee" /u);
  });

  it('documents the install command in the script and the workflows README', () => {
    const install = `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.burgee.mutation-weekly.plist`;
    expect(readIfThere(WEEKLY)).toContain(install);
    expect(read('.github/workflows/README.md')).toContain(install);
  });
});
