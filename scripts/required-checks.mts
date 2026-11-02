/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The status checks `main` requires, and what it takes for a workflow to produce one.
 *
 * Shared by `scripts/lint-workflows.ts` (rule 8), `scripts/required-checks-lock.test.ts` and
 * `scripts/heavy-ci-nightly-lock.test.ts`. No side effects on import.
 *
 * A required check that never reports does not fail anything: the pull request, the merge-queue
 * entry or the Version PR sits at BLOCKED with nothing red, until someone notices. Every rule
 * here exists to make that impossible to merge into.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load as loadYaml } from 'js-yaml';

export const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
export const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');

/**
 * `main`'s required status checks, named the way each reports. Branch protection holds the real
 * list and this is a copy of it, the trade being that a copy can drift and the alternative is a
 * rule that cannot be checked without a network call and a token. Read it back with:
 *
 *   gh api repos/ofri-peretz/burgee/branches/main/protection/required_status_checks --jq '.contexts[]'
 *
 * Set by the owner on 2026-11-01, strict off. `review` was required before and is not now.
 * `Ratchet · each host's suite against burgee` was made required on 2026-09-10: it went red on
 * PR #197 at 14:44:16 and the PR merged 29 seconds later, because the context was not required.
 */
export const REQUIRED_CHECKS: readonly string[] = [
  'Quality Gate',
  'Quality (Full) Gate',
  "Ratchet · each host's suite against burgee",
  'Node 24 · ubuntu-latest',
  'Node 24 · macos-latest',
  'Node 24 · windows-latest',
  'CodeQL',
  'Changeset present',
  'bash, zsh, fish, pwsh complete the demo',
];

/**
 * Required checks the Version PR's GITHUB_TOKEN fallback cannot produce, each with why.
 *
 * `CodeQL` is not a job: GitHub code scanning (the github-advanced-security app, 57789) creates
 * it from a `pull_request` analysis, and branch protection pins the context to that app. A push
 * or dispatched analysis creates no `CodeQL` check run (main's push commits carry only
 * `Analyze (javascript-typescript)`), and a commit status the fallback posts with GITHUB_TOKEN
 * comes from GitHub Actions, not from 57789. A Version PR gets `CodeQL` only when it is opened
 * with the release App token or `RELEASE_BOT_PAT`, whose `pull_request` events run codeql.yml.
 */
export const FALLBACK_CANNOT_PRODUCE: Readonly<Record<string, string>> = {
  CodeQL: 'reported by code scanning (app 57789) only from a pull_request analysis; a GITHUB_TOKEN status cannot stand in for it',
};

export interface Step {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
}
export interface Job {
  name?: string;
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  strategy?: { matrix?: Record<string, unknown> };
  steps?: Step[];
}
export interface Workflow {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
}

/** The event a job is asked about. Everything a job-level `if:` in these workflows may read. */
export interface Event {
  event_name: string;
  labels?: string[];
  /** `github.event.schedule`: the cron string on a scheduled run, `null` on every other event. */
  schedule?: string;
  inputs?: Record<string, unknown>;
  /** `github.event.action` on a pull request: `opened` unless set (`labeled`, `synchronize`, …). */
  action?: string;
  /** `github.event.label.name`: the label a `labeled` or `unlabeled` pull request event is about. */
  label?: string;
  /** The pull request's number, which `github.ref` (`refs/pull/<n>/merge`) carries. 1 unless set. */
  number?: number;
  /** `github.run_id`: unique per run. 1 unless set. */
  runId?: number;
}

/** `github.ref` for an event: a pull request's merge ref names its number; everything else here runs on a branch. */
function refOf(ev: Event): string {
  if (ev.event_name === 'pull_request') return `refs/pull/${ev.number ?? 1}/merge`;
  if (ev.event_name === 'merge_group') return `refs/heads/gh-readonly-queue/main/pr-${ev.number ?? 1}-0000000`;
  return 'refs/heads/main';
}

export function readWorkflow(file: string): Workflow {
  return loadYaml(readFileSync(join(WORKFLOWS_DIR, file), 'utf8')) as Workflow;
}

export function workflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

/** GitHub's truthiness: `''`, `false`, `null` and `0` are false. */
export const truthy = (v: unknown): boolean => v !== '' && v !== false && v !== null && v !== undefined && v !== 0;

/**
 * What a context term reads for one event. `needs.affected.outputs.*` reads as the worst case
 * for a pull request (every package, `compat-oracle` among them); codeql.yml's `gate` says
 * `run=true` for any non-draft pull request and every other event.
 */
/** The terms only a pull request event carries; every other event reads them as `null`. */
const PULL_REQUEST_TERMS: Readonly<Record<string, (ev: Event) => unknown>> = {
  'github.event.action': (ev) => ev.action ?? 'opened',
  'github.event.label.name': (ev) => (ev.action === 'labeled' || ev.action === 'unlabeled' ? (ev.label ?? null) : null),
  'github.event.pull_request.number': (ev) => ev.number ?? 1,
  'github.event.pull_request.labels.*.name': (ev) => ev.labels ?? [],
  'github.event.pull_request.draft': () => false,
};

/** The terms every run carries. */
const RUN_TERMS: Readonly<Record<string, (ev: Event) => unknown>> = {
  'github.event_name': (ev) => ev.event_name,
  'github.ref': refOf,
  'github.sha': () => '0123456789abcdef0123456789abcdef01234567',
  'github.run_id': (ev) => ev.runId ?? 1,
};

function term(t: string, ev: Event): unknown {
  const prTerm = PULL_REQUEST_TERMS[t];
  if (prTerm) return ev.event_name === 'pull_request' ? prTerm(ev) : null;
  const runTerm = RUN_TERMS[t];
  if (runTerm) return runTerm(ev);
  switch (t) {
    case 'github.event.schedule':
      return ev.event_name === 'schedule' ? (ev.schedule ?? null) : null;
    case 'needs.affected.outputs.full':
      return 'true';
    case 'needs.affected.outputs.packages':
      return '["compat-oracle","burgee"]';
    case 'needs.gate.outputs.run':
      return 'true';
  }
  if (t.startsWith('inputs.')) return ev.event_name === 'workflow_dispatch' ? (ev.inputs?.[t.slice('inputs.'.length)] ?? null) : null;
  throw new Error(`${t} is not a term this reader knows the meaning of`);
}

/** The calls these conditions use: `contains`, `fromJSON`, `format`, `always`. */
function call(name: string, args: unknown[]): unknown {
  if (name === 'always') return true;
  if (name === 'fromJSON') return JSON.parse(String(args[0]));
  if (name === 'format') return String(args[0]).replaceAll(/\{(\d+)\}/gu, (_, n: string) => String(args[Number(n) + 1]));
  const [hay, needle] = args;
  if (Array.isArray(hay)) return hay.includes(needle);
  return typeof hay === 'string' && hay.includes(String(needle));
}

const CALLS = new Set(['always', 'fromJSON', 'format', 'contains']);

/**
 * GitHub's expression grammar, as far as these workflows' job conditions use it: `||`, `&&`, `!`,
 * parentheses, `==`/`!=`, string literals and the calls above. A term it does not know throws, so
 * a condition cannot pass a check by being unreadable.
 */
export function evaluate(source: string, ev: Event): unknown {
  const expression = source.trim().replace(/^\$\{\{([\s\S]*)\}\}$/u, '$1').trim();
  const parts = expression.match(/'[^']*'|\|\||&&|==|!=|!|\(|\)|,|[\w.*:-]+/gu) ?? [];
  let i = 0;
  const peek = (): string | undefined => parts[i];
  const take = (want?: string): string => {
    const t = parts[i++];
    if (t === undefined || (want !== undefined && t !== want)) throw new Error(`unexpected ${String(t)} in ${expression}`);
    return t;
  };
  const args = (): unknown[] => {
    take('(');
    const out: unknown[] = [];
    while (peek() !== ')') {
      out.push(or());
      if (peek() === ',') take(',');
    }
    take(')');
    return out;
  };
  const primary = (): unknown => {
    const t = take();
    if (t === '(') {
      const v = or();
      take(')');
      return v;
    }
    if (t === '!') return !truthy(primary());
    if (t.startsWith("'")) return t.slice(1, -1);
    if (t === 'true' || t === 'false') return t === 'true';
    if (CALLS.has(t)) return call(t, args());
    return term(t, ev);
  };
  const compare = (): unknown => {
    const left = primary();
    const op = peek();
    if (op !== '==' && op !== '!=') return left;
    take();
    const right = primary();
    return op === '==' ? left === right : left !== right;
  };
  const and = (): unknown => {
    let v = compare();
    while (peek() === '&&') {
      take();
      const r = compare();
      v = truthy(v) ? r : v;
    }
    return v;
  };
  const or = (): unknown => {
    let v = and();
    while (peek() === '||') {
      take();
      const r = and();
      v = truthy(v) ? v : r;
    }
    return v;
  };
  const value = or();
  if (i !== parts.length) throw new Error(`trailing ${parts.slice(i).join(' ')} in ${expression}`);
  return value;
}

/**
 * A string with `${{ … }}` in it, as GitHub renders it for one event: a `concurrency.group`, say.
 * `null` and `undefined` render empty, the way GitHub renders a missing value.
 */
export function interpolate(template: string, ev: Event): string {
  return template.replaceAll(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) => {
    const v = evaluate(expression, ev);
    return v === null || v === undefined ? '' : String(v);
  });
}

/** The events a workflow subscribes to. */
export function triggers(wf: Workflow): string[] {
  const on = wf.on as unknown;
  if (!on) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return (on as unknown[]).map(String);
  return Object.keys(on as object);
}

/** Whether a job starts at all for an event: its workflow subscribes to the event, and its `if:` holds. */
export function runs(wf: Workflow, job: string, ev: Event): boolean {
  if (!triggers(wf).includes(ev.event_name)) return false;
  const cond = wf.jobs[job]?.if;
  return cond === undefined ? true : truthy(evaluate(cond, ev));
}

/** A matrix value as a list: a literal array, or an expression that evaluates to one for this event. */
function matrixValues(value: unknown, ev: Event): unknown[] | undefined {
  if (Array.isArray(value)) return value as unknown[];
  if (typeof value !== 'string') return undefined;
  const v = evaluate(value, ev);
  return Array.isArray(v) ? (v as unknown[]) : undefined;
}

/** The check names a job reports for one event: its `name:` (or key) with `${{ matrix.* }}` expanded. */
export function checkNames(key: string, job: Job, ev: Event): string[] {
  const name = job.name ?? key;
  let names = [name];
  for (const [axis, raw] of Object.entries(job.strategy?.matrix ?? {})) {
    if (axis === 'include' || axis === 'exclude' || !name.includes(`matrix.${axis}`)) continue;
    const values = matrixValues(raw, ev);
    if (values === undefined) return [];
    const placeholder = `\${{ matrix.${axis} }}`;
    names = names.flatMap((n) => values.map((v) => n.replaceAll(placeholder, String(v))));
  }
  return names.filter((n) => !n.includes('${{'));
}

/** The names one job reports: its expanded name, plus `CodeQL` when it uploads a CodeQL analysis. */
export function reported(key: string, job: Job, ev: Event): string[] {
  const uploadsCodeql = (job.steps ?? []).some((st) => /^github\/codeql-action\/analyze@/u.test(st.uses ?? ''));
  return [...checkNames(key, job, ev), ...(uploadsCodeql ? ['CodeQL'] : [])];
}

/** Whether a job starts for an event; a condition this reader cannot evaluate vouches for nothing. */
function startsSafely(wf: Workflow, key: string, ev: Event): boolean {
  try {
    return runs(wf, key, ev);
  } catch {
    return false;
  }
}

/** Every check name an event produces across the given workflows, with the job that produces it. */
export function producedOn(ev: Event, files: readonly string[] = workflowFiles()): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    const wf = readWorkflow(file);
    for (const [key, job] of Object.entries(wf.jobs ?? {})) {
      if (!startsSafely(wf, key, ev)) continue;
      for (const n of reported(key, job, ev)) out.set(n, `${file} → ${key}`);
    }
  }
  return out;
}

/**
 * The Version PR's GITHUB_TOKEN fallback: `changesets-pr.yml` → `checks`. Each matrix row
 * dispatches one workflow on `changeset-release/main` (with `inputs`, `key=value`, when the row
 * has them) and mirrors each of its `checks` onto the PR's head commit as a status.
 */
export const VERSION_PR_KICKER = { file: 'changesets-pr.yml', job: 'checks' } as const;

export interface KickerRow {
  workflow: string;
  checks: string[];
  inputs?: string;
}

export function kickerRows(wf: Workflow | undefined): KickerRow[] {
  const include = wf?.jobs?.[VERSION_PR_KICKER.job]?.strategy?.matrix?.['include'];
  if (!Array.isArray(include)) return [];
  return (include as Partial<KickerRow>[]).map((r) => ({ workflow: String(r.workflow ?? ''), checks: Array.isArray(r.checks) ? r.checks.map(String) : [], ...(r.inputs ? { inputs: String(r.inputs) } : {}) }));
}

/** The dispatch event a kicker row raises: `workflow_dispatch` with the row's `key=value` inputs. */
const BOOLEANS: Readonly<Record<string, boolean>> = { true: true, false: false };

export function dispatchOf(row: KickerRow): Event {
  const inputs: Record<string, unknown> = {};
  for (const pair of (row.inputs ?? '').split(/\s+/u).filter(Boolean)) {
    const [k, v = ''] = pair.split('=');
    inputs[k!] = BOOLEANS[v] ?? v;
  }
  return { event_name: 'workflow_dispatch', inputs };
}
