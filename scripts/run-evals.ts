/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Stage 4 (Test) — continuous evals over the agent configuration.
 * Ported from ofri-peretz/eslint/scripts/run-evals.ts (intent `sdlc-locks-evals-bands`).
 *
 *   1. Config checks — deterministic, free, always run: every relative link in an
 *      agent-facing document resolves, every script a document names exists, every
 *      floor id a child intent cites exists in the umbrella design.
 *   2. Task evals — real prompts with accepted outcomes; needs a credential, and
 *      reports `skipped`, never `failed`, without one.
 *
 * Credentials: prefer CLAUDE_CODE_OAUTH_TOKEN (subscription, no per-token charge).
 * ANTHROPIC_API_KEY outranks it in Claude Code's precedence, so set one, not both.
 *
 * Usage:
 *   tsx scripts/run-evals.ts             # both layers
 *   tsx scripts/run-evals.ts --config    # layer 1 only
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES_DIR = path.join(REPO_ROOT, 'evals/cases');
const RESULTS_DIR = path.join(REPO_ROOT, 'evals/results');
const UMBRELLA_DESIGN = 'docs/intents/agent-native-cli-layer/design.md';

/** Documents an agent is expected to read and obey. */
const CONFIG_FILES = ['README.md', 'CLAUDE.md', 'AGENTS.md'];
const CONFIG_DIRS = ['docs', '.github', '.agent', 'apps/docs/content'];
const SKIP_DIRS = new Set(['node_modules', 'issues', 'results', '.next', 'dist']);
/** Intents describe work that does not exist yet; a script they name is a plan, not a link. */
const PLANNED_DOCS = /^docs\/intents\//;

export interface Expectation {
  check: 'output-contains' | 'output-omits' | 'shell';
  value: string;
}

export interface EvalCase {
  id: string;
  why: string;
  prompt: string;
  allowedTools?: string;
  expect: Expectation[];
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Layer 1 — config checks
// ---------------------------------------------------------------------------

function readDirOrEmpty(root: string, rel: string): fs.Dirent[] {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }) : [];
}

function walkDocs(root: string, rel: string, out: string[]): void {
  for (const e of readDirOrEmpty(root, rel)) {
    if (SKIP_DIRS.has(e.name)) continue;
    const child = path.join(rel, e.name);
    if (e.isDirectory()) walkDocs(root, child, out);
    else if (/\.mdx?$/.test(e.name)) out.push(child);
  }
}

export function agentDocs(root = REPO_ROOT): string[] {
  const out = CONFIG_FILES.filter((f) => fs.existsSync(path.join(root, f)));
  for (const dir of CONFIG_DIRS) walkDocs(root, dir, out);
  return out.sort();
}

/** Strip fenced code blocks and inline code: example markdown is not a reference. */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Targets that are not repository paths: URLs, anchors, placeholders, absolute paths. */
function isNotAPath(raw: string): boolean {
  if (/^(https?:|mailto:|file:|#|<|\$|\/)/.test(raw)) return true;
  return !raw.includes('/') && !raw.includes('.');
}

/** Why one link is broken, or null when it resolves inside the repository. */
function linkProblem(root: string, doc: string, raw: string): string | null {
  const target = raw.split('#')[0];
  if (!target) return null;
  const abs = path.resolve(path.dirname(path.join(root, doc)), target);
  if (path.relative(root, abs).startsWith('..')) return `${doc} → ${raw} (outside the repository — dangles in a clone)`;
  return fs.existsSync(abs) ? null : `${doc} → ${raw}`;
}

/**
 * Relative markdown links that point at nothing from a standalone checkout. A target
 * that escapes the repository root is reported even when it exists on disk: this repo
 * sits beside its siblings and below the documents that govern them.
 */
export function brokenLinks(docs: string[], root = REPO_ROOT): string[] {
  const broken: string[] = [];
  for (const doc of docs) {
    const text = stripCode(fs.readFileSync(path.join(root, doc), 'utf-8'));
    for (const m of text.matchAll(LINK)) {
      const raw = m[1]!;
      if (isNotAPath(raw)) continue;
      const problem = linkProblem(root, doc, raw);
      if (problem) broken.push(problem);
    }
  }
  return broken;
}

/** `scripts/<name>` and `npm run <script>` mentions, outside intents, that name nothing that exists. */
export function missingScripts(docs: string[], root = REPO_ROOT): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };
  const out = new Set<string>();
  for (const doc of docs.filter((d) => !PLANNED_DOCS.test(d))) {
    const text = fs.readFileSync(path.join(root, doc), 'utf-8');
    for (const m of text.matchAll(/\bscripts\/([\w.-]+\.(?:ts|sh|mjs))\b/g)) {
      if (!fs.existsSync(path.join(root, 'scripts', m[1]!))) out.add(`${doc} → scripts/${m[1]}`);
    }
    for (const m of text.matchAll(/\bnpm run ([\w:-]+)/g)) {
      if (!(m[1]! in pkg.scripts)) out.add(`${doc} → npm run ${m[1]}`);
    }
  }
  return [...out];
}

const FLOOR_ID = /\b([FOEVSPDTHMK]\d{1,2})\b/g;
const FLOOR_ROW = /\|\s*([FOEVSPDTHMK]\d{1,2})\s*\|/g;

/** Floor ids cited in one file, if it exists. */
function citedIds(file: string): Set<string> {
  if (!fs.existsSync(file)) return new Set();
  return new Set([...stripCode(fs.readFileSync(file, 'utf-8')).matchAll(FLOOR_ID)].map((m) => m[1]!));
}

const NOT_A_CHILD = new Set(['agent-native-cli-layer', '_template']);

/** Floor ids cited by child intents that the umbrella design does not define. */
export function unknownFloorIds(root = REPO_ROOT): string[] {
  const umbrella = fs.readFileSync(path.join(root, UMBRELLA_DESIGN), 'utf-8');
  const defined = new Set([...umbrella.matchAll(FLOOR_ROW)].map((m) => m[1]!));
  const out: string[] = [];
  const children = readDirOrEmpty(root, 'docs/intents').filter((e) => e.isDirectory() && !NOT_A_CHILD.has(e.name));
  for (const e of children) {
    for (const f of ['intent.md', 'design.md']) {
      for (const id of citedIds(path.join(root, 'docs/intents', e.name, f))) {
        if (!defined.has(id)) out.push(`docs/intents/${e.name}/${f} → ${id}`);
      }
    }
  }
  return out;
}

const MIN_AGENT_DOCS = 5;

function list(xs: string[]): string {
  return xs.length === 0 ? 'ok' : xs.join('\n    ');
}

function runConfigLayer(): CheckResult[] {
  const docs = agentDocs();
  const broken = brokenLinks(docs);
  const scripts = missingScripts(docs);
  const ids = unknownFloorIds();
  return [
    { name: 'agent documents found', passed: docs.length > MIN_AGENT_DOCS, detail: `${docs.length} agent-facing documents` },
    { name: 'every relative link in an agent document resolves', passed: broken.length === 0, detail: list(broken) },
    { name: 'every script a document names exists (intents excepted)', passed: scripts.length === 0, detail: list(scripts) },
    { name: 'every floor id a child intent cites is defined in the umbrella', passed: ids.length === 0, detail: list(ids) },
  ];
}

// ---------------------------------------------------------------------------
// Layer 2 — task evals
// ---------------------------------------------------------------------------

function loadCases(): EvalCase[] {
  return readDirOrEmpty(REPO_ROOT, 'evals/cases')
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), 'utf-8')) as EvalCase);
}

/** Case files are committed to this repository; their shell checks are ours, not input. */
function shellCheckPasses(command: string): boolean {
  return spawnSync('bash', ['-c', command], { cwd: REPO_ROOT, encoding: 'utf8' }).status === 0;
}

function failureOf(hay: string, e: Expectation): string | null {
  if (e.check === 'output-contains') return hay.includes(e.value.toLowerCase()) ? null : `expected output to contain "${e.value}"`;
  if (e.check === 'output-omits') return hay.includes(e.value.toLowerCase()) ? `expected output NOT to contain "${e.value}"` : null;
  return shellCheckPasses(e.value) ? null : `shell check failed: ${e.value}`;
}

export function grade(output: string, expect: Expectation[]): { ok: boolean; failed: string[] } {
  const hay = output.toLowerCase();
  const failed = expect.map((e) => failureOf(hay, e)).filter((f): f is string => f !== null);
  return { ok: failed.length === 0, failed };
}

export type Billing = 'none' | 'subscription' | 'console';

const BILLING_LABEL: Record<Billing, string> = {
  none: 'nothing',
  subscription: 'the Claude subscription',
  console: 'the Console API key',
};

/** GitHub Actions writes an absent secret as an empty variable, so test for non-empty. */
export function billingFor(env: NodeJS.ProcessEnv): { billing: Billing; bothSet: boolean; hasCredential: boolean } {
  const key = Boolean(env.ANTHROPIC_API_KEY);
  const token = Boolean(env.CLAUDE_CODE_OAUTH_TOKEN);
  let billing: Billing = 'none';
  if (key) billing = 'console';
  else if (token) billing = 'subscription';
  return { billing, bothSet: key && token, hasCredential: key || token };
}

export function evalEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']) {
    if (!out[k]) delete out[k];
  }
  return out;
}

const CASE_TIMEOUT_MS = 180_000;
/** 16 MiB of transcript. */
const OUTPUT_BUFFER = 16777216;

interface CaseResult {
  id: string;
  status: 'pass' | 'fail' | 'error';
  failed: string[];
}

function runCase(c: EvalCase): CaseResult {
  const args = ['-p', c.prompt, '--allowedTools', c.allowedTools ?? 'Read,Grep,Glob', '--max-turns', process.env.EVAL_MAX_TURNS ?? '3'];
  if (process.env.EVAL_MODEL) args.push('--model', process.env.EVAL_MODEL);
  const r = spawnSync('claude', args, { cwd: REPO_ROOT, encoding: 'utf8', env: evalEnv(process.env), timeout: CASE_TIMEOUT_MS, maxBuffer: OUTPUT_BUFFER });
  if (r.error || typeof r.stdout !== 'string') return { id: c.id, status: 'error', failed: [String(r.error ?? 'no output')] };
  const { ok, failed } = grade(r.stdout, c.expect);
  return { id: c.id, status: ok ? 'pass' : 'fail', failed };
}

function runTaskLayer(cases: EvalCase[]): number {
  const { billing, bothSet } = billingFor(process.env);
  console.warn(`\n🧪 Layer 2 — ${cases.length} task eval(s), billing to ${BILLING_LABEL[billing]}\n`);
  if (bothSet) console.warn('  ⚠️ Both credentials are set; ANTHROPIC_API_KEY wins and bills per token. Unset one.\n');
  const results = cases.map(runCase);
  for (const r of results) {
    console.warn(`  ${r.status === 'pass' ? '✓' : '✗'} ${r.id}`);
    for (const f of r.failed) console.warn(`      ${f}`);
  }
  const passed = results.filter((r) => r.status === 'pass').length;
  const stamp = new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, `${stamp}.json`), `${JSON.stringify({ date: stamp, total: results.length, passed, results }, null, 2)}\n`);
  console.warn(`\n  pass rate: ${passed}/${results.length}`);
  return results.length - passed;
}

// ---------------------------------------------------------------------------

function main(): void {
  const configOnly = process.argv.includes('--config');
  let failures = 0;

  console.warn('\n🧪 Layer 1 — configuration checks\n');
  for (const r of runConfigLayer()) {
    console.warn(`  ${r.passed ? '✓' : '✗'} ${r.name}\n    ${r.detail}`);
    if (!r.passed) failures++;
  }

  const cases = loadCases();
  if (configOnly) {
    console.warn('\n🧪 Layer 2 — skipped (--config)\n');
  } else if (!billingFor(process.env).hasCredential) {
    console.warn(`\n🧪 Layer 2 — skipped: no credential (${cases.length} case(s) not run).\n`);
  } else {
    failures += runTaskLayer(cases);
  }

  console.warn(`\n${failures === 0 ? '✅ evals pass' : `💥 ${failures} eval failure(s)`}\n`);
  if (failures > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
