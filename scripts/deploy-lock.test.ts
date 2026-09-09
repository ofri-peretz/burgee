import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Deploy lock — the docs site deploys from `main` and from nowhere else, and the deploy
 * proves it served what it built.
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
 */

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

const text = (file: string): string => readFileSync(join(WORKFLOWS, file), 'utf8');

interface Step {
  name?: string;
  id?: string;
  env?: Record<string, string>;
  run?: string;
}
interface Job {
  if?: string;
  env?: Record<string, string>;
  steps?: Step[];
}
interface Workflow {
  on?: Record<string, unknown>;
  env?: Record<string, string>;
  jobs?: Record<string, Job>;
}

const load = (file: string): Workflow => loadYaml(text(file)) as Workflow;

/**
 * `on:` parses with `true` as the key, not `"on"` — YAML 1.1 reads the bare word as a
 * boolean. Every consumer of this file would otherwise silently see no triggers at all.
 */
const triggers = (wf: Workflow): string[] => Object.keys((wf.on ?? (wf as Record<string, unknown>)[true as unknown as string] ?? {}) as object);

const deployDocs = load('deploy-docs.yml');
const autoDeploy = load('auto-deploy.yml');

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

/** A step's `run:`, with `${{ … }}` expressions replaced the way Actions would. */
function script(s: Step, ctx: Record<string, string> = {}): string {
  if (!s.run) throw new Error(`step "${s.name}" has no run: block`);
  return s.run.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_match, expr: string) => {
    if (!(expr in ctx)) throw new Error(`step "${s.name}" interpolates ${expr}, which this test does not know how to substitute`);
    return ctx[expr];
  });
}

interface Result {
  status: number;
  output: string;
  /** Everything the step appended to $GITHUB_OUTPUT. */
  githubOutput: string;
  /** Everything the step appended to $GITHUB_STEP_SUMMARY. */
  summary: string;
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
  const dir = mkdtempSync(join(tmpdir(), 'deploy-lock-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'curl'),
    ['#!/usr/bin/env bash', 'out=""; prev=""', 'for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done', '[ -n "$out" ] && printf \'%s\' "${SHIM_BODY-}" > "$out"', 'printf \'%s\' "${SHIM_CODE-000}"', 'exit "${SHIM_RC-0}"', ''].join('\n'),
  );
  writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(bin, 'curl'), 0o755);
  chmodSync(join(bin, 'sleep'), 0o755);

  const scriptFile = join(dir, 'step.sh');
  writeFileSync(scriptFile, body);
  const outFile = join(dir, 'github_output');
  const summaryFile = join(dir, 'github_summary');
  writeFileSync(outFile, '');
  writeFileSync(summaryFile, '');

  const r = spawnSync('bash', [scriptFile], {
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH ?? ''}`, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: summaryFile, ...env },
  });
  return {
    status: r.status ?? -1,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    githubOutput: readFileSync(outFile, 'utf8'),
    summary: readFileSync(summaryFile, 'utf8'),
  };
}

const preflight = script(step(deployDocs.jobs?.preflight, 'Check credentials and approval'));
const verifyStep = step(deployDocs.jobs?.deploy, 'Verify the deployed URL serves this build');
const llmsStep = step(deployDocs.jobs?.deploy, 'Verify the agent surfaces are on the deployed build');
/** The workflow-level `env:`, which the verify step reads `PRODUCTION_URL` out of. */
const workflowEnv = deployDocs.env ?? {};

const SHA = '0123456789abcdef0123456789abcdef01234567';
const page = (sha: string): string => `<html><head><meta name="x-build-sha" content="${sha}"/></head><body>hi</body></html>`;

describe('deploy-docs.yml', () => {
  it('is reachable only by hand', () => {
    // Constraint 1. A `push:` or `pull_request:` trigger here is a deploy per branch.
    expect(triggers(deployDocs)).toEqual(['workflow_dispatch']);
  });

  it('does nothing at all when there is no credential', () => {
    // The deploy job must be gated on the preflight verdict, not on `always()` and not
    // on nothing: a repo without VERCEL_TOKEN has to stay green, or the red X is a
    // standing false alarm nobody reads.
    expect(deployDocs.jobs?.deploy?.if).toBe("needs.preflight.outputs.ready == 'true'");

    const r = runStep(preflight, { VERCEL_TOKEN: '', ENVIRONMENT: 'production', APPROVAL: '' });
    expect(r.status, r.output).toBe(0);
    expect(r.githubOutput).toContain('ready=false');
    expect(r.githubOutput).not.toContain('ready=true');
    // ...and it says what is missing rather than failing silently.
    expect(r.summary).toContain('VERCEL_TOKEN');
  });

  it('tells the owner the token has to be a repository secret', () => {
    // `preflight` declares no `environment:`, so a secret scoped to `docs-production`
    // reads as empty here and every run stays green and inert forever — the one failure
    // mode of the no-op design that no test can catch after the fact.
    const r = runStep(preflight, { VERCEL_TOKEN: '', ENVIRONMENT: 'preview', APPROVAL: '' });
    expect(r.summary.toLowerCase()).toContain('repository');
  });

  it('refuses a hand-fired production deploy that nobody confirmed', () => {
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

  it('lets through the two deploys that are allowed', () => {
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

  it('passes only when the deployed URL serves the build it just made', () => {
    const body = script(verifyStep, { 'inputs.environment': 'production' });
    const base = { ...workflowEnv, DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA };

    const served = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: page(SHA) });
    expect(served.status, served.output).toBe(0);

    // The failure a green workflow cannot otherwise see: the upload worked, the alias
    // did not move, and the host still answers with the previous build.
    const stale = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: page('cafebabe') });
    expect(stale.status, `a stale alias exited ${stale.status}; it must fail\n${stale.output}`).not.toBe(0);

    // 200 from something that is not this app at all.
    const foreign = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: '<html>parked domain</html>' });
    expect(foreign.status, foreign.output).not.toBe(0);

    // A real server error still fails after the retries.
    const broken = runStep(body, { ...base, SHIM_CODE: '503', SHIM_RC: '0', SHIM_BODY: '' });
    expect(broken.status, broken.output).not.toBe(0);
  });

  it('soft-warns instead of failing when the host does not resolve yet', () => {
    // The owner steps produce exactly this sequence: token added, DNS not pointed, a
    // merge dispatches the deploy, the deploy succeeds. `curl -w '%{http_code}'` prints
    // 000 *and* exits 6, so `$(curl … || echo 000)` used to yield the un-matchable code
    // `000000`, fall through to `*)`, and kill the run with `returned HTTP 000000`.
    const body = script(verifyStep, { 'inputs.environment': 'production' });
    const r = runStep(body, { ...workflowEnv, DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA, SHIM_CODE: '000', SHIM_RC: '6', SHIM_BODY: '' });
    expect(r.status, `an unresolvable host exited ${r.status}; the deploy succeeded and DNS is the owner's step, so this must warn\n${r.output}`).toBe(0);
    expect(r.output).toContain('::warning::');
    expect(r.output).not.toContain('000000');
  });

  it('says so, rather than failing, when Deployment Protection hides the page', () => {
    const body = script(verifyStep, { 'inputs.environment': 'preview' });
    const r = runStep(body, { ...workflowEnv, DEPLOY_URL: 'https://dep.vercel.app', EXPECTED_SHA: SHA, SHIM_CODE: '401', SHIM_RC: '0', SHIM_BODY: '' });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain('::warning::');
  });

  it('checks that /llms.txt is on the deployed build and has rows in it', () => {
    const body = script(llmsStep);
    const base = { ...workflowEnv, DEPLOY_URL: 'https://dep.vercel.app' };

    const ok = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: '# burgee\n\n- [The floor](https://cli.interlace.tools/docs/the-floor)\n' });
    expect(ok.status, ok.output).toBe(0);

    // Served, but empty — a map that lost every road still returns 200.
    const empty = runStep(body, { ...base, SHIM_CODE: '200', SHIM_RC: '0', SHIM_BODY: '# burgee\n' });
    expect(empty.status, empty.output).not.toBe(0);

    // The route did not survive the build.
    const gone = runStep(body, { ...base, SHIM_CODE: '404', SHIM_RC: '0', SHIM_BODY: '' });
    expect(gone.status, gone.output).not.toBe(0);
  });
});

describe('auto-deploy.yml', () => {
  it('fires on main and on nothing else', () => {
    expect(triggers(autoDeploy)).toEqual(['push']);
    expect((autoDeploy.on as { push: { branches: string[] } }).push.branches).toEqual(['main']);
  });

  it('is gated on the turbo-affected verdict, never on always()', () => {
    // What this does guarantee: the dispatch job cannot be reached unless the `affected`
    // job computed `docs=true` from turbo's own graph, and no other ref can reach it at
    // all. What it does NOT guarantee — measured, see the intent — is that a merge
    // touching only `packages/**` is skipped: the root workspace devDepends on
    // `burgee`, `compat-oracle` and `flagstaff`, so turbo reports every workspace
    // changed, `docs` included. Loosening this `if:` would remove even the ref gate.
    expect(autoDeploy.jobs?.['deploy-docs']?.if).toBe("needs.affected.outputs.docs == 'true'");
    const compute = (autoDeploy.jobs?.affected?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(compute).toContain('--filter="...[$BEFORE_SHA]"');
  });

  it('carries the approval a merge has already earned', () => {
    // Constraint 2, the automatic half: the merged PR was the human gate, so the
    // dispatch supplies what a person would have typed.
    expect(text('auto-deploy.yml')).toContain('-f approval=RELEASE_APPROVAL');
    expect(text('auto-deploy.yml')).toContain('-f environment=production');
  });
});

describe('apps/docs/vercel.json', () => {
  const vercel = JSON.parse(readFileSync(join(REPO_ROOT, 'apps', 'docs', 'vercel.json'), 'utf8')) as {
    git?: { deploymentEnabled?: boolean };
  };

  it('never lets Vercel Git integration deploy on its own', () => {
    // Constraint 1, the half that lives outside GitHub Actions. `true` here means every
    // push to every branch builds a URL, whatever the workflows say.
    expect(vercel.git?.deploymentEnabled).toBe(false);
  });
});
