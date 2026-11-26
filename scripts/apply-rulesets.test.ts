/**
 * Rulesets as code: every declaration in `.github/rulesets/` is valid, a re-run replaces a
 * ruleset by name instead of adding a second, and the workflow that applies them runs on the
 * right events with the token it needs.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { candidates, isPermissionDenied, loadDeclarations, plan, problems, RULESETS_DIR, TOKEN_CANDIDATES } from './apply-rulesets.mts';
import { scratchDirs } from './scratch-dir.js';

const scratchDir = scratchDirs();

const ruleset = { name: 'Require provedone receipts', target: 'branch', enforcement: 'active' };

describe('the declarations in .github/rulesets', () => {
  const { declarations, problems: found } = loadDeclarations(RULESETS_DIR);

  it('all apply', () => {
    expect(found).toEqual([]);
    expect(declarations.length).toBeGreaterThan(0);
  });

  it('require the provedone receipt in every code repo but burgee, whose Quality Gate already needs it', () => {
    const receipts = declarations.find((d) => d.ruleset.name === 'Require provedone receipts');
    expect(receipts?.repos.sort()).toEqual(['blog', 'eslint', 'interlace', 'serverless', 'subagent-gateway']);
    expect(JSON.stringify(receipts?.ruleset)).toContain('"context":"hookset / provedone receipts"');
    const quality = readFileSync(join(RULESETS_DIR, '..', 'workflows', 'quality.yml'), 'utf8');
    expect(quality).toMatch(/needs: \[[^\]]*receipts[^\]]*\]/);
  });
});

describe('plan', () => {
  it('creates a ruleset a repository does not have', () => {
    expect(plan([{ id: 1, name: 'Other', source_type: 'Repository' }], ruleset)).toEqual({ kind: 'create' });
  });

  it('replaces the one of the same name, so a re-run adds nothing', () => {
    expect(plan([{ id: 7, name: 'Require provedone receipts', source_type: 'Repository' }], ruleset)).toEqual({ kind: 'update', id: 7 });
  });

  it('never touches an organization ruleset that shares the name', () => {
    expect(plan([{ id: 9, name: 'Require provedone receipts', source_type: 'Organization' }], ruleset)).toEqual({ kind: 'create' });
  });
});

describe('token candidates', () => {
  it('keeps the set ones, most specific first', () => {
    expect(candidates({ SCORECARD_REPO_TOKEN: 's', RELEASE_BOT_PAT: 'p', RULESETS_TOKEN: '' }).map((c) => c.label)).toEqual(['RELEASE_BOT_PAT', 'SCORECARD_REPO_TOKEN']);
  });

  it('moves to the next token only when this one may not write', () => {
    expect(isPermissionDenied('POST /repos/o/r/rulesets -> HTTP 403: Resource not accessible')).toBe(true);
    expect(isPermissionDenied('GET /repos/o/r/rulesets -> HTTP 404: Not Found')).toBe(true);
    expect(isPermissionDenied('POST /repos/o/r/rulesets -> HTTP 422: Validation Failed')).toBe(false);
  });
});

describe('Protect main', () => {
  const { declarations } = loadDeclarations(RULESETS_DIR);
  const protect = declarations.filter((d) => d.ruleset.name === 'Protect main');

  // agents is absent on purpose: it is private on a free plan, where GitHub offers no rulesets
  // (GET /repos/ofri-peretz/agents/rulesets answers 403 "Upgrade to GitHub Pro"), so declaring it
  // turned every rulesets.yml run on main red (2026-11-25 to 2026-11-26). Re-add it here and in
  // .github/rulesets/ when the repo is public or the plan allows rulesets.
  it('covers every code repo once, never asking for an approving review Claude cannot give itself', () => {
    expect(protect.flatMap((d) => d.repos).sort()).toEqual(['blog', 'burgee', 'eslint', 'impact-ingest', 'interlace', 'serverless', 'subagent-gateway']);
    for (const d of protect) {
      const pr = (d.ruleset.rules as { type: string; parameters?: { required_approving_review_count?: number } }[]).find((r) => r.type === 'pull_request');
      if (pr !== undefined) expect(pr.parameters?.required_approving_review_count).toBe(0);
    }
  });

  it('lets repository admins bypass, and names no integration, which a personal account repo refuses with 422', () => {
    for (const d of declarations) {
      expect(d.ruleset.bypass_actors).toEqual([{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }]);
    }
  });
});

describe('problems', () => {
  it('names each missing or wrong field', () => {
    expect(problems('x.json', { owner: '', repos: [], ruleset: { name: '', target: 'main', enforcement: 'on' } })).toHaveLength(5);
    expect(problems('x.json', { owner: 'o', repos: ['a', 'a'], ruleset })).toEqual([expect.stringContaining('twice')]);
    expect(problems('x.json', { owner: 'o', repos: ['a'], ruleset })).toEqual([]);
  });

  it('refuses two files declaring the same ruleset on one repo', () => {
    const dir = scratchDir('rulesets-');
    for (const f of ['a.json', 'b.json']) writeFileSync(join(dir, f), JSON.stringify({ owner: 'o', repos: ['r'], ruleset }));
    expect(loadDeclarations(dir).problems).toEqual([expect.stringContaining('also declared by a.json')]);
  });
});

describe('rulesets.yml', () => {
  const wf = loadYaml(readFileSync(join(RULESETS_DIR, '..', 'workflows', 'rulesets.yml'), 'utf8')) as {
    on: Record<string, { paths?: string[] } | null>;
    jobs: Record<string, { steps: { run?: string; env?: Record<string, string> }[] }>;
  };

  it('applies on a push to main that changes a declaration, and on demand', () => {
    expect(wf.on.push?.paths).toEqual(expect.arrayContaining(['.github/rulesets/**', 'scripts/apply-rulesets.mts']));
    expect(wf.on).toHaveProperty('workflow_dispatch');
  });

  it('dry-runs every pull request that changes one, so a bad declaration fails before it merges', () => {
    expect(wf.on.pull_request?.paths).toEqual(expect.arrayContaining(['.github/rulesets/**']));
  });

  it('offers the apply step every token the script tries, and none on a pull request', () => {
    const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
    const apply = steps.find((s) => s.run?.includes('apply-rulesets.mts'));
    expect(Object.keys(apply?.env ?? {})).toEqual([...TOKEN_CANDIDATES]);
    for (const [name, value] of Object.entries(apply?.env ?? {})) {
      if (name === 'RULESETS_APP_TOKEN') continue;
      expect(value).toContain("github.event_name != 'pull_request'");
    }
  });
});
