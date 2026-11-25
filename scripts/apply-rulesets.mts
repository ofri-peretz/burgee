#!/usr/bin/env node

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * apply-rulesets.mts — repository rulesets as code.
 *
 * Each `.github/rulesets/*.json` declares one ruleset (`ruleset`, the body GitHub's rulesets API
 * takes) and the repositories it belongs on (`owner`, `repos`). This applies every declaration:
 * a repository with no ruleset of that name gets one created, one that has it gets it replaced
 * with the declared body, so a re-run changes nothing and an edit to the file is the edit to the
 * setting. Rulesets this file does not name are left alone.
 *
 * Writing a ruleset takes a token with Administration read/write on every listed repository
 * (`RULESETS_TOKEN`, a fine-grained PAT); a cloud agent session cannot do it, its GitHub proxy
 * refuses the settings API. With no token this is a dry run: it validates the declarations and
 * prints what it would apply, and exits 0.
 *
 *   node scripts/apply-rulesets.mts            # apply, or dry-run without RULESETS_TOKEN
 *   node scripts/apply-rulesets.mts --dry-run  # validate and print the plan only
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How long one API call may take before the run fails it rather than hanging. */
const TIMEOUT_MS = 30_000;
/** How much of an error response to print: enough for GitHub's message, not a whole page. */
const ERROR_BODY_CHARS = 300;

export const RULESETS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '.github', 'rulesets');

export interface Ruleset {
  name: string;
  target: string;
  enforcement: string;
  [key: string]: unknown;
}

export interface Declaration {
  file: string;
  owner: string;
  repos: string[];
  ruleset: Ruleset;
}

/** An existing ruleset as `GET /repos/{owner}/{repo}/rulesets` lists it. */
export interface Existing {
  id: number;
  name: string;
  source_type?: string;
}

export type Action = { kind: 'create' } | { kind: 'update'; id: number };

function ownerProblems(file: string, d: Partial<Declaration>): string[] {
  return typeof d.owner === 'string' && d.owner !== '' ? [] : [`${file}: no \`owner\`. fix: name the account that owns the repos.`];
}

function repoProblems(file: string, repos: unknown): string[] {
  const list = Array.isArray(repos) ? (repos as unknown[]) : [];
  if (list.length === 0 || !list.every((r) => typeof r === 'string' && r !== '')) {
    return [`${file}: \`repos\` must be a non-empty list of repository names. fix: list where the ruleset belongs.`];
  }
  return new Set(list).size === list.length ? [] : [`${file}: \`repos\` names a repository twice. fix: list each once.`];
}

function rulesetProblems(file: string, r: Partial<Ruleset> | undefined | null): string[] {
  if (r === undefined || r === null || typeof r !== 'object') return [`${file}: no \`ruleset\`. fix: give the body the rulesets API takes.`];
  const out: string[] = [];
  if (typeof r.name !== 'string' || r.name === '') out.push(`${file}: the ruleset has no \`name\`; it is how a re-run finds it. fix: name it.`);
  if (!['branch', 'tag', 'push'].includes(String(r.target))) out.push(`${file}: \`target\` is ${JSON.stringify(r.target)}. fix: use "branch", "tag" or "push".`);
  if (!['active', 'evaluate', 'disabled'].includes(String(r.enforcement))) {
    out.push(`${file}: \`enforcement\` is ${JSON.stringify(r.enforcement)}. fix: use "active", "evaluate" or "disabled".`);
  }
  return out;
}

/** Why a declaration cannot be applied, or none. Each message names the fix. */
export function problems(file: string, raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object') return [`${file}: not a JSON object. fix: declare { owner, repos, ruleset }.`];
  const d = raw as Partial<Declaration>;
  return [...ownerProblems(file, d), ...repoProblems(file, d.repos), ...rulesetProblems(file, d.ruleset)];
}

/** Every declaration in `dir`, in file order, or the problems that stop them being applied. */
export function loadDeclarations(dir: string = RULESETS_DIR): { declarations: Declaration[]; problems: string[] } {
  const declarations: Declaration[] = [];
  const found: string[] = [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const seen = new Map<string, string>();
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (error) {
      found.push(`${file}: not valid JSON (${(error as Error).message}). fix: correct the syntax.`);
      continue;
    }
    const p = problems(file, raw);
    if (p.length > 0) {
      found.push(...p);
      continue;
    }
    const d = raw as Omit<Declaration, 'file'>;
    for (const repo of d.repos) {
      const key = `${d.owner}/${repo}#${d.ruleset.name}`;
      const other = seen.get(key);
      if (other !== undefined) found.push(`${file}: ${key} is also declared by ${other}. fix: keep one.`);
      seen.set(key, file);
    }
    declarations.push({ file, owner: d.owner, repos: d.repos, ruleset: d.ruleset });
  }
  return { declarations, problems: found };
}

/** What applying `ruleset` to a repository with `existing` rulesets does: create it, or replace the one of its name. */
export function plan(existing: readonly Existing[], ruleset: Ruleset): Action {
  const mine = existing.find((e) => e.name === ruleset.name && (e.source_type ?? 'Repository') === 'Repository');
  return mine === undefined ? { kind: 'create' } : { kind: 'update', id: mine.id };
}

async function github(token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> HTTP ${response.status}: ${text.slice(0, ERROR_BODY_CHARS)}`);
  return text === '' ? null : JSON.parse(text);
}

/** Creates or replaces one declared ruleset on one repository; the line it logs, or throws. */
async function applyOne(token: string, d: Declaration, repo: string): Promise<string> {
  const where = `${d.owner}/${repo}: "${d.ruleset.name}"`;
  const existing = (await github(token, 'GET', `/repos/${d.owner}/${repo}/rulesets?includes_parents=false&per_page=100`)) as Existing[];
  const action = plan(existing, d.ruleset);
  if (action.kind === 'create') {
    await github(token, 'POST', `/repos/${d.owner}/${repo}/rulesets`, d.ruleset);
    return `created ${where}`;
  }
  await github(token, 'PUT', `/repos/${d.owner}/${repo}/rulesets/${action.id}`, d.ruleset);
  return `updated ${where} (id ${action.id})`;
}

async function main(argv: readonly string[]): Promise<number> {
  const { declarations, problems: found } = loadDeclarations();
  for (const p of found) console.error(`::error::${p}`);
  if (found.length > 0) return 1;
  const targets = declarations.flatMap((d) => d.repos.map((repo) => ({ d, repo })));
  const token = process.env.RULESETS_TOKEN ?? '';
  if (token === '') console.log('::notice::RULESETS_TOKEN is not set, so this is a dry run. fix: add the secret (Administration read/write on every listed repo).');
  if (argv.includes('--dry-run') || token === '') {
    for (const { d, repo } of targets) console.log(`would apply ${d.owner}/${repo}: "${d.ruleset.name}" (${d.file})`);
    return 0;
  }
  const results = await Promise.allSettled(targets.map(({ d, repo }) => applyOne(token, d, repo)));
  results.forEach((result, i) => {
    const { d, repo } = targets[i];
    if (result.status === 'fulfilled') console.log(result.value);
    else console.error(`::error::${d.owner}/${repo}: "${d.ruleset.name}": ${(result.reason as Error).message}`);
  });
  return results.every((r) => r.status === 'fulfilled') ? 0 : 1;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
