/**
 * Rulesets as code: every declaration in `.github/rulesets/` is valid, a re-run replaces a
 * ruleset by name instead of adding a second, and the workflow that applies them runs on the
 * right events with the token it needs.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { loadDeclarations, plan, problems, RULESETS_DIR } from './apply-rulesets.mts';

const ruleset = { name: 'Require provedone receipts', target: 'branch', enforcement: 'active' };

describe('the declarations in .github/rulesets', () => {
  const { declarations, problems: found } = loadDeclarations(RULESETS_DIR);

  it('all apply', () => {
    expect(found).toEqual([]);
    expect(declarations.length).toBeGreaterThan(0);
  });

  it('require the provedone receipt in every code repo but burgee, whose Quality Gate already needs it', () => {
    const receipts = declarations.find((d) => d.ruleset.name === 'Require provedone receipts');
    expect(receipts?.repos.sort()).toEqual(['agents', 'blog', 'eslint', 'interlace', 'serverless', 'subagent-gateway']);
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

describe('problems', () => {
  it('names each missing or wrong field', () => {
    expect(problems('x.json', { owner: '', repos: [], ruleset: { name: '', target: 'main', enforcement: 'on' } })).toHaveLength(5);
    expect(problems('x.json', { owner: 'o', repos: ['a', 'a'], ruleset })).toEqual([expect.stringContaining('twice')]);
    expect(problems('x.json', { owner: 'o', repos: ['a'], ruleset })).toEqual([]);
  });

  it('refuses two files declaring the same ruleset on one repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rulesets-'));
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

  it('passes the token only to the apply step', () => {
    const steps = Object.values(wf.jobs).flatMap((j) => j.steps);
    const apply = steps.filter((s) => s.run?.includes('apply-rulesets.mts'));
    expect(apply.some((s) => s.env?.RULESETS_TOKEN?.includes('secrets.RULESETS_TOKEN'))).toBe(true);
    expect(steps.filter((s) => JSON.stringify(s).includes('secrets.RULESETS_TOKEN'))).toHaveLength(1);
  });
});
