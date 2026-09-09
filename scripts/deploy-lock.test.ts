import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Deploy lock — the docs site deploys from `main` and from nowhere else.
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
 * Proven red, one mutation at a time: `if: always()` on the dispatch job fails
 * `only deploys the docs when turbo says they are affected`; `deploymentEnabled: true`
 * fails `never lets Vercel's Git integration deploy on its own`; a `push:` trigger on
 * `deploy-docs.yml` fails `is reachable only by hand`.
 */

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

const text = (file: string): string => readFileSync(join(WORKFLOWS, file), 'utf8');

interface Job {
  if?: string;
  steps?: { run?: string }[];
}
interface Workflow {
  on?: Record<string, unknown>;
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
    expect(text('deploy-docs.yml')).toContain('ready=false');
  });

  it('refuses a hand-fired production deploy that nobody confirmed', () => {
    // Constraint 2, the manual half.
    const preflight = (deployDocs.jobs?.preflight?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(preflight).toContain('"$ENVIRONMENT" = "production"');
    expect(preflight).toContain('RELEASE_APPROVAL');
  });

  it('checks that the deployed URL serves the build it just made', () => {
    // Success criterion 4. An upload is not a serve.
    expect(text('deploy-docs.yml')).toContain('x-build-sha');
    expect(text('deploy-docs.yml')).toContain('NEXT_PUBLIC_BUILD_SHA');
  });
});

describe('auto-deploy.yml', () => {
  it('fires on main and on nothing else', () => {
    expect(triggers(autoDeploy)).toEqual(['push']);
    expect((autoDeploy.on as { push: { branches: string[] } }).push.branches).toEqual(['main']);
  });

  it('only deploys the docs when turbo says they are affected', () => {
    // Success criterion 2: a merge touching only `packages/**` that the docs do not
    // import must not deploy them. The whole guarantee is this one expression.
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
