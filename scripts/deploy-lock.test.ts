import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Deploy lock — every docs site deploys from `main` and from nowhere else, and each deploy
 * proves it served what it built, on its own host.
 *
 * Every rule below is a line in `.sdlc/intents/docs-deploy/intent.md` that costs nothing
 * to break by accident and is invisible once broken. Adding `pull_request:` to
 * `deploy-docs.yml` looks like a convenience. Flipping `git.deploymentEnabled` back to
 * `true` looks like a Vercel default. Loosening the `if:` on the dispatch job looks like
 * a fix for a deploy that "didn't fire". Each of those turns one deploy per merge into a
 * deploy per push on every branch, with several URLs claiming to be the site — which is
 * the exact failure ofri-peretz/eslint already paid for and wrote down (`CLAUDE.md`,
 * "Deploy: main branch only").
 *
 * **The gate and the post-deploy check are executed, not grepped.** An earlier version of
 * this file asserted that the strings `x-build-sha`, `RELEASE_APPROVAL` and
 * `"$ENVIRONMENT" = "production"` appeared *somewhere* in the workflow — which the
 * file's own header comments and its no-op job summary satisfy on their own. The whole
 * post-deploy step could be deleted, and the production `exit 1` replaced with a
 * `::warning::`, with all eight tests still green. So the two claims that are about
 * behaviour now lift the real `run:` block out of the parsed YAML and run it under
 * `bash`, with `curl` and `sleep` stubbed, and assert on the exit status it produces.
 *
 * Proven red, one mutation at a time:
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | `push:` trigger on `deploy-docs.yml` | is reachable only by hand |
 * | `deploymentEnabled: true` | never lets Vercel Git integration deploy on its own |
 * | `if: always()` on the dispatch job | is gated on the turbo-affected verdict |
 * | production `exit 1` → `::warning::`, `ready=true` falls through | refuses a hand-fired production deploy that nobody confirmed |
 * | delete the `Verify the deployed URL serves this build` step | the four post-deploy cases (no such step) |
 * | delete `NEXT_PUBLIC_BUILD_SHA` from the build step | stamps the very commit it later reads back |
 * | `$(curl … \|\| echo 000)` restored | soft-warns instead of failing when the host does not resolve yet |
 * | drop `--archive=tgz` from either `vercel deploy` line | sends the prebuilt output as one archive |
 * | restore `defaults.run.working-directory: apps/docs` | runs the Vercel CLI from the repo root |
 * | re-add `$comment` to `vercel.json` | carries no key Vercel will reject at deploy time |
 * | drop `--target=preview` from the preview deploy line | deploys a preview to preview, not to production |
 * | narrow the protection case back to `401\|403` | treats a Deployment Protection redirect as protection |
 * | key `concurrency.group` on the ref again, or delete it | serialises every deploy of one host |
 *
 * **Per row, not per file** (docs-per-package, criterion 8). There is one workflow and one
 * table (`.github/vercel-apps.json`); every executed case runs once for every row, and each run
 * starts by executing preflight's real `Resolve the app` step for that row and resolving the
 * deploy job's `env:` from its outputs — table, `jq`, job output, job env, the path a runner
 * takes. A mutation that only breaks one app's path, or a row whose host the verify step
 * mishandles, fails under that row's name. The mutations above that are properties of the one
 * workflow file (triggers, `deploymentEnabled`, the dispatch `if:`, the deploy flags,
 * `working-directory`, `$comment`, the concurrency group) are asserted once: no row reaches them.
 *
 * **The spec's requirements the workflow met and nothing held** (R2, R7, R10; locked
 * 2026-10-26, roadmap-to-shipped batch 17). Proven red, one mutation at a time:
 *
 * | mutation | fails |
 * | :-- | :-- |
 * | `VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}` in the deploy job | keeps VERCEL_TOKEN the only secret; every per-row case (its env no longer resolves) |
 * | the self-heal body sends `rootDirectory: ""`, not `null` | writes its own row onto its own Vercel project (every row) |
 * | `\|\| true` after the self-heal PATCH | the same — a refused PATCH must stop the deploy |
 * | `?teamId=` dropped from the PATCH URL | the same |
 * | the self-heal step moved after `vercel pull` | heals the project before `vercel pull` reads its settings |
 * | `environment.name: docs-…` | gives each app its own GitHub Environment (every row) |
 * | preflight emits `production_url` from the row's `dir` | reaches the deploy job from the table (every row) |
 *
 * `--archive=tgz` and the repo-root CLI are the deploy that #79 shipped and that never once
 * succeeded. Root Directory on every project is unset — the repo root — so `vercel.json`
 * belongs there and the CLI has to run there. Rooted at the app, the
 * prebuilt upload could not see the hoisted root `node_modules` an npm-workspaces install
 * produces, and production died on `File does not exist: "node_modules/client-only/
 * index.js"`. Deploying from the root means the upload is the whole traced closure, which
 * is exactly the shape `--archive=tgz` exists for.
 */

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './scratch-dir.js';

/** Every scratch directory this file makes, removed after its last test (`scripts/scratch-dir.ts`). */
const scratchDir = scratchDirs();

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

const text = (file: string): string => readFileSync(join(WORKFLOWS, file), 'utf8');

/** Every `secrets.<NAME>` a workflow reads, once each, sorted. */
const secretsIn = (file: string): string[] => [...new Set([...text(file).matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/gu)].map((m) => m[1] ?? ''))].toSorted();

interface Step {
  name?: string;
  id?: string;
  env?: Record<string, string>;
  run?: string;
  'working-directory'?: string;
}
interface Job {
  if?: string;
  env?: Record<string, string>;
  environment?: { name?: string; url?: string } | string;
  steps?: Step[];
  defaults?: { run?: { 'working-directory'?: string } };
}
interface Workflow {
  on?: Record<string, unknown>;
  env?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, Job & { concurrency?: unknown; strategy?: { matrix?: Record<string, unknown> } }>;
}

const load = (file: string): Workflow => loadYaml(text(file)) as Workflow;

/**
 * `on:` parses with `true` as the key, not `"on"` — YAML 1.1 reads the bare word as a
 * boolean. Every consumer of this file would otherwise silently see no triggers at all.
 */
const triggers = (wf: Workflow): string[] => Object.keys((wf.on ?? (wf as Record<string, unknown>)[true as unknown as string] ?? {}) as object);

const deployDocs = load('deploy-docs.yml');
const autoDeploy = load('auto-deploy.yml');

interface Row {
  package: string;
  workspace: string;
  dir: string;
  projectId: string;
  productionUrl: string;
  rootDirectory: string;
  buildCommand: string;
  outputDirectory: string;
  familyPages: boolean;
}
/** Every row of the table — the executed cases below run once per row. */
const TABLE = JSON.parse(readFileSync(join(REPO_ROOT, '.github', 'vercel-apps.json'), 'utf8')) as { orgId: string; apps: Record<string, Row> };
const ROWS: [string, Row][] = Object.entries(TABLE.apps);
const FAMILY = ROWS.find(([, row]) => row.familyPages)?.[1];

// ─── Running a step for real ────────────────────────────────────────────────────────
//
// The point of these helpers is that nothing below can be satisfied by a comment. A
// claim about what the workflow *does* is checked by doing it.

/** A step of a job, by name. Missing is a failure, not a skip — deleting the step is the mutation. */
function step(job: Job | undefined, name: string): Step {
  const found = (job?.steps ?? []).find((s) => s.name === name);
  if (!found) {
    const names = (job?.steps ?? []).map((s) => s.name ?? `<${s.id ?? 'unnamed'}>`).join(', ');
    throw new Error(`deploy-docs.yml has no step named "${name}". The steps present are: ${names}. If it was renamed, rename it here too; if it was deleted, the guarantee it carried is gone.`);
  }
  return found;
}

/**
 * `${{ … }}` expressions in `value` replaced the way Actions would, from `ctx`. An expression
 * `ctx` does not know is a failure that names it — that is how a `secrets.VERCEL_PROJECT_ID`
 * slipped back into the deploy job's `env:` fails here rather than resolving to nothing.
 */
function interpolate(value: string, ctx: Record<string, string>, where: string): string {
  return value.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_match, expr: string) => {
    if (!(expr in ctx)) throw new Error(`${where} interpolates ${expr}, which this test does not know how to substitute`);
    return ctx[expr];
  });
}

/** A step's `run:`, with `${{ … }}` expressions replaced the way Actions would. */
function script(s: Step, ctx: Record<string, string> = {}): string {
  if (!s.run) throw new Error(`step "${s.name}" has no run: block`);
  return interpolate(s.run, ctx, `step "${s.name}"`);
}

interface Result {
  status: number;
  output: string;
  /** Everything the step appended to $GITHUB_OUTPUT. */
  githubOutput: string;
  /** Everything the step appended to $GITHUB_STEP_SUMMARY. */
  summary: string;
  /** The argv of every `curl` the step ran, in order. */
  curls: string[][];
}

/**
 * Run a `run:` block under bash with a scratch `$GITHUB_OUTPUT`/`$GITHUB_STEP_SUMMARY`.
 *
 * `curl` and `sleep` are stubbed onto the front of `PATH`: the stub `curl` writes
 * `$SHIM_BODY` to whatever `-o` names, prints `$SHIM_CODE` the way `-w '%{http_code}'`
 * does — including on a failure — and exits `$SHIM_RC`, which is how a real curl behaves
 * and is the entire reason the `000000` bug existed. The stub `sleep` returns at once so
 * the retry path costs nothing.
 */
function runStep(body: string, env: Record<string, string>): Result {
  const dir = scratchDir('deploy-lock-');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'curl'),
    [
      '#!/usr/bin/env bash',
      'out=""; prev=""',
      'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done',
      // `$SHIM_LATE_BODY` replaces the body once `$SHIM_LATE_AFTER` calls have been made: an
      // alias that moves while the step is still retrying.
      `n=$(( $(cat "${dir}/calls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "${dir}/calls"`,
      // One argument per line and an `--END--` line after each call: what the self-heal
      // PATCH sends is asserted, not inferred from the step's text.
      `for a in "$@"; do printf '%s\\n' "$a"; done >> "${dir}/curl-args"; printf '%s\\n' '--END--' >> "${dir}/curl-args"`,
      'body="${SHIM_BODY-}"; [ -n "${SHIM_LATE_AFTER-}" ] && [ "$n" -gt "$SHIM_LATE_AFTER" ] && body="${SHIM_LATE_BODY-}"',
      '[ -n "$out" ] && printf \'%s\' "$body" > "$out"',
      'printf \'%s\' "${SHIM_CODE-000}"',
      'exit "${SHIM_RC-0}"',
      '',
    ].join('\n'),
  );
  writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(bin, 'curl'), 0o755);
  chmodSync(join(bin, 'sleep'), 0o755);

  // The steps download to fixed `/tmp/home.html` / `/tmp/llms.txt` — fine on a fresh runner,
  // a race here: every concurrent run of this file (another worktree's pre-push, the root
  // suite beside turbo) shares them, and `served` read `stale`'s `cafebabe` body back. Each
  // run gets its own.
  const scriptFile = join(dir, 'step.sh');
  writeFileSync(scriptFile, body.replaceAll('/tmp/', `${dir}/`));
  const outFile = join(dir, 'github_output');
  const summaryFile = join(dir, 'github_summary');
  writeFileSync(outFile, '');
  writeFileSync(summaryFile, '');

  // At the repo root, where a runner's checkout puts the workflow: the resolve step reads
  // `.github/vercel-apps.json` by its relative path.
  const r = spawnSync('bash', [scriptFile], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: summaryFile, ...env },
  });
  const argsFile = join(dir, 'curl-args');
  const curls = existsSync(argsFile)
    ? readFileSync(argsFile, 'utf8')
        .split('--END--\n')
        .filter((call) => call !== '')
        .map((call) => call.replace(/\n$/u, '').split('\n'))
    : [];
  return {
    status: r.status ?? -1,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    githubOutput: readFileSync(outFile, 'utf8'),
    summary: readFileSync(summaryFile, 'utf8'),
    curls,
  };
}

const preflight = script(step(deployDocs.jobs?.preflight, 'Check credentials and approval'));
const resolveStep = (deployDocs.jobs?.preflight?.steps ?? []).find((s) => s.id === 'app');
const verifyStep = step(deployDocs.jobs?.deploy, 'Verify the deployed URL serves this build');
const llmsStep = step(deployDocs.jobs?.deploy, 'Verify the agent surfaces are on the deployed build');
const healStep = step(deployDocs.jobs?.deploy, 'Self-heal Vercel project config');

/** The token every executed case stands in for `secrets.VERCEL_TOKEN`. */
const TOKEN = 'tok';

/**
 * What preflight's `Resolve the app` step writes to `$GITHUB_OUTPUT` for `key`, by running it.
 * Every per-row case below starts here, so a row reaches the deploy job the way it does on a
 * runner — table, `jq`, job output, job `env:` — and a defect anywhere on that path fails under
 * the row's own name (docs-per-package, criterion 8).
 */
const resolvedCache = new Map<string, Record<string, string>>();
function resolved(key: string): Record<string, string> {
  const cached = resolvedCache.get(key);
  if (cached) return cached;
  if (resolveStep?.run === undefined) throw new Error('deploy-docs.yml preflight has no step with id "app" — nothing resolves the row');
  const r = runStep(script(resolveStep), { APP: key });
  if (r.status !== 0) throw new Error(`preflight could not resolve '${key}':\n${r.output}`);
  const outputs = Object.fromEntries(
    r.githubOutput
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
  resolvedCache.set(key, outputs);
  return outputs;
}

/** The expressions a deploy-job value may use, for one row: preflight's outputs and the token. */
const contextFor = (key: string): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(resolved(key)).map(([name, value]) => [`needs.preflight.outputs.${name}`, value])),
  'secrets.VERCEL_TOKEN': TOKEN,
});

/**
 * The deploy job's `env:` for one row, every expression in it resolved from that row's preflight
 * outputs. The verify step reads the host from there; it is no longer a workflow constant, and
 * the Vercel ids are no longer secrets (R2) — an expression this cannot resolve fails the case.
 */
const envFor = (key: string): Record<string, string> =>
  Object.fromEntries(Object.entries(deployDocs.jobs?.deploy?.env ?? {}).map(([name, value]) => [name, interpolate(String(value), contextFor(key), `the deploy job's env.${name}`)]));

/** A step's own `env:`, resolved the same way, layered over the job's. */
const stepEnvFor = (s: Step, key: string): Record<string, string> => ({
  ...envFor(key),
  ...Object.fromEntries(Object.entries(s.env ?? {}).map(([name, value]) => [name, interpolate(String(value), contextFor(key), `step "${s.name}" env.${name}`)])),
});

/**
 * These `run:` blocks are POSIX shell and the runner they execute on is
 * `ubuntu-latest`, always. On Windows the stubs are not reliably resolved ahead of the
 * real binaries — the first version of this file reached out to the network and asked
 * DNS about `burgee.interlace.tools` — so the cases that *execute* a step are skipped
 * there. The structural cases, including "this step still exists", run everywhere, and
 * the Linux and macOS cells are hard gates, so every mutation below still turns CI red.
 */
const executes = it.skipIf(process.platform === 'win32');

const SHA = '0123456789abcdef0123456789abcdef01234567';
const page = (sha: string): string => `<html><head><meta name="x-build-sha" content="${sha}"/></head><body>hi</body></html>`;

describe('deploy-docs.yml', () => {
  it('is reachable only by hand', () => {
    // Constraint 1. A `push:` or `pull_request:` trigger here is a deploy per branch.
    expect(triggers(deployDocs)).toEqual(['workflow_dispatch']);
  });

  it('serialises every deploy of one host, whoever fired it', () => {
    // Run 35816373791: a hand-fired production deploy and the one auto-deploy.yml dispatched
    // for the same commit sat in different groups — this one was keyed on the ref, and the two
    // pass different refs for one commit — so both ran, the second moved the alias, and the
    // first read back a build that was not its own. One group per app, never per ref or per
    // environment, and never cancelling a deploy mid-upload.
    expect(deployDocs.concurrency?.group, 'deploy-docs.yml has no per-app concurrency group — two deploys of one host race for its alias').toBe('docs-deploy-${{ inputs.app }}');
    expect(deployDocs.concurrency?.['cancel-in-progress']).toBe(false);
    // auto-deploy.yml only dispatches this workflow. A job there holding the same group would
    // be the *pending* run GitHub cancels when a third arrives — dropping a merge's deploy.
    const autoGroups = [autoDeploy.concurrency?.group ?? '', ...Object.values(autoDeploy.jobs ?? {}).map((job) => JSON.stringify(job.concurrency ?? ''))];
    expect(autoGroups.filter((group) => group.includes('docs-deploy-'))).toEqual([]);
  });

  it('gates every later job on the preflight verdict', () => {
    // Not `always()` and not nothing: a repo without VERCEL_TOKEN has to stay green, or
    // the red X is a standing false alarm nobody reads.
    expect(deployDocs.jobs?.deploy?.if).toBe("needs.preflight.outputs.ready == 'true'");
  });

  executes('does nothing at all when there is no credential', () => {
    const r = runStep(preflight, { VERCEL_TOKEN: '', ENVIRONMENT: 'production', APPROVAL: '' });
    expect(r.status, r.output).toBe(0);
    expect(r.githubOutput).toContain('ready=false');
    expect(r.githubOutput).not.toContain('ready=true');
    // ...and it says what is missing rather than failing silently.
    expect(r.summary).toContain('VERCEL_TOKEN');
  });

  executes('tells the owner the token has to be a repository secret', () => {
    // `preflight` declares no `environment:`, so a secret scoped to `docs-production`
    // reads as empty here and every run stays green and inert forever — the one failure
    // mode of the no-op design that no test can catch after the fact.
    const r = runStep(preflight, { VERCEL_TOKEN: '', ENVIRONMENT: 'preview', APPROVAL: '' });
    expect(r.summary.toLowerCase()).toContain('repository');
  });

  executes('refuses a hand-fired production deploy that nobody confirmed', () => {
    // Constraint 2, the manual half — executed, because the string "RELEASE_APPROVAL"
    // appearing in a comment is not a gate. The refusal has to be a non-zero exit, and
    // it must not have already written `ready=true`.
    const refused = runStep(preflight, { VERCEL_TOKEN: 'tok', ENVIRONMENT: 'production', APPROVAL: '' });
    expect(refused.status, `a production deploy with no approval exited ${refused.status}; it must fail\n${refused.output}`).not.toBe(0);
    expect(refused.githubOutput).not.toContain('ready=true');

    // The wrong word is not the word.
    const wrong = runStep(preflight, { VERCEL_TOKEN: 'tok', ENVIRONMENT: 'production', APPROVAL: 'yes' });
    expect(wrong.status).not.toBe(0);
  });

  executes('lets through the two deploys that are allowed', () => {
    // The other half of the gate: it must not refuse everything, or the workflow is
    // just broken rather than careful.
    const approved = runStep(preflight, { VERCEL_TOKEN: 'tok', ENVIRONMENT: 'production', APPROVAL: 'RELEASE_APPROVAL' });
    expect(approved.status, approved.output).toBe(0);
    expect(approved.githubOutput).toContain('ready=true');

    const preview = runStep(preflight, { VERCEL_TOKEN: 'tok', ENVIRONMENT: 'preview', APPROVAL: '' });
    expect(preview.status, preview.output).toBe(0);
    expect(preview.githubOutput).toContain('ready=true');
  });

  it('stamps the very commit it later reads back', () => {
    // Success criterion 4 has two halves and they have to be the same value. The build
    // step stamps `NEXT_PUBLIC_BUILD_SHA` into the page; the verify step compares
    // `EXPECTED_SHA` against what the URL serves. If those two expressions ever differ,
    // the check compares a build of one commit against the name of another and passes.
    const build = (deployDocs.jobs?.deploy?.steps ?? []).find((s) => s.env?.NEXT_PUBLIC_BUILD_SHA !== undefined);
    expect(build, 'no step in the deploy job sets NEXT_PUBLIC_BUILD_SHA — nothing stamps the build, so the post-deploy check can only ever fail').toBeDefined();
    expect(build?.env?.NEXT_PUBLIC_BUILD_SHA).toBe(verifyStep.env?.EXPECTED_SHA);
    // And it is the commit that was checked out, not the one the workflow file came
    // from: `auto-deploy.yml` dispatches `--ref main -f ref=<merge sha>`, so a second
    // merge in the gap makes `github.sha` name a commit this run never built.
    expect(build?.env?.NEXT_PUBLIC_BUILD_SHA).not.toContain('github.sha');
  });

  it('reads the host it checks from the resolved row, not a constant', () => {
    // A workflow-level PRODUCTION_URL is one host for nine apps: every app but one would be
    // verified against the wrong site and fail — or, worse, against a host that happens to
    // serve the same commit and pass.
    expect(deployDocs.env?.PRODUCTION_URL, 'PRODUCTION_URL is a workflow-level constant again').toBeUndefined();
    expect(deployDocs.jobs?.deploy?.env?.PRODUCTION_URL).toBe('${{ needs.preflight.outputs.production_url }}');
  });

  it('keeps VERCEL_TOKEN the only secret in the deploy path (R2)', () => {
    // The team and project ids are public identifiers and live in the table. Read from
    // `secrets.VERCEL_ORG_ID` / `secrets.VERCEL_PROJECT_ID`, as this workflow did when it
    // deployed one app, they are one owner-only value for ten projects: every app but one
    // deploys into the wrong project, and no reviewer can see it in a diff.
    expect(secretsIn('deploy-docs.yml'), 'deploy-docs.yml reads a secret other than VERCEL_TOKEN').toEqual(['VERCEL_TOKEN']);
    // auto-deploy.yml only dispatches deploy-docs.yml, with the run's own token.
    expect(secretsIn('auto-deploy.yml'), 'auto-deploy.yml reads a secret other than the run’s own GITHUB_TOKEN').toEqual(['GITHUB_TOKEN']);
    expect(deployDocs.jobs?.deploy?.env?.VERCEL_ORG_ID).toBe('${{ needs.preflight.outputs.org_id }}');
    expect(deployDocs.jobs?.deploy?.env?.VERCEL_PROJECT_ID).toBe('${{ needs.preflight.outputs.project_id }}');
  });

  it('heals the project before `vercel pull` reads its settings and before the build uses them (R7)', () => {
    // `vercel pull` writes the project's settings into `.vercel/project.json` and `vercel build`
    // obeys that file. A PATCH after the pull fixes the dashboard for the NEXT deploy and builds
    // this one on whatever the dashboard said before — one host serving another app, once.
    const names = (deployDocs.jobs?.deploy?.steps ?? []).map((s) => s.name ?? '');
    const heal = names.indexOf('Self-heal Vercel project config');
    const pull = names.indexOf('Pull Vercel environment metadata');
    const build = names.findIndex((n) => n.startsWith('Build ('));
    expect(heal, 'no self-heal step').toBeGreaterThanOrEqual(0);
    expect(pull, 'no `vercel pull` step').toBeGreaterThanOrEqual(0);
    expect(build, 'no build step').toBeGreaterThanOrEqual(0);
    expect(heal < pull && pull < build, `the deploy job runs ${names.join(' → ')}; the self-heal PATCH must come before the pull, and the pull before the build`).toBe(true);
  });

  it.each(ROWS)('gives the %s app its own GitHub Environment, per target (R10, D-060)', (key) => {
    // A reviewer approving a production deploy sees which site it is; one shared
    // `docs-production` would be one approval for ten hosts, and the environment URL GitHub
    // shows would be whichever app deployed last.
    const environment = deployDocs.jobs?.deploy?.environment;
    const name = typeof environment === 'string' ? environment : (environment?.name ?? '');
    const target = "inputs.environment == 'production' && 'production' || 'preview'";
    const resolveFor = (environmentInput: 'production' | 'preview'): string =>
      interpolate(name, { 'inputs.app': key, [target]: environmentInput }, 'the deploy job’s environment.name');
    expect(resolveFor('production')).toBe(`${key}-production`);
    expect(resolveFor('preview')).toBe(`${key}-preview`);
  });

  describe.each(ROWS)('for the %s row', (key, row) => {
  executes('reaches the deploy job from the table, through preflight, and nowhere else', () => {
    // The chain every case below runs on (criterion 8). Preflight's resolve step reads the row
    // with `jq`; the deploy job's `env:` reads preflight's outputs. If the host, the project or
    // the team came from anywhere else — a constant, a secret — this row would deploy into, or
    // be verified against, something that is not its own.
    const env = envFor(key);
    expect(env.PRODUCTION_URL).toBe(row.productionUrl);
    expect(env.VERCEL_PROJECT_ID, 'the deploy job’s project id is not this row’s').toBe(row.projectId);
    expect(env.VERCEL_ORG_ID, 'the deploy job’s team id is not the table’s one orgId (R2)').toBe(TABLE.orgId);
    expect(env.VERCEL_TOKEN).toBe(TOKEN);
  });

  executes('writes its own row onto its own Vercel project before it pulls or builds (R7)', () => {
    // Every project reads the one root `vercel.json`, which carries no build settings, so this
    // PATCH is the only thing that makes this host build this app. Executed, against a stub
    // `curl` that records what it was sent: the step's text could name every field and still
    // send another project's id, an empty-string root the API rejects, or swallow a 4xx.
    const env = { ...stepEnvFor(healStep, key), SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: '{}' };
    const r = runStep(script(healStep), env);
    expect(r.status, r.output).toBe(0);
    expect(r.curls, 'the self-heal step made no request, or more than one').toHaveLength(1);
    const argv = r.curls[0]!;
    expect(argv[argv.indexOf('-X') + 1], 'the self-heal request is not a PATCH').toBe('PATCH');
    expect(argv, 'the PATCH does not name this row’s project under the table’s team').toContain(`https://api.vercel.com/v9/projects/${row.projectId}?teamId=${TABLE.orgId}`);
    expect(argv).toContain(`Authorization: Bearer ${TOKEN}`);
    const body = JSON.parse(argv[argv.indexOf('-d') + 1] ?? 'null') as Record<string, unknown>;
    expect(body, 'the PATCH body is not this row’s build settings').toEqual({
      // `""` is "the repo root" in the table and `null` to the API, which refuses an empty string.
      rootDirectory: row.rootDirectory === '' ? null : row.rootDirectory,
      buildCommand: row.buildCommand,
      outputDirectory: row.outputDirectory,
    });

    // A refused PATCH — a revoked token, a deleted project — must stop the deploy, or the build
    // runs on whatever settings the dashboard last had: `curl -f` exits 22 on an HTTP error.
    const refused = runStep(script(healStep), { ...env, SHIM_CODE: '403', SHIM_RC: '22' });
    expect(refused.status, `a refused self-heal PATCH exited ${refused.status}; the deploy must stop\n${refused.output}`).not.toBe(0);
  });

  executes('passes only when the deployed URL serves the build it just made', () => {
    const body = script(verifyStep, { 'inputs.environment': 'production' });
    const base = { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA };

    const served = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: page(SHA) });
    expect(served.status, served.output).toBe(0);

    // The failure a green workflow cannot otherwise see: the upload worked, the alias
    // did not move, and the host still answers with the previous build.
    const stale = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: page('cafebabe') });
    expect(stale.status, `a stale alias exited ${stale.status}; it must fail\n${stale.output}`).not.toBe(0);

    // The alias moves while the step is retrying: the first three answers are the previous
    // build, the fourth is this one. That is a deploy that worked, and it must pass.
    const late = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: page('cafebabe'), SHIM_LATE_AFTER: '3', SHIM_LATE_BODY: page(SHA) });
    expect(late.status, `an alias that moved on the 4th attempt exited ${late.status}; it must pass\n${late.output}`).toBe(0);

    // 200 from something that is not this app at all.
    const foreign = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: '<html>parked domain</html>' });
    expect(foreign.status, foreign.output).not.toBe(0);

    // A real server error still fails after the retries.
    const broken = runStep(body, { ...base, SHIM_CODE: '503', SHIM_RC: '0', SHIM_BODY: '' });
    expect(broken.status, broken.output).not.toBe(0);
  });

  executes('soft-warns instead of failing when the host does not resolve yet', () => {
    // The owner steps produce exactly this sequence: token added, DNS not pointed, a
    // merge dispatches the deploy, the deploy succeeds. `curl -w '%{http_code}'` prints
    // 000 *and* exits 6, so `$(curl … || echo 000)` used to yield the un-matchable code
    // `000000`, fall through to `*)`, and kill the run with `returned HTTP 000000`.
    const body = script(verifyStep, { 'inputs.environment': 'production' });
    const r = runStep(body, { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA, SHIM_CODE: '000', SHIM_RC: '6', SHIM_BODY: '' });
    expect(r.status, `an unresolvable host exited ${r.status}; the deploy succeeded and DNS is the owner's step, so this must warn\n${r.output}`).toBe(0);
    expect(r.output).toContain('::warning::');
    expect(r.output).not.toContain('000000');
    // ...and it names the record the owner has to add, for this row's host, not a curl code.
    expect(r.output).toContain(`A  ${new URL(row.productionUrl).host}  76.76.21.21`);
  });

  executes('says so, rather than failing, when Deployment Protection hides the page', () => {
    const body = script(verifyStep, { 'inputs.environment': 'preview' });
    const r = runStep(body, { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA, SHIM_CODE: '401', SHIM_RC: '0', SHIM_BODY: '' });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain('::warning::');
  });

  executes('treats a Deployment Protection redirect as protection, not as a broken deploy', () => {
    // A protected PREVIEW does not answer 401 — it answers 302 and redirects to Vercel
    // SSO. Measured 2026-09-09 on a real preview URL. Matching only 401|403 sent every
    // protected preview down the `*)` branch and failed the run on a deploy that worked.
    const body = script(verifyStep, { 'inputs.environment': 'preview' });
    for (const code of ['302', '307']) {
      const r = runStep(body, { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA, SHIM_CODE: code, SHIM_RC: '0', SHIM_BODY: '' });
      expect(r.status, `a ${code} from Deployment Protection exited ${r.status}; the deploy succeeded and this must warn\n${r.output}`).toBe(0);
      expect(r.output).toContain('::warning::');
    }
    // The llms.txt step has the same failure mode and the same fix.
    const llms = runStep(script(llmsStep), { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app', SHIM_CODE: '302', SHIM_RC: '0', SHIM_BODY: '' });
    expect(llms.status, `the /llms.txt step failed on a 302 from Deployment Protection\n${llms.output}`).toBe(0);
  });
  });

  it('deploys a preview to preview, not to production', () => {
    // Git integration is off for this project, so a CLI deploy has no branch to infer a
    // preview from and the CLI falls back to PRODUCTION. Measured 2026-09-09 against the
    // real project: `vercel deploy --prebuilt --archive=tgz` came back `"target":
    // "production"` and took the `cli-interlace-tools.vercel.app` alias; the same command
    // with `--target=preview` came back `"target": null` and stayed a Preview. So without
    // the flag, `environment=preview` ships production — the input says one thing and the
    // deploy does the opposite, and the run is green either way.
    const lines = script(step(deployDocs.jobs?.deploy, 'Deploy prebuilt artifact'), { 'inputs.environment': 'preview' })
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('vercel deploy'));
    const prod = lines.filter((l) => l.includes('--prod'));
    const preview = lines.filter((l) => !l.includes('--prod'));
    expect(prod.length, 'no --prod deploy line').toBe(1);
    expect(preview.length, 'no non---prod deploy line').toBe(1);
    expect(preview[0], `the preview deploy line does not pass --target=preview, so it deploys to PRODUCTION:\n  ${preview[0]}`).toContain('--target=preview');
    // ...and the production line must not claim to be a preview.
    expect(prod[0]).not.toContain('--target=preview');
  });

  it('runs the Vercel CLI from the repo root', () => {
    // The regression that made #79's deploy fail every time it ran. Root Directory on
    // the `cli-interlace-tools` project is unset, so `vercel.json` is at the repo root
    // and the CLI has to run there. Pinned at `apps/docs`, `vercel deploy --prebuilt`
    // uploads a tree that cannot reach the hoisted root `node_modules` an npm-workspaces
    // install produces, and Vercel refuses it with `File does not exist:
    // "node_modules/client-only/index.js"` — a failure no local build reproduces,
    // because locally the root is always right there above you.
    const deploy = deployDocs.jobs?.deploy;
    expect(deploy?.defaults?.run?.['working-directory'], 'the deploy job pins a working-directory again; the Vercel CLI must run at the repo root, where vercel.json is').toBeUndefined();
    const pinned = (deploy?.steps ?? []).filter((st) => st['working-directory'] !== undefined).map((st) => st.name ?? '<unnamed>');
    expect(pinned, `these steps pin their own working-directory: ${pinned.join(', ')}`).toEqual([]);
  });

  it('sends the prebuilt output as one archive', () => {
    // `--archive=tgz` packs the upload into a single tarball. Vercel rejects a prebuilt
    // deploy of more than 15,000 files, and deploying from the repo root means the
    // upload is the whole traced closure — root `node_modules` included — not the 397
    // files in `apps/docs/.next` that the flag was argued away on. Both branches, or the
    // production path can lose it while preview stays green.
    const lines = script(step(deployDocs.jobs?.deploy, 'Deploy prebuilt artifact'), { 'inputs.environment': 'production' })
      .split('\n')
      .filter((l) => l.includes('vercel deploy'));
    expect(lines.length, 'no `vercel deploy` line in the deploy step').toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line, `this deploy line does not pass --archive=tgz:\n  ${line.trim()}`).toContain('--archive=tgz');
    }
  });

  executes.each(ROWS)('checks that /llms.txt is on the deployed build and has rows in it (%s)', (key, row) => {
    const body = script(llmsStep);
    const base = { ...envFor(key), DEPLOY_URL: 'https://dep.vercel.app' };

    const ok = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: `# ${row.package}\n\n- [Overview](${row.productionUrl}/docs)\n` });
    expect(ok.status, ok.output).toBe(0);

    // Served, but empty — a map that lost every road still returns 200.
    const empty = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: `# ${row.package}\n` });
    expect(empty.status, empty.output).not.toBe(0);

    // The route did not survive the build.
    const gone = runStep(body, { ...base, SHIM_CODE: '404', SHIM_RC: '0', SHIM_BODY: '' });
    expect(gone.status, gone.output).not.toBe(0);
  });
});

describe('the scoreboard band, which gates the stack’s release', () => {
  /**
   * `release.yml` refuses roundel, flagstaff and caique above 0.0.x until this band names a
   * deployed compatibility page (`cli-output-stack` R13). The band is a URL in a JSON file,
   * so nothing stops somebody typing one — these are the two things that can be checked
   * without a network, and together they mean the URL names a page this repo actually
   * builds, on the host this workflow actually deploys to.
   */
  const band = JSON.parse(readFileSync(join(REPO_ROOT, '.sdlc/bands/scoreboard-public.json'), 'utf8')) as { commanderCompatibilityPage: string | null };

  it('names a page on the host of the app that owns the family pages, not some other origin', () => {
    const url = band.commanderCompatibilityPage;
    if (url === null) return; // not yet public — release.yml refuses the stack, which is the point
    expect(FAMILY?.productionUrl ?? '', 'no row of .github/vercel-apps.json is familyPages: true').not.toBe('');
    expect(url.startsWith(String(FAMILY?.productionUrl)), `${url} is not under ${String(FAMILY?.productionUrl)}`).toBe(true);
  });

  it('names a page this repo actually builds', () => {
    const url = band.commanderCompatibilityPage;
    if (url === null) return;
    const route = url.slice(String(FAMILY?.productionUrl).length).replace(/^\/+|\/+$/g, '');
    // fumadocs serves `content/docs/<route>.mdx` at `/docs/<route>`.
    const source = join(REPO_ROOT, String(FAMILY?.dir), 'content', `${route}.mdx`);
    expect(existsSync(source), `${url} would be served from ${source}, which does not exist`).toBe(true);
  });
});

describe('auto-deploy.yml', () => {
  it('fires on main and on nothing else', () => {
    expect(triggers(autoDeploy)).toEqual(['push']);
    expect((autoDeploy.on as { push: { branches: string[] } }).push.branches).toEqual(['main']);
  });

  it('is gated on the turbo-affected verdict, never on always()', () => {
    // What this does guarantee: the dispatch job cannot be reached unless the `affected`
    // job computed a non-empty set of apps from turbo's own graph, and no other ref can
    // reach it at all. What it does NOT guarantee — measured, see the intent — is that a
    // merge touching only `packages/**` is skipped: the root workspace devDepends on several
    // packages, so turbo reports every workspace changed, every docs app included. Loosening
    // this `if:` would remove even the ref gate.
    expect(autoDeploy.jobs?.deploy?.if).toBe("needs.affected.outputs.apps != '[]'");
    expect(autoDeploy.jobs?.deploy?.strategy?.matrix?.app).toBe('${{ fromJSON(needs.affected.outputs.apps) }}');
    const compute = (autoDeploy.jobs?.affected?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(compute).toContain('--filter="...[$BEFORE_SHA]"');
  });

  it('carries the approval a merge has already earned', () => {
    // Constraint 2, the automatic half: the merged PR was the human gate, so the
    // dispatch supplies what a person would have typed.
    expect(text('auto-deploy.yml')).toContain('-f approval=RELEASE_APPROVAL');
    expect(text('auto-deploy.yml')).toContain('-f environment=production');
    expect(text('auto-deploy.yml')).toContain('-f app=${{ matrix.app }}');
  });
});

describe('vercel.json', () => {
  // At the REPO ROOT. `apps/docs/vercel.json` is where it used to live, and moving it is
  // half the fix: the Vercel project's Root Directory is unset, so root is the only place
  // Vercel reads, and root is the only directory that sees both the app and the hoisted
  // `node_modules` its build traced.
  const vercel = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
    git?: { deploymentEnabled?: boolean };
    buildCommand?: string;
    outputDirectory?: string;
  };

  it.each(ROWS)('is at the repo root and nowhere else (%s)', (_key, row) => {
    // Two of them is worse than the wrong one: Vercel would read the root file while
    // every reviewer reads the app-local one, and they would drift apart in silence.
    expect(existsSync(join(REPO_ROOT, row.dir, 'vercel.json')), `${row.dir}/vercel.json is back. No project has a Root Directory set, so Vercel reads the ROOT vercel.json and this one is a decoy that no deploy obeys`).toBe(false);
  });

  it('carries no per-app build setting — every project reads it, so one would serve one app on every host', () => {
    // With Root Directory unset, all nine projects read this one file. A `buildCommand`
    // here builds the same app for every host: the sibling eslint repo shipped its docs to
    // its registry domain exactly that way. The build settings are per row, and
    // deploy-docs.yml's self-heal step writes them onto each project before it deploys.
    expect(vercel.buildCommand, 'vercel.json has a buildCommand again — every project would build that one app').toBeUndefined();
    expect(vercel.outputDirectory, 'vercel.json has an outputDirectory again — every project would serve that one app').toBeUndefined();
  });

  it.each(ROWS)('points each project at the app its build actually emits (%s)', (_key, row) => {
    // The silent half. From the root, `outputDirectory: ".next"` names a directory `next
    // build` never writes — the deploy uploads nothing and serves a 404, with every step green.
    expect(row.outputDirectory).toBe(`${row.dir}/.next`);
    expect(row.buildCommand).toBe(`npx turbo run build --filter=${row.workspace}`);
  });

  it('carries no key Vercel will reject at deploy time', () => {
    // `vercel build` validates nothing; `vercel deploy` validates against the real
    // schema. So a stray key passes every local check, passes CI, builds green — and
    // then kills the deploy with `Invalid vercel.json - should NOT have additional
    // property`. This file carried a `$comment` for exactly that reason: it was written
    // to explain itself, and no deploy had ever run to reject it. JSON has no comments;
    // the rationale lives in deploy-docs.yml and in this file instead.
    const keys = Object.keys(JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as object);
    const dollar = keys.filter((k) => k.startsWith('$') && k !== '$schema');
    expect(dollar, `vercel.json has ${dollar.join(', ')}. Vercel's schema allows $schema and nothing else beginning with $ — this builds fine and fails at 'vercel deploy'`).toEqual([]);
  });

  it('never lets Vercel Git integration deploy on its own', () => {
    // Constraint 1, the half that lives outside GitHub Actions. `true` here means every
    // push to every branch builds a URL, whatever the workflows say.
    expect(vercel.git?.deploymentEnabled).toBe(false);
  });
});
