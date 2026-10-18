/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * mutation.ts — Stryker over the family, in the two shapes `.sdlc/intents/mutation-tested/` asks for.
 *
 * A surviving mutant is a test suite that passes on broken code: rule 4 of the working model
 * ("a fix is not done until a check would have caught it") stated per line instead of per fix.
 *
 *   npx tsx scripts/mutation.ts changed --event pull_request --base origin/main [--concurrency 4] [--summary <file>]
 *       The PR lane (R1–R4). Mutates only the lines the pull request added or changed, in the
 *       packages `scripts/affected.mts` names, and fails when one of those mutants is not
 *       detected — unless its line carries `// Stryker disable next-line <mutator>: <reason>`.
 *
 *   npx tsx scripts/mutation.ts full --package roundel [--concurrency 2] [--out <file>]
 *       One package, every mutation source, for the weekly ratchet (R5). Prints the score and
 *       writes a result file.
 *
 *   npx tsx scripts/mutation.ts record --results <dir> [--date YYYY-MM-DD]
 *       Folds result files into `.sdlc/bands/mutation-ratchets.json`: appends the observation,
 *       raises a floor the run beat, sets a first floor for a package measured for the first
 *       time, and exits 2 when a measured package fell below its floor (R6).
 *
 * What is mutated is what coverage measures: `src/**\/*.ts`, minus tests, `__fixtures__` and
 * `TESTED_IN_ANOTHER_PROCESS` (graded by an incumbent's suite in a child process, which no
 * in-process mutant can reach). One list, imported, so the two denominators cannot drift.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

import { TESTED_IN_ANOTHER_PROCESS } from '../vitest-coverage.config.js';

import { affected } from './affected.mjs';

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const RATCHETS_FILE = '.sdlc/bands/mutation-ratchets.json';
const STRYKER_BIN = path.join(REPO_ROOT, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');
const SETUP_FILE = path.join(SCRIPT_DIR, 'mutation-vitest-setup.ts');
/** Where a run writes its vitest config, inside the package so vite bundles the package's own (gitignored). */
const WRAPPER_DIR = '.mutation';

/**
 * The PR lane's budget (R3). The job's own `timeout-minutes` is 15; the build before this step
 * takes about two of them, so the mutants get eleven and the rest is headroom. A run that needs
 * more is a pull request too large to mutate in the lane, and it fails saying so — it does not
 * pass unmeasured.
 */
export const PR_BUDGET = {
  wallClockMinutes: 11,
  /** Added to a mutant's measured test time before Stryker calls it a timeout (an infinite loop). */
  timeoutMS: 10_000,
  dryRunTimeoutMinutes: 4,
} as const;

/**
 * Suites that cannot pass against instrumented source, by package, each with why. They measure
 * the source text itself (bytes, a bundle), and Stryker's instrumented copy is larger by
 * construction. Skipped by the mutation run only: `npm test` and coverage still run them.
 * Found empirically, by the dry run failing; `mutation-lock.test.ts` checks each file exists.
 */
export const SKIPPED_TESTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  roundel: {
    'src/weight.test.ts': 'bundles src and holds it to a byte ceiling; instrumented source is larger by construction',
  },
};

// ── What is a mutation source ─────────────────────────────────────────────────────────────

const ANOTHER_PROCESS: ReadonlySet<string> = new Set(TESTED_IN_ANOTHER_PROCESS);

/** Is `file` (relative to its package, forward slashes) source a mutant may be placed in? */
export function isMutationSource(file: string): boolean {
  if (!file.startsWith('src/') || !/\.(?:ts|mts|cts)$/u.test(file)) return false;
  if (/\.test\.[cm]?ts$/u.test(file) || file.endsWith('.d.ts')) return false;
  if (file.split('/').includes('__fixtures__')) return false;
  return !ANOTHER_PROCESS.has(file);
}

/** Where a repository path lives: `{ pkg, file }` for `packages/<pkg>/<file>`, else undefined. */
export function packageOf(repoPath: string): { pkg: string; file: string } | undefined {
  const m = /^packages\/([^/]+)\/(.+)$/u.exec(repoPath);
  return m ? { pkg: m[1]!, file: m[2]! } : undefined;
}

// ── Which lines a pull request changed ────────────────────────────────────────────────────

export type LineRange = readonly [start: number, end: number];

/**
 * The added or changed lines of each file in a `git diff -U0` (new side), by repository path.
 * A hunk that only deletes (`+c,0`) adds no line; a deleted file has no new side at all.
 */
export function parseChangedLines(diff: string): Map<string, LineRange[]> {
  const out = new Map<string, LineRange[]>();
  let current: string | undefined;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice('+++ '.length).trim();
      current = target === '/dev/null' ? undefined : target.replace(/^b\//u, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (!hunk || current === undefined) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count === 0) continue;
    const ranges = out.get(current) ?? [];
    ranges.push([start, start + count - 1]);
    out.set(current, ranges);
  }
  return out;
}

/** Stryker `mutate` entries (`src/x.ts:10-12`) for each package, from the changed lines. */
export function mutateSpecs(changed: ReadonlyMap<string, readonly LineRange[]>, packages: ReadonlySet<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [repoPath, ranges] of changed) {
    const where = packageOf(repoPath);
    if (!where || !packages.has(where.pkg) || !isMutationSource(where.file)) continue;
    const specs = out.get(where.pkg) ?? [];
    for (const [start, end] of ranges) specs.push(`${where.file}:${String(start)}-${String(end)}`);
    out.set(where.pkg, specs);
  }
  return out;
}

// ── Reading a Stryker report ──────────────────────────────────────────────────────────────

export type MutantStatus = 'Killed' | 'Survived' | 'NoCoverage' | 'Timeout' | 'CompileError' | 'RuntimeError' | 'Ignored' | 'Pending';

export interface ReportMutant {
  id: string;
  mutatorName: string;
  replacement?: string;
  status: MutantStatus;
  statusReason?: string;
  static?: boolean;
  testsCompleted?: number;
  coveredBy?: string[];
  location: { start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface StrykerReport {
  files: Record<string, { mutants: ReportMutant[] }>;
}

/** One mutant a test suite did not detect, as the lane and the PR body print it. */
export interface Undetected {
  file: string;
  line: number;
  column: number;
  mutator: string;
  replacement: string;
  status: 'Survived' | 'NoCoverage';
}

export interface Summary {
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  /** CompileError and RuntimeError: mutants that are not valid programs, out of the score. */
  invalid: number;
  /** `// Stryker disable` lines. Out of the score, and every one carries a reason (the lock). */
  ignored: number;
  /** Detected ÷ (detected + undetected), as a percentage; null when there was nothing to score. */
  score: number | null;
  undetected: Undetected[];
  /** Survivors that ran no test although a test covers them — the runner failed, not the suite. */
  silentSurvivors: Undetected[];
}

const PERCENT = 100;
/** Scores are kept to two decimals. */
const SCALE = 100;
const round = (n: number): number => Math.round(n * SCALE) / SCALE;
const MS_PER_MINUTE = 60_000;

/** Counts, the score and the undetected mutants of one report. `prefix` is prepended to each file (the package dir). */
export function summarise(report: StrykerReport, prefix = ''): Summary {
  const s: Summary = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, invalid: 0, ignored: 0, score: null, undetected: [], silentSurvivors: [] };
  for (const [file, { mutants }] of Object.entries(report.files)) {
    for (const m of mutants) {
      const row = (status: 'Survived' | 'NoCoverage'): Undetected => ({
        file: `${prefix}${file}`,
        line: m.location.start.line,
        column: m.location.start.column,
        mutator: m.mutatorName,
        replacement: m.replacement ?? '',
        status,
      });
      switch (m.status) {
        case 'Killed': s.killed++; break;
        case 'Timeout': s.timeout++; break;
        case 'Survived':
          s.survived++;
          s.undetected.push(row('Survived'));
          if ((m.testsCompleted ?? 0) === 0 && (m.coveredBy?.length ?? 0) > 0) s.silentSurvivors.push(row('Survived'));
          break;
        case 'NoCoverage': s.noCoverage++; s.undetected.push(row('NoCoverage')); break;
        case 'CompileError':
        case 'RuntimeError': s.invalid++; break;
        default: s.ignored++;
      }
    }
  }
  const detected = s.killed + s.timeout;
  const scored = detected + s.survived + s.noCoverage;
  s.score = scored === 0 ? null : round((detected / scored) * PERCENT);
  s.undetected.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  return s;
}

// ── `// Stryker disable` needs a reason ───────────────────────────────────────────────────

const DISABLE = /Stryker\s+disable\b(.*)$/u;
/** `next-line`? then `all` or a comma list of mutator names, then `: <reason>`. */
const WELL_FORMED = /^\s+(?:next-line\s+)?(?:all|[A-Za-z]+(?:\s*,\s*[A-Za-z]+)*)\s*:\s*(\S.*)$/u;
/** A reason shorter than this is a label, not a reason. */
export const MIN_DISABLE_REASON = 15;

/** Every `Stryker disable` comment in `source` without a reason, as `file:line: why`. */
export function disableProblems(file: string, source: string): string[] {
  const problems: string[] = [];
  source.split('\n').forEach((text, i) => {
    const comment = /\/\/(.*)$|\/\*(.*?)\*\//u.exec(text);
    const body = comment?.[1] ?? comment?.[2];
    const hit = body === undefined ? null : DISABLE.exec(body);
    if (!hit) return;
    const reason = WELL_FORMED.exec(hit[1] ?? '')?.[1]?.replace(/\*\/\s*$/u, '').trim();
    if (reason === undefined || reason.length < MIN_DISABLE_REASON) {
      problems.push(`${file}:${String(i + 1)}: \`Stryker disable\` needs \`<mutator>: <reason>\` — a reason of at least ${String(MIN_DISABLE_REASON)} characters saying why the mutant cannot be killed, not that it is inconvenient`);
    }
  });
  return problems;
}

// ── Running Stryker ───────────────────────────────────────────────────────────────────────

/**
 * The vitest config a Stryker run uses: the package's own config, unchanged, plus two things.
 *
 *   1. `mutation-vitest-setup.ts`, which makes vitest 5 honour the test filter Stryker sends
 *      (without it every mutant a `describe` block covers "survives" having run no test).
 *   2. The package's `SKIPPED_TESTS`, which cannot pass against instrumented source.
 *
 * Written into `<package>/.mutation/` and imported statically, because the package's config
 * imports `../../vitest-*.config.js` by the name vite resolves to a `.ts` — a native
 * `import()` of it from elsewhere cannot.
 */
export function wrapperConfig(packageDir: string, skipped: readonly string[]): string {
  return [
    "import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';",
    "import base from '../vitest.config.ts';",
    '',
    'export default mergeConfig(base, defineConfig({',
    `  root: ${JSON.stringify(packageDir)},`,
    `  test: { setupFiles: [${JSON.stringify(SETUP_FILE)}], exclude: [...configDefaults.exclude, ...${JSON.stringify(skipped)}] },`,
    '}));',
    '',
  ].join('\n');
}

export interface RunOptions {
  vitestConfig: string;
  mutate: readonly string[];
  concurrency: number;
  timeoutMS: number;
  dryRunTimeoutMinutes: number;
  reportFile: string;
}

/** The Stryker config every run uses; see the spec's Design for why each value is what it is. */
export function strykerConfig(o: RunOptions): Record<string, unknown> {
  return {
    testRunner: 'vitest',
    vitest: { configFile: o.vitestConfig, related: true },
    coverageAnalysis: 'perTest',
    mutate: [...o.mutate],
    // In place: the package's vitest config imports `../../vitest-*.config.ts` and its tests
    // resolve siblings through the workspace, neither of which survives a sandbox copy.
    inPlace: true,
    // Not needed (vitest does not type-check) and harmful in place: it writes `// @ts-nocheck`
    // into every file under src/, and `shape.test.ts` reads `index.ts` as text.
    disableTypeChecks: false,
    concurrency: o.concurrency,
    timeoutMS: o.timeoutMS,
    dryRunTimeoutMinutes: o.dryRunTimeoutMinutes,
    reporters: ['json', 'clear-text', 'progress'],
    jsonReporter: { fileName: o.reportFile },
    clearTextReporter: { allowColor: false, logTests: false, maxTestsToLog: 0, reportMutants: true, reportScoreTable: true },
    thresholds: { high: 80, low: 60, break: null },
    tempDirName: '.stryker-tmp',
    cleanTempDir: 'always',
  };
}

export interface PackageRun {
  pkg: string;
  ok: boolean;
  /** Why Stryker did not produce a report, when it did not. */
  error?: string;
  summary?: Summary;
  minutes: number;
}

function gitClean(paths: string[]): boolean {
  const r = spawnSync('git', ['status', '--porcelain', '--', ...paths], { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === '';
}

/** Stryker over `mutate` in one package. `budgetMs` kills it, and the run reports why. */
export function runPackage(pkg: string, mutate: readonly string[], o: { concurrency: number; timeoutMS: number; dryRunTimeoutMinutes: number; budgetMs?: number }): PackageRun {
  const packageDir = path.join(REPO_ROOT, 'packages', pkg);
  const work = mkdtempSync(path.join(tmpdir(), `mutation-${pkg}-`));
  const reportFile = path.join(work, 'report.json');
  const configFile = path.join(work, 'stryker.config.json');
  const wrapperDir = path.join(packageDir, WRAPPER_DIR);
  const vitestConfig = path.join(wrapperDir, 'vitest.config.ts');
  mkdirSync(wrapperDir, { recursive: true });
  writeFileSync(vitestConfig, wrapperConfig(packageDir, Object.keys(SKIPPED_TESTS[pkg] ?? {})));
  writeFileSync(configFile, JSON.stringify(strykerConfig({ ...o, vitestConfig, mutate, reportFile }), null, 2));
  const started = Date.now();
  const r = spawnSync(process.execPath, [STRYKER_BIN, 'run', configFile], {
    cwd: packageDir,
    stdio: 'inherit',
    timeout: o.budgetMs,
    killSignal: 'SIGINT',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const minutes = round((Date.now() - started) / MS_PER_MINUTE);
  const result = (error: string | undefined, summary?: Summary): PackageRun => ({ pkg, ok: error === undefined, error, summary, minutes });
  try {
    // In-place mode restores the originals itself; a killed run may not have.
    if (!gitClean([path.join('packages', pkg, 'src')])) return result(`Stryker left packages/${pkg}/src modified — restore it with \`git checkout -- packages/${pkg}/src\``);
    if (r.error && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      return result(`over the lane's budget: stopped after ${String(minutes)} minutes. Split the pull request, or kill the mutants in a smaller one first`);
    }
    if (r.status !== 0 || !existsSync(reportFile)) return result(`Stryker exited ${String(r.status ?? r.signal)} without a report — its own error is above`);
    const summary = summarise(JSON.parse(readFileSync(reportFile, 'utf8')) as StrykerReport, `packages/${pkg}/`);
    if (summary.silentSurvivors.length > 0) {
      return result(`${String(summary.silentSurvivors.length)} covered mutant(s) "survived" having run no test — the runner's filter matched nothing, so this report measures nothing (see scripts/mutation-vitest-setup.ts)`, summary);
    }
    return result(undefined, summary);
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(wrapperDir, { recursive: true, force: true });
  }
}

// ── The weekly ratchet ────────────────────────────────────────────────────────────────────

export interface Observation {
  date: string;
  commit: string;
  score: number;
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  minutes: number;
}

export interface FloorStep {
  floor: number;
  setOn: string;
  why: string;
  /** A step below the one before it must cite a decision in `.sdlc/decisions/`. */
  decision?: string;
}

export interface MeasuredRatchet {
  status: 'measured';
  floor: number;
  history: FloorStep[];
  observations: Observation[];
}

export interface UnmeasuredRatchet {
  status: 'unmeasured';
  reason: string;
  observations?: Observation[];
}

export type Ratchet = MeasuredRatchet | UnmeasuredRatchet;

export interface RatchetsDoc {
  $comment: string;
  ratchets: Record<string, Ratchet>;
}

/** The result one weekly `full` run writes for `record` to read. */
export interface FullResult {
  pkg: string;
  commit: string;
  ok: boolean;
  error?: string;
  summary?: Summary;
  minutes: number;
}

/** A floor is the measured score rounded down to one decimal: a re-run of the same code holds it. */
const FLOOR_SCALE = 10;
export const floorOf = (score: number): number => Math.floor(score * FLOOR_SCALE) / FLOOR_SCALE;

export interface RecordOutcome {
  doc: RatchetsDoc;
  breaches: string[];
  notes: string[];
}

const observation = (res: FullResult, s: Summary, score: number, date: string): Observation => ({
  date, commit: res.commit, score, killed: s.killed, timeout: s.timeout, survived: s.survived, noCoverage: s.noCoverage, minutes: res.minutes,
});

/** A first floor for a package measured for the first time. */
function firstFloor(before: UnmeasuredRatchet, obs: Observation): MeasuredRatchet {
  const floor = floorOf(obs.score);
  const detected = obs.killed + obs.timeout;
  return {
    status: 'measured',
    floor,
    history: [{ floor, setOn: obs.date, why: `First full run, at ${obs.commit}: ${String(obs.score)}% (${String(detected)} detected of ${String(detected + obs.survived + obs.noCoverage)}), rounded down to one decimal.` }],
    observations: [...(before.observations ?? []), obs],
  };
}

/** One package's result folded into `next` (mutated). Returns the breach, if it is one. */
function recordOne(next: RatchetsDoc, res: FullResult, date: string, notes: string[]): string | undefined {
  const before = next.ratchets[res.pkg];
  if (!before) {
    notes.push(`${res.pkg}: no ratchet entry — add one to ${RATCHETS_FILE} before measuring it`);
    return undefined;
  }
  const s = res.summary;
  const score = s?.score;
  if (!res.ok || !s || score === null || score === undefined) {
    const why = `${date}: the weekly run produced no score — ${res.error ?? 'nothing to mutate'}`;
    notes.push(`${res.pkg}: ${why}`);
    if (before.status === 'measured') return `${res.pkg}: ${why}`;
    before.reason = why;
    return undefined;
  }
  if (before.status === 'unmeasured') {
    next.ratchets[res.pkg] = firstFloor(before, observation(res, s, score, date));
    notes.push(`${res.pkg}: first floor ${String(floorOf(score))}%`);
    return undefined;
  }
  before.observations.push(observation(res, s, score, date));
  if (score < before.floor) {
    return `${res.pkg}: ${String(score)}% is below its floor of ${String(before.floor)}% (${String(s.survived + s.noCoverage)} undetected). Kill the new survivors; lowering a floor takes a decision in .sdlc/decisions/, cited in a new history step.`;
  }
  const raised = floorOf(score);
  if (raised > before.floor) {
    before.history.push({ floor: raised, setOn: date, why: `Weekly run at ${res.commit} measured ${String(score)}%, above the ${String(before.floor)}% floor; the floor follows it up.` });
    before.floor = raised;
    notes.push(`${res.pkg}: floor raised to ${String(raised)}%`);
  }
  return undefined;
}

/** Fold one weekly run's results into the ratchets. Pure: the caller writes the file. */
export function record(doc: RatchetsDoc, results: readonly FullResult[], date: string): RecordOutcome {
  const next: RatchetsDoc = structuredClone(doc);
  const notes: string[] = [];
  const breaches = results.map((res) => recordOne(next, res, date, notes)).filter((b): b is string => b !== undefined);
  return { doc: next, breaches, notes };
}

// ── The CLI ───────────────────────────────────────────────────────────────────────────────

/** `node`, the script, the command: options start after them. */
const ARGS_AFTER_COMMAND = 3;

function arg(name: string): string | undefined {
  const argv = process.argv.slice(ARGS_AFTER_COMMAND);
  const at = argv.lastIndexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

const DEFAULT_CONCURRENCY = 2;
/** A whole-repository diff can be large; the default 1 MiB would truncate it. */
const DIFF_BUFFER_BYTES = 256 * 1024 * 1024;
const concurrency = (): number => Number(arg('--concurrency') ?? DEFAULT_CONCURRENCY);

function head(): string {
  const r = spawnSync('git', ['rev-parse', '--short=10', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.stdout.trim();
}

/** Every mutation source of a package, as Stryker `mutate` globs relative to the package. */
function allSources(pkg: string): string[] {
  const r = spawnSync('git', ['ls-files', '--', `packages/${pkg}/src`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.stdout.split('\n').filter(Boolean).map((f) => packageOf(f)!.file).filter(isMutationSource).toSorted();
}

/** Characters of a mutant's replacement the table shows. */
const REPLACEMENT_SHOWN = 80;
const row = (u: Undetected): string => `| \`${u.file}:${String(u.line)}:${String(u.column)}\` | ${u.mutator} | ${u.status} | \`${u.replacement.replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, REPLACEMENT_SHOWN)}\` |`;

/** The mutate specs for a pull request, or the sentence that says why there are none. */
function changedSpecs(event: string, base: string): { specs: Map<string, string[]> } | { none: string; code: number } {
  if ((event !== 'pull_request' && event !== 'merge_group') || base === '') {
    return { none: `Not a pull request (\`${event || 'none'}\`): nothing changed to mutate here. The weekly full run (\`mutation.yml\`) measures \`main\`.`, code: 0 };
  }
  const set = affected({ root: REPO_ROOT, event: 'pull_request', base, log: (l) => process.stderr.write(`${l}\n`) });
  const diff = spawnSync('git', ['diff', '-U0', '--no-color', '--no-renames', '--diff-filter=AMR', `${base}...HEAD`, '--', 'packages/'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: DIFF_BUFFER_BYTES });
  if (diff.status !== 0) return { none: `\`git diff ${base}...HEAD\` failed: ${diff.stderr.trim()}`, code: 1 };
  const specs = mutateSpecs(parseChangedLines(diff.stdout), new Set(set.packages));
  if (specs.size === 0) return { none: `No source line under \`packages/*/src\` changed against \`${base}\`; nothing to mutate.`, code: 0 };
  return { specs };
}

/** Stryker over each package's changed lines, inside the lane's wall-clock budget. */
function runChanged(specs: ReadonlyMap<string, string[]>): PackageRun[] {
  const deadline = Date.now() + PR_BUDGET.wallClockMinutes * MS_PER_MINUTE;
  return [...specs].map(([pkg, mutate]) => {
    const budgetMs = deadline - Date.now();
    if (budgetMs <= 0) return { pkg, ok: false, error: 'the lane ran out of budget before reaching it', minutes: 0 };
    return runPackage(pkg, mutate, { concurrency: concurrency(), timeoutMS: PR_BUDGET.timeoutMS, dryRunTimeoutMinutes: PR_BUDGET.dryRunTimeoutMinutes, budgetMs });
  });
}

const cell = (n: number | null | undefined, unit = ''): string => (n === null || n === undefined ? '—' : `${String(n)}${unit}`);

/** The lane's report, as Markdown lines. */
export function changedReport(specs: ReadonlyMap<string, readonly string[]>, runs: readonly PackageRun[]): string[] {
  const lines = ['| Package | Changed ranges | Score | Killed | Timeout | Survived | No coverage | Minutes |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of runs) {
    const s = r.summary;
    lines.push(`| ${r.pkg} | ${String(specs.get(r.pkg)?.length ?? 0)} | ${cell(s?.score, '%')} | ${cell(s?.killed)} | ${cell(s?.timeout)} | ${cell(s?.survived)} | ${cell(s?.noCoverage)} | ${String(r.minutes)} |`);
  }
  lines.push('', ...runs.filter((r) => !r.ok).map((r) => `- ❌ **${r.pkg}**: ${r.error ?? ''}`));
  // A run refused as measuring nothing lists no gaps: its "survivors" ran no test.
  const undetected = runs.filter((r) => r.ok).flatMap((r) => r.summary?.undetected ?? []);
  if (undetected.length > 0) {
    lines.push(
      `❌ **${String(undetected.length)} mutant(s) on lines this pull request changed are not detected by any test.** Each is a change to the code that every test still passes on. Add the assertion that fails on it; when the mutant is truly equivalent (no behaviour can tell it apart), put \`// Stryker disable next-line <Mutator>: <why it is equivalent>\` above the line.`,
      '',
      '| Where | Mutator | Status | Replacement |',
      '|---|---|---|---|',
      ...undetected.map(row),
    );
  } else if (runs.every((r) => r.ok)) {
    lines.push('✅ Every mutant on a changed line is detected by a test.');
  }
  return lines;
}

function changedCommand(): number {
  const summaryFile = arg('--summary');
  const lines: string[] = ['## Mutation testing · changed lines', ''];
  const finish = (code: number): number => {
    if (summaryFile) writeFileSync(summaryFile, `${lines.join('\n')}\n`, { flag: 'a' });
    process.stdout.write(`${lines.join('\n')}\n`);
    return code;
  };
  const plan = changedSpecs(arg('--event') ?? '', arg('--base') ?? '');
  if ('none' in plan) {
    lines.push(plan.none);
    return finish(plan.code);
  }
  if (process.argv.includes('--plan')) {
    process.stdout.write(`${JSON.stringify(Object.fromEntries(plan.specs))}\n`);
    return 0;
  }
  const runs = runChanged(plan.specs);
  lines.push(...changedReport(plan.specs, runs));
  return finish(runs.some((r) => !r.ok || (r.summary?.undetected.length ?? 0) > 0) ? 1 : 0);
}

function fullCommand(): number {
  const pkg = arg('--package');
  if (!pkg || !existsSync(path.join(REPO_ROOT, 'packages', pkg, 'package.json'))) {
    process.stderr.write(`mutation full: --package must name a directory under packages/ (got ${String(pkg)})\n`);
    return 1;
  }
  const sources = allSources(pkg);
  const run: PackageRun = sources.length === 0
    ? { pkg, ok: false, error: 'no mutation source — every file is a test, a fixture or tested in another process', minutes: 0 }
    : runPackage(pkg, sources, { concurrency: concurrency(), timeoutMS: PR_BUDGET.timeoutMS, dryRunTimeoutMinutes: 15 });
  const result: FullResult = { pkg, commit: head(), ok: run.ok, error: run.error, summary: run.summary, minutes: run.minutes };
  const out = arg('--out');
  if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  const s = run.summary;
  process.stdout.write(`\n${pkg}: ${run.ok ? `${String(s?.score)}% — killed ${String(s?.killed)}, timeout ${String(s?.timeout)}, survived ${String(s?.survived)}, no coverage ${String(s?.noCoverage)}, ${String(run.minutes)} min` : `no score: ${run.error ?? ''}`}\n`);
  // A package with no floor yet records why it could not be measured; one with a floor fails here.
  const doc = JSON.parse(readFileSync(path.join(REPO_ROOT, RATCHETS_FILE), 'utf8')) as RatchetsDoc;
  return run.ok || doc.ratchets[pkg]?.status !== 'measured' ? 0 : 1;
}

function recordCommand(): number {
  const dir = arg('--results');
  if (!dir) {
    process.stderr.write('mutation record: --results <dir> is required\n');
    return 1;
  }
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.json'));
  const results = files.map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as FullResult);
  const file = path.join(REPO_ROOT, RATCHETS_FILE);
  const doc = JSON.parse(readFileSync(file, 'utf8')) as RatchetsDoc;
  const date = arg('--date') ?? new Date().toISOString().slice(0, 'YYYY-MM-DD'.length);
  const outcome = record(doc, results, date);
  writeFileSync(file, `${JSON.stringify(outcome.doc, null, 2)}\n`);
  for (const n of outcome.notes) process.stdout.write(`${n}\n`);
  for (const b of outcome.breaches) process.stdout.write(`BREACH ${b}\n`);
  return outcome.breaches.length > 0 ? 2 : 0;
}

const COMMANDS: Record<string, () => number> = { changed: changedCommand, full: fullCommand, record: recordCommand };

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const command = COMMANDS[process.argv[2] ?? ''];
  if (!command) {
    process.stderr.write('usage: npx tsx scripts/mutation.ts <changed|full|record> …  (see the header of this file)\n');
    process.exit(1);
  }
  process.exitCode = command();
}
