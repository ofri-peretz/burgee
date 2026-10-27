/**
 * Options, read from `stryker.config.*` as it stands (migration is a no-op: the file Stryker reads
 * is the file oxmutate reads) and from `oxmutate.config.*`, which wins where both set a key.
 * Every key Stryker documents that oxmutate does not use is reported, never silently dropped
 * (spec R15).
 */
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Thresholds {
  high: number;
  low: number;
  /** Fail the run (exit 1) below this score. `null`: never fail on score. */
  break: number | null;
}

export interface Options {
  root: string;
  mutate: string[];
  vitestConfig?: string | undefined;
  concurrency: number;
  timeoutMS: number;
  timeoutFactor: number;
  thresholds: Thresholds;
  excludedMutations: string[];
  /** Score static mutants (Stryker skips them with `ignoreStatic`). */
  ignoreStatic: boolean;
  strykerCompat: boolean;
  reporters: string[];
  jsonReport: string;
  sarifReport: string;
  htmlReport: string;
  incremental: boolean;
  incrementalFile: string;
  /** Re-run a verdict whose covering tests behaved differently across two dry runs. */
  flakyReruns: number;
  shard?: { index: number; count: number };
  /** Only mutants on lines changed since this git ref (the PR lane). */
  since?: string | undefined;
  /** Config keys read but not used, with the reason. */
  unused: { key: string; why: string }[];
  configFile?: string | undefined;
  /** Stop after the dry run: proves the test setup runs under oxmutate (Stryker's `dryRunOnly`). */
  dryRunOnly: boolean;
  /** Budget for one dry run, in minutes (Stryker's default: 5). Over it, the run stops with exit 3. */
  dryRunTimeoutMinutes: number;
  /** Run once before the dry run, split on spaces with no shell, as Stryker runs it. */
  buildCommand?: string | undefined;
  /** Node flags for every Vitest server (Stryker's `testRunnerNodeArgs`). */
  testRunnerNodeArgs: string[];
  /** A dry run that finds no tests scores nothing instead of failing (Stryker's `allowEmpty`). */
  allowEmpty: boolean;
  /** `false` hides the line listing config keys oxmutate does not use (Stryker's `warnings`). */
  warnUnused: boolean;
}

const NOT_NEEDED: Record<string, string> = {
  inPlace: 'oxmutate never copies or rewrites the project; instrumented sources are served from memory',
  tempDirName: 'no sandbox directory exists',
  cleanTempDir: 'no sandbox directory exists',
  symlinkNodeModules: 'no sandbox directory exists',
  plugins: 'no runtime plugin loading; operators and ignorers are data',
  appendPlugins: 'no runtime plugin loading',
  packageManager: 'oxmutate never installs anything',
  testRunner: 'Vitest is the runner (others are on the roadmap, M4)',
  coverageAnalysis: 'always perTest',
  checkers: 'type checking is M2 work (tsgo), not yet wired',
  maxTestRunnerReuse: 'workers are replaced on pollution and runaways, automatically',
  dashboard: 'the Stryker Dashboard reporter is M4 work',
  clearTextReporter: 'the summary is always printed',
  eventReporter: 'not implemented',
  logLevel: 'not implemented',
  fileLogLevel: 'not implemented',
  allowConsoleColors: 'colour follows the terminal (roundel policy)',
  disableTypeChecks: 'type checking is M2 work',
  tsconfigFile: 'type checking is M2 work',
  ignorers: "use Stryker's disable comments instead; ignorer plugins are not loaded",
  mutator: 'only mutator.excludedMutations is read',
  disableBail: 'oxmutate always stops at the first killing test',
  testFiles: 'test files come from the Vitest config',
  ignorePatterns: 'oxmutate never copies the project, so there is nothing to ignore',
  commandRunner: 'not implemented',
  force: 'use --no-incremental',
  checkerNodeArgs: 'not implemented',
};

/**
 * Defaults where the config sets nothing. Stryker's, except the per-mutant slack: Stryker's
 * `timeoutMS` is 5000, and a warm run needs far less (cli.ts `--mutant-timeout`).
 */
const MAX_DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 500;
const DEFAULT_TIMEOUT_FACTOR = 1.5;
const DEFAULT_THRESHOLD_HIGH = 80;
const DEFAULT_THRESHOLD_LOW = 60;
const DEFAULT_DRY_RUN_MINUTES = 5;

const USED = new Set(['mutate', 'vitest', 'concurrency', 'timeoutMS', 'timeoutFactor', 'thresholds', 'ignoreStatic', 'reporters', 'jsonReporter', 'htmlReporter', 'incremental', 'incrementalFile', '$schema', 'mutator', 'dryRunOnly', 'dryRunTimeoutMinutes', 'buildCommand', 'testRunnerNodeArgs', 'allowEmpty', 'warnings']);

async function loadFile(file: string): Promise<Record<string, unknown>> {
  if (file.endsWith('.json')) return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
  const value = mod.default ?? mod;
  return (typeof value === 'function' ? await (value as () => unknown)() : value) as Record<string, unknown>;
}

function find(root: string, base: string): string | undefined {
  for (const ext of ['.mjs', '.js', '.cjs', '.json', '.mts', '.ts']) {
    const f = path.join(root, `${base}.config${ext}`);
    if (existsSync(f)) return f;
  }
  return undefined;
}

export async function loadOptions(root: string, overrides: Partial<Options> = {}, configFile?: string): Promise<Options> {
  const strykerFile = find(root, 'stryker');
  const oxFile = configFile ? path.resolve(root, configFile) : find(root, 'oxmutate');
  const stryker = strykerFile ? await loadFile(strykerFile) : {};
  const ox = oxFile ? await loadFile(oxFile) : {};
  const raw = { ...stryker, ...ox } as Record<string, unknown>;

  const unused: Options['unused'] = [];
  for (const key of Object.keys(stryker)) {
    if (USED.has(key)) continue;
    unused.push({ key, why: NOT_NEEDED[key] ?? 'not a Stryker 10.0.0 option oxmutate knows' });
  }

  const thresholds = (raw['thresholds'] ?? {}) as Partial<Thresholds>;
  const vitest = (raw['vitest'] ?? {}) as { configFile?: string };
  const json = (raw['jsonReporter'] ?? {}) as { fileName?: string };
  const html = (raw['htmlReporter'] ?? {}) as { fileName?: string };
  const mutator = (raw['mutator'] ?? {}) as { excludedMutations?: string[] };
  const mutate = (raw['mutate'] as string[] | undefined) ?? ['src/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}', '!src/**/*.{test,spec}.*', '!src/**/*.d.ts'];

  return {
    root,
    mutate,
    vitestConfig: vitest.configFile ? path.resolve(root, vitest.configFile) : undefined,
    concurrency: Number(raw['concurrency'] ?? Math.max(1, Math.min(MAX_DEFAULT_CONCURRENCY, availableParallelism() - 1))),
    timeoutMS: Number(raw['timeoutMS'] ?? DEFAULT_TIMEOUT_MS),
    timeoutFactor: Number(raw['timeoutFactor'] ?? DEFAULT_TIMEOUT_FACTOR),
    thresholds: { high: thresholds.high ?? DEFAULT_THRESHOLD_HIGH, low: thresholds.low ?? DEFAULT_THRESHOLD_LOW, break: thresholds.break ?? null },
    excludedMutations: mutator.excludedMutations ?? [],
    ignoreStatic: raw['ignoreStatic'] === true,
    strykerCompat: raw['strykerCompat'] === true,
    reporters: (raw['reporters'] as string[] | undefined) ?? ['clear-text', 'json'],
    jsonReport: path.resolve(root, json.fileName ?? 'reports/mutation/mutation.json'),
    sarifReport: path.resolve(root, (raw['sarifReport'] as string | undefined) ?? 'reports/mutation/mutation.sarif'),
    htmlReport: path.resolve(root, html.fileName ?? 'reports/mutation/mutation.html'),
    incremental: raw['incremental'] === true,
    incrementalFile: path.resolve(root, (raw['incrementalFile'] as string | undefined) ?? 'reports/oxmutate-incremental.json'),
    flakyReruns: Number(raw['flakyReruns'] ?? 2),
    unused,
    configFile: oxFile ?? strykerFile,
    dryRunOnly: raw['dryRunOnly'] === true,
    dryRunTimeoutMinutes: Number(raw['dryRunTimeoutMinutes'] ?? DEFAULT_DRY_RUN_MINUTES),
    buildCommand: typeof raw['buildCommand'] === 'string' ? raw['buildCommand'] : undefined,
    testRunnerNodeArgs: (raw['testRunnerNodeArgs'] as string[] | undefined) ?? [],
    allowEmpty: raw['allowEmpty'] === true,
    warnUnused: raw['warnings'] !== false && (raw['warnings'] as { unknownOptions?: boolean } | undefined)?.unknownOptions !== false,
    ...overrides,
  };
}

/** Stryker's `disable next-line` directive, `Mutator[,Mutator]: <reason>` after it (also spelled `oxmutate disable`). */
export interface Disable {
  line: number;
  mutators: string[] | 'all';
  reason: string;
}

const DIRECTIVE = /\/\/\s*(?:Stryker|oxmutate)\s+disable\s+next-line\s+([\w,\s]+?|all)\s*:\s*(.*)$/i;
const NO_REASON = /\/\/\s*(?:Stryker|oxmutate)\s+disable\s+next-line\s+([\w,\s]+?|all)\s*$/i;

/** Disable directives in a file. A directive without a reason is an error (burgee's own rule). */
export function disables(source: string, file: string): { disables: Disable[]; errors: string[] } {
  const out: Disable[] = [];
  const errors: string[] = [];
  source.split('\n').forEach((line, i) => {
    const m = DIRECTIVE.exec(line);
    if (m) {
      const list = (m[1] ?? '').trim();
      out.push({ line: i + 2, mutators: list.toLowerCase() === 'all' ? 'all' : list.split(',').map((s) => s.trim()).filter(Boolean), reason: (m[2] ?? '').trim() });
    } else if (NO_REASON.test(line)) {
      errors.push(`${file}:${String(i + 1)}: disable comment without a reason. fix: add ": <why this mutant cannot be killed>"`);
    }
  });
  return { disables: out, errors };
}
