#!/usr/bin/env tsx

/**
 * lint-workflows.ts — validates GitHub Actions workflows against repo conventions.
 *
 * Hard checks (non-zero exit):
 *  1. Every .yml/.yaml in .github/workflows/ parses as YAML.
 *  2. actions/setup-node uses node-version-file (= .nvmrc) — no hardcoded
 *     version strings. Matrix/env refs like ${{ matrix.node }} are allowed.
 *  3. actions/setup-node uses cache: "npm" — repo is on npm, not pnpm.
 *  4. Workflow has top-level `permissions:` block (least-privilege).
 *  5. Every job sets `timeout-minutes` (caps runaway jobs).
 *  6. Workflows triggered by `push` or `pull_request` set `concurrency:`
 *     so duplicate-ref runs cancel each other.
 *  7. No step passes an action input that the action has renamed. A renamed
 *     input is a hard error at run time, not a warning, so a workflow that
 *     uses one fails on every run — silently, if nothing watches the branch
 *     it runs on. See RENAMED_INPUTS.
 *
 * Soft warnings (notice line, not a failure):
 *  8. Third-party actions are pinned to a SHA, not a floating tag.
 *     `actions/*`, `github/*`, and `./.github/actions/*` are exempt.
 *
 * Usage:
 *   tsx scripts/lint-workflows.ts              # exit non-zero on hard fail
 *   tsx scripts/lint-workflows.ts --quiet      # only print on failure
 *   tsx scripts/lint-workflows.ts --strict     # promote soft warnings to errors
 *
 * Wired as `npm run lint:workflows` and gated in CI via the quality job.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

import yaml from 'js-yaml';

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  name?: string;
  steps?: Step[];
  'timeout-minutes'?: number;
  strategy?: object;
  uses?: string;
}

interface Workflow {
  name?: string;
  on?: unknown;
  jobs?: Record<string, Job>;
  permissions?: unknown;
  concurrency?: unknown;
}

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const isNil = (v: unknown): v is null | undefined => v === null || v === undefined;
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');

const args = new Set(process.argv.slice(2));
const QUIET = args.has('--quiet');
const STRICT = args.has('--strict');

const errors: string[] = [];
const warnings: string[] = [];

if (!fs.existsSync(WORKFLOWS_DIR)) {
  console.error(`No workflows dir at ${WORKFLOWS_DIR}`);
  process.exit(1);
}

const files = fs
  .readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .toSorted();

if (files.length === 0) {
  console.error('No workflow files found.');
  process.exit(1);
}

const parsed = new Map<string, Workflow>();
/** The raw text too: a renamed output is read from an `if:`/`env:`/`run:`, not from `with:`. */
const sources = new Map<string, string>();
for (const file of files) {
  const full = path.join(WORKFLOWS_DIR, file);
  try {
    const text = fs.readFileSync(full, 'utf8');
    sources.set(file, text);
    parsed.set(file, yaml.load(text) as Workflow);
  } catch (e) {
    errors.push(`[yaml] ${file}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
}

const FIRST_PARTY_PREFIXES = ['actions/', 'github/'];
const isLocalAction = (uses: string) => uses.startsWith('./');
const isFirstParty = (uses: string) => FIRST_PARTY_PREFIXES.some((p) => uses.startsWith(p));
const isShaPinned = (uses: string) => {
  const at = uses.indexOf('@');
  if (at === -1) return false;
  return /^[0-9a-f]{40}$/i.test(uses.slice(at + 1));
};

/**
 * Action inputs that were renamed upstream, by action (the part before `@`).
 *
 * The action errors on the old name rather than warning, so the workflow fails on every
 * run. `changesets-pr.yml` ran that way from the v1.5.4 bump until 2026-09-08: three
 * pushes to main in a row failed, and because nothing watches a push-triggered workflow
 * the way a PR check is watched, the only visible symptom was a Version Packages PR that
 * silently stopped refreshing and drifted into conflict.
 *
 * Add a row when an action renames an input — cheaper than rediscovering it from a red run.
 */
const RENAMED_INPUTS: Record<string, Record<string, string>> = {
  'changesets/action': { version: 'version-script', commit: 'commit-message', title: 'pr-title' },
};

/** Every renamed input this step still passes, as a ready-to-print error. */
function renamedInputs(step: Step, where: string): string[] {
  const renamed = RENAMED_INPUTS[(step.uses ?? '').split('@')[0] ?? ''];
  if (!renamed) return [];
  return Object.entries(renamed)
    .filter(([was]) => !isNil(step.with?.[was]))
    .map(([was, now]) => `[renamed-input] ${where}: \`${was}:\` was renamed to \`${now}:\` — the action errors on the old name, so every run of this workflow fails.`);
}

/**
 * Action *outputs* that were renamed upstream, by action.
 *
 * These are worse than the inputs, because they fail the other way. An unknown input is a
 * hard error and stops the run; an unknown output is the empty string, so `if:` conditions
 * that read one go quietly false and the step never runs. `changesets-pr.yml`'s auto-merge
 * step read `hasChangesets` and `pullRequestNumber` and had therefore never executed once.
 *
 * A renamed output is found by scanning the whole workflow text rather than one step's
 * `with:`, because the reader is some *other* step's `if:`, `env:` or `run:`.
 */
const RENAMED_OUTPUTS: Record<string, Record<string, string>> = {
  'changesets/action': { hasChangesets: 'has-changesets', pullRequestNumber: 'pr-number', publishedPackages: 'published-packages' },
};

/**
 * Does the text read `outputs.<name>`? A plain scan rather than a built RegExp: the pattern
 * would be assembled from a table value, which reads as a dynamic-regex finding, and the
 * only thing a `\b` buys here is not matching a longer name that starts with this one.
 */
function reads(text: string, name: string): boolean {
  const needle = `outputs.${name}`;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const after = text[at + needle.length] ?? '';
    if (!/[A-Za-z0-9_-]/.test(after)) return true;
  }
  return false;
}

/** Every renamed output still read anywhere in this workflow, as ready-to-print errors. */
function renamedOutputs(text: string, steps: Step[], file: string): string[] {
  const actions = new Set(steps.map((s) => (s.uses ?? '').split('@')[0] ?? ''));
  return Object.entries(RENAMED_OUTPUTS)
    .filter(([action]) => actions.has(action))
    .flatMap(([action, renamed]) =>
      Object.entries(renamed)
        .filter(([was]) => reads(text, was))
        .map(
          ([was, now]) =>
            `[renamed-output] ${file}: reads \`outputs.${was}\`, which ${action} renamed to \`${now}\` — an unknown output is the empty string, not an error, so whatever depends on it is silently skipped.`,
        ),
    );
}

function triggers(on: unknown): string[] {
  if (!on) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return (on as unknown[]).map(String);
  if (typeof on === 'object') return Object.keys(on as object);
  return [];
}

/**
 * The status checks `main` requires, named the way a check reports: a job's `name:` when it
 * has one, otherwise its key.
 *
 * Branch protection holds the real list and this is a copy of it, which is the trade being
 * made: a copy can drift, and the alternative is a rule that cannot be checked without a
 * network call and a token. Read it back with:
 *
 *   gh api repos/ofri-peretz/burgee/branches/main/protection/required_status_checks --jq '.contexts[]'
 *
 * A required check that cannot run inside a merge queue does not fail the merge — it never
 * reports, and the entry sits in the queue until someone notices. That is the failure this
 * table exists to make impossible.
 */
const REQUIRED_CHECKS = new Set(['Quality Gate', 'Quality (Full) Gate', 'review']);

/** The context names a workflow reports, which is `name:` where there is one and the key where there is not. */
function checkNames(wf: Workflow): string[] {
  return Object.entries(wf.jobs ?? {}).map(([key, job]) => job?.name ?? key);
}

for (const [file, wf] of parsed) {
  if (!wf || typeof wf !== 'object') continue;

  if (isNil(wf.permissions)) {
    errors.push(`[permissions] ${file}: missing top-level \`permissions:\` block (least-privilege).`);
  }

  const t = triggers(wf.on);
  if ((t.includes('push') || t.includes('pull_request')) && !wf.concurrency) {
    errors.push(`[concurrency] ${file}: triggered by push/pull_request but has no \`concurrency:\` block — duplicate runs of the same ref will not cancel.`);
  }

  const required = checkNames(wf).filter((n) => REQUIRED_CHECKS.has(n));
  if (required.length > 0 && !t.includes('merge_group')) {
    errors.push(
      `[merge-queue] ${file}: reports the required check${required.length > 1 ? 's' : ''} ${required.map((n) => `\`${n}\``).join(', ')} but has no \`merge_group:\` trigger — inside a merge queue the check never reports at all, so the entry never merges and never fails.`,
    );
  }

  // A queue entry's ref is unique; a pull request's number is empty on a `merge_group`
  // event. A group keyed on the number alone therefore collapses every entry into one
  // group, and with `cancel-in-progress` they cancel each other.
  if (t.includes('merge_group') && !JSON.stringify(wf.concurrency ?? '').includes('github.ref')) {
    errors.push(
      `[merge-queue] ${file}: triggers on \`merge_group\` but its \`concurrency.group\` does not mention \`github.ref\` — queue entries share a group and cancel one another.`,
    );
  }

  for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
    if (!job || typeof job !== 'object') continue;

    if (isNil(job['timeout-minutes']) && isNil(job.uses)) {
      errors.push(`[timeout] ${file} → ${jobName}: no \`timeout-minutes\` — runaway jobs can drain quota.`);
    }

    const steps = job.steps ?? [];
    steps.forEach((step, i) => {
      if (!step?.uses) return;

      if (step.uses.startsWith('actions/setup-node@')) {
        const ver = step.with?.['node-version'];
        if (typeof ver === 'string' && !ver.includes('${{')) {
          errors.push(
            `[node-version] ${file} → ${jobName} → step ${i + 1}: hardcoded node-version "${ver}". Use node-version-file: .nvmrc.`,
          );
        }
        const cache = step.with?.cache;
        if (!isNil(cache) && cache !== 'npm') {
          errors.push(
            `[cache] ${file} → ${jobName} → step ${i + 1}: cache: "${String(cache)}" — should be "npm" (repo is on npm).`,
          );
        }
      }

      errors.push(...renamedInputs(step, `${file} → ${jobName} → step ${i + 1}`));

      if (!isLocalAction(step.uses) && !isFirstParty(step.uses) && !isShaPinned(step.uses)) {
        const tag = step.uses.split('@')[1] ?? '(no @ref)';
        warnings.push(
          `[sha-pin] ${file} → ${jobName} → step ${i + 1}: \`${step.uses}\` is pinned to a tag "${tag}", not a SHA. Pin to a 40-char commit SHA for supply-chain hardening.`,
        );
      }
    });
  }

  const allSteps = Object.values(wf.jobs ?? {}).flatMap((job) => job?.steps ?? []);
  errors.push(...renamedOutputs(sources.get(file) ?? '', allSteps, file));
}

if (STRICT) {
  errors.push(...warnings);
  warnings.length = 0;
}

const inCI = process.env.GITHUB_ACTIONS === 'true';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;

function annotate(level: 'error' | 'warning', msg: string) {
  const m = msg.match(/^\[[^\]]+]\s+([^\s:]+\.ya?ml)/);
  if (m) {
    const file = `.github/workflows/${m[1]}`;
    process.stdout.write(`::${level} file=${file}::${msg}\n`);
  } else {
    process.stdout.write(`::${level}::${msg}\n`);
  }
}

function appendSummary(lines: string[]) {
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

if (inCI) {
  for (const e of errors) annotate('error', e);
  for (const w of warnings) annotate('warning', w);
}

if (errors.length === 0 && warnings.length === 0) {
  if (!QUIET) console.log(`✅ ${files.length} workflow file(s) pass conventions.`);
  appendSummary([`# ✅ Workflow conventions clean`, ``, `${files.length} workflow file(s) pass all checks.`]);
  process.exit(0);
}

if (warnings.length > 0) {
  console.warn(`⚠️ ${warnings.length} soft warning(s):`);
  for (const w of warnings) console.warn(`- ${w}`);
  process.stderr.write('\n');
}

if (errors.length === 0) {
  console.log(`✅ ${files.length} workflow file(s) pass hard checks (warnings only).`);
  appendSummary([
    `# ✅ Hard checks pass · ${warnings.length} soft warning(s)`,
    ``,
    `Run \`npm run lint:workflows -- --strict\` to escalate warnings to errors.`,
    ``,
    `<details><summary>Warnings</summary>`,
    ``,
    ...warnings.map((w) => `- ${w}`),
    ``,
    `</details>`,
  ]);
  process.exit(0);
}

console.error(`❌ ${errors.length} workflow convention violation(s):`);
for (const err of errors) console.error(`- ${err}`);
process.stderr.write('\n');
appendSummary([
  `# ❌ ${errors.length} workflow convention violation(s)`,
  ``,
  ...errors.map((e) => `- ${e}`),
  ``,
  warnings.length > 0 ? `Plus ${warnings.length} soft warning(s) — see annotations.` : ``,
]);
process.exit(1);
