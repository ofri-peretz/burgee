/**
 * oxmutate's command line, declared once on burgee: help, `--json`, `--schema`, `--format=agent`,
 * completions and the MCP server are projected from this declaration (spec R17). Handlers return
 * data; the text a person reads rides along under burgee's text symbol, so the agent surfaces
 * carry exactly the data.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineCommand, defineProgram, ExitCode } from 'burgee';

import { DEFAULT_IDLE_TIMEOUT_MS, loadOptions, type Options } from './config.js';
import { containerDefaults, INSIDE, pruneContainers, runInContainer, withFlags } from './container.js';
import { InstrumentFault, run, type MutantResult, type RunResult } from './coordinator.js';
import { frozenOracle } from './frozen.js';
import { parseShard } from './lanes.js';
import { describe, textSummary, VERSION, writeReports } from './reports.js';
import { argv, cwd, env, stderr } from './runtime.js';

const TEXT = Symbol.for('burgee.text');


function survivorRecord(m: MutantResult): object {
  return {
    id: m.id,
    file: m.file,
    line: m.start.line,
    column: m.start.column,
    mutator: m.mutatorName,
    replacement: m.replacement,
    status: m.status,
    coveredBy: m.coveredBy.length,
    flaky: m.flaky ?? false,
    fix: describe(m),
  };
}

function summaryData(r: RunResult, written: string[]): Record<string | symbol, unknown> {
  const count = (s: string): number => r.mutants.filter((m) => m.status === s).length;
  const data: Record<string | symbol, unknown> = {
    // burgee N7: an idempotent command says whether it changed anything (reports were written).
    changed: written.length > 0,
    version: VERSION,
    score: Number(r.score.mutationScore.toFixed(2)),
    coveredScore: Number(r.score.covered.toFixed(2)),
    mutants: r.mutants.length,
    killed: count('Killed'),
    timeout: count('Timeout'),
    survived: count('Survived'),
    noCoverage: count('NoCoverage'),
    ignored: count('Ignored'),
    errors: count('RuntimeError') + count('CompileError'),
    stats: r.stats,
    reports: written.map((w) => path.relative(r.root, w)),
    survivors: r.mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage').map(survivorRecord),
  };
  data[TEXT] = () => textSummary(r);
  return data;
}

/** The `run` flags that override a config key, as the `Partial<Options>` loadOptions applies last. */
/** How many weakened mutants the error line names; the JSON report has them all. */
const WEAKENED_SHOWN = 3;

/** The static phase's flags: `--static-group`, `--static-budget`, `--report-static-readers`, `--static-readers`, `--no-static-readers`. */
function staticOverridesFrom(o: Record<string, unknown>): Partial<Options> {
  const overrides: Partial<Options> = {};
  if (typeof o['staticGroup'] === 'number') overrides.staticGroup = Math.max(1, Math.floor(o['staticGroup']));
  if (typeof o['staticBudget'] === 'number' && o['staticBudget'] >= 1) overrides.staticBudgetMs = Math.floor(o['staticBudget']);
  if (o['reportStaticReaders'] === true) overrides.staticReaders = 'report';
  if (o['staticReaders'] === true) overrides.staticReaders = 'on';
  // The parser reads `--no-static-readers` as `staticReaders: false`.
  if (o['staticReaders'] === false || o['noStaticReaders'] === true) overrides.staticReaders = 'off';
  return overrides;
}

/** `--cold-workers`, `--worker-idle-timeout <ms>`, `--max-load <n>`, `--priority <low|normal>`: how Vitest servers live and when they start (`resources`). */
function workerOverridesFrom(o: Record<string, unknown>): Partial<Options> {
  const warm = o['coldWorkers'] !== true;
  const idle = typeof o['workerIdleTimeout'] === 'number' && o['workerIdleTimeout'] >= 0 ? Math.floor(o['workerIdleTimeout']) : undefined;
  const governor: Partial<Options> = {
    ...(typeof o['maxLoad'] === 'number' && o['maxLoad'] > 0 && { maxLoad: o['maxLoad'] }),
    ...(o['priority'] === 'normal' && { lowPriority: false }),
    ...(o['priority'] === 'low' && { lowPriority: true }),
  };
  if (warm && idle === undefined) return governor;
  return { ...governor, workers: { warm, idleTimeoutMs: idle ?? DEFAULT_IDLE_TIMEOUT_MS } };
}

function overridesFrom(o: Record<string, unknown>, root: string): Partial<Options> {
  const overrides: Partial<Options> = { ...staticOverridesFrom(o), ...workerOverridesFrom(o) };
  if (typeof o['since'] === 'string') overrides.since = o['since'];
  if (typeof o['frozenOracle'] === 'string') overrides.frozenOracle = o['frozenOracle'];
  if (typeof o['shard'] === 'string') overrides.shard = parseShard(o['shard']);
  if (typeof o['concurrency'] === 'number') overrides.concurrency = o['concurrency'];
  if (typeof o['mutantTimeout'] === 'number') overrides.timeoutMS = o['mutantTimeout'];
  if (o['strykerCompat'] === true) overrides.strykerCompat = true;
  if (o['ignoreStatic'] === true) overrides.ignoreStatic = true;
  if (o['incremental'] === true) overrides.incremental = true;
  if (typeof o['flakyReruns'] === 'number') overrides.flakyReruns = o['flakyReruns'];
  if (typeof o['reporter'] === 'string') overrides.reporters = o['reporter'].split(',').map((s) => s.trim());
  if (typeof o['reportDir'] === 'string') {
    overrides.jsonReport = path.resolve(root, o['reportDir'], 'mutation.json');
    overrides.sarifReport = path.resolve(root, o['reportDir'], 'mutation.sarif');
    overrides.htmlReport = path.resolve(root, o['reportDir'], 'mutation.html');
  }
  return overrides;
}

/**
 * With `container` set (and not already inside one), the run happens there, and this exits with
 * its code, or CONFIG when it could not start. Otherwise it returns, and the run happens here.
 */
async function inContainer(options: Options, o: Record<string, unknown>, root: string, exit: (code: number) => void): Promise<void> {
  const container = env[INSIDE] === 'inside' ? undefined : withFlags(options.container, o);
  if (!container) return;
  const reports: [string, string][] = [['json', options.jsonReport], ['sarif', options.sarifReport], ['html', options.htmlReport]];
  const keep = [...(options.incremental ? [options.incrementalFile] : []), ...reports.filter(([r]) => options.reporters.includes(r)).map(([, f]) => f)];
  let code: number;
  try {
    code = await runInContainer(container, { root, keep, since: options.since, frozenOracle: options.frozenOracle }, argv.slice(2));
  } catch (e) {
    stderr.write(`oxmutate: ${(e as Error).message}\n`);
    code = ExitCode.CONFIG;
  }
  exit(code);
}

const runCommand = defineCommand({
  name: 'run',
  description: 'Mutation-test the project in the current directory',
  effects: 'idempotent',
  examples: [
    { command: 'oxmutate run', description: 'every mutant, with the Stryker config if there is one' },
    { command: 'oxmutate run --since origin/main --reporter sarif', description: 'the PR lane: only lines the change touched, annotated in code scanning' },
    { command: 'oxmutate run --shard 2/8 --json', description: 'one cell of a CI matrix, as the --json envelope' },
  ],
  options: {
    since: { type: 'string', description: 'only mutants on lines changed since this git ref (the PR lane)' },
    frozenOracle: { type: 'string', description: "also score against this ref's tests; exit 1 if the change weakened them" },
    shard: { type: 'string', description: 'run one deterministic share, i/n, for a CI matrix' },
    concurrency: { type: 'number', description: 'worker processes (default: cores - 1, at most 8; inside a container, cores - 1)' },
    mutantTimeout: { type: 'number', description: 'absolute slack per mutant, ms (default 500; Stryker 5000)' },
    strykerCompat: { type: 'boolean', description: 'reproduce Stryker 10.0.0 skips (no mutants inside `as` casts or enums)' },
    ignoreStatic: { type: 'boolean', description: 'skip static mutants (module-level code): faster, and the score leaves them out' },
    staticGroup: { type: 'number', description: 'arm this many static mutants together in a file that is not their first (default 1; a heuristic, audited)' },
    staticBudget: { type: 'number', description: 'the most the static phase may take, ms; static mutants still undecided then are left out of the score' },
    maxLoad: { type: 'number', description: 'start no unit while the load average, less oxmutate\'s own servers, is past this (resources.maxLoad; default 1.5 x cores)' },
    priority: { type: 'string', description: "'low' (the default) starts servers at a lowered OS priority; 'normal' does not (resources.priority)" },
    coldWorkers: { type: 'boolean', description: 'a fresh Vitest server per unit, closed after it: slower, the least memory held' },
    workerIdleTimeout: { type: 'number', description: 'close a server idle this long, ms (default 30000; 0 keeps them all until the run ends)' },
    staticReaders: { type: 'boolean', description: 'run each static mutant only in the test files that read its value (the default; a heuristic, audited)' },
    noStaticReaders: { type: 'boolean', description: 'run each static mutant in every test file that loads its module (static.readers: off)' },
    reportStaticReaders: { type: 'boolean', description: 'one more dry run that reports how many tests static mutants would need if each ran only where its value is read; changes no verdict' },
    incremental: { type: 'boolean', description: 'reuse verdicts whose source and covering tests did not change' },
    flakyReruns: { type: 'number', description: 're-runs for verdicts with nondeterministic tests (default 2; 0 disables)' },
    reporter: { type: 'string', description: 'comma-separated: clear-text, json, sarif, html (default clear-text,json)' },
    break: { type: 'number', description: 'exit 1 when the mutation score is below this' },
    reportDir: { type: 'string', description: 'write mutation.json, mutation.sarif and mutation.html here instead of the configured paths' },
    config: { type: 'string', description: 'an oxmutate config file (JSON or JS) instead of oxmutate.config.*' },
    container: { type: 'boolean', description: 'run inside a container oxmutate starts, on a copy of the repository (container.*; --no-container turns a configured one off)' },
    containerImage: { type: 'string', description: 'the image for --container (default node:<this Node major>-bookworm-slim); implies --container' },
  },
  run: async ({ options, exit }) => {
    const root = cwd();
    const o = options as Record<string, unknown>;
    const options_ = await loadOptions(root, overridesFrom(o, root), typeof o['config'] === 'string' ? o['config'] : undefined);
    if (typeof o['break'] === 'number') options_.thresholds.break = o['break'];
    await inContainer(options_, o, root, exit);
    let result: RunResult;
    try {
      result = await run(options_);
      if (options_.frozenOracle) result.frozen = await frozenOracle(result, options_.frozenOracle);
    } catch (e) {
      if (e instanceof InstrumentFault) {
        stderr.write(`oxmutate: ${e.message}\n`);
        exit(ExitCode.CONFIG);
      }
      throw e;
    }
    const written = writeReports(result);
    const data = summaryData(result, written);
    const weakened = result.frozen?.weakened ?? [];
    if (weakened.length) {
      stderr.write(`oxmutate: the change weakened its tests: ${String(weakened.length)} mutant(s) the tests at ${result.frozen?.base ?? ''} detect now survive (${weakened.slice(0, WEAKENED_SHOWN).map((w) => `${w.file}:${String(w.line)} ${w.mutatorName}`).join('; ')}). fix: restore the assertions the change removed, or replace them with ones that kill these mutants\n`);
      data['exitCode'] = ExitCode.RUNTIME;
    }
    if ((result.stats.staticReaders?.auditDisagreed ?? 0) > 0) {
      stderr.write(`oxmutate: ${String(result.stats.staticReaders?.auditDisagreed ?? 0)} static mutant(s) that survived the files reading their value were killed in a file that loads it; they are reported Killed. fix: run with --no-static-readers; a test reads the value through a path the tracking does not see\n`);
      data['exitCode'] = ExitCode.RUNTIME;
    }
    if (result.stats.staticAuditDisagreed > 0) {
      stderr.write(`oxmutate: ${String(result.stats.staticAuditDisagreed)} mutant(s) reported as survivors by a group were killed when run alone; they are reported Killed. fix: run without static.group (--static-group 1); two of this file's mutants hide each other when armed together\n`);
      data['exitCode'] = ExitCode.RUNTIME;
    }
    const floor = options_.thresholds.break;
    if (floor !== null && result.score.mutationScore < floor) {
      stderr.write(`oxmutate: mutation score ${result.score.mutationScore.toFixed(2)}% is below the break threshold ${String(floor)}%. fix: kill the survivors listed above, or lower thresholds.break deliberately\n`);
      data['exitCode'] = ExitCode.RUNTIME;
    }
    return data;
  },
});

const pruneCommand = defineCommand({
  name: 'prune',
  description: "Remove every container and volume container mode made, and the host's records of what it synced",
  effects: 'idempotent',
  examples: [{ command: 'oxmutate prune', description: 'start the next container run from nothing: it installs again' }],
  options: { config: { type: 'string', description: 'an oxmutate config file whose container.engine, context and host to use' } },
  run: async ({ options }) => {
    const o = options as Record<string, unknown>;
    const root = cwd();
    const c = (await loadOptions(root, {}, typeof o['config'] === 'string' ? o['config'] : undefined)).container ?? containerDefaults();
    const { containers, volumes } = await pruneContainers(c);
    const data: Record<string | symbol, unknown> = { changed: containers.length + volumes.length > 0, containers, volumes };
    data[TEXT] = () => `removed ${String(volumes.length)} volume(s) and ${String(containers.length)} container(s)${volumes.length ? `: ${volumes.join(', ')}` : ''}`;
    return data;
  },
});

const survivorsCommand = defineCommand({
  name: 'survivors',
  description: 'List the survivors of the last run, one record per mutant, each with a fix line',
  effects: 'read_only',
  examples: [{ command: 'oxmutate survivors --json', description: 'the list an agent writes killing tests from' }],
  options: { report: { type: 'string', description: 'the JSON report to read (default reports/mutation/mutation.json)' } },
  run: async ({ options }) => {
    const file = path.resolve(String((options as Record<string, unknown>)['report'] ?? 'reports/mutation/mutation.json'));
    if (!existsSync(file)) throw new Error(`no report at ${file}. fix: run \`oxmutate run\` first`);
    const report = JSON.parse(readFileSync(file, 'utf8')) as { files: Record<string, { mutants: (MutantResult & { location: { start: MutantResult['start']; end: MutantResult['end'] } })[] }> };
    const out = Object.entries(report.files).flatMap(([f, x]) =>
      x.mutants
        .filter((m) => m.status === 'Survived' || m.status === 'NoCoverage')
        .map((m) => survivorRecord({ ...m, file: f, start: m.location.start, end: m.location.end, coveredBy: m.coveredBy ?? [] })),
    );
    const data: Record<string | symbol, unknown> = { survivors: out };
    data[TEXT] = () => (out.length ? out.map((s) => `${String((s as { file: string }).file)}:${String((s as { line: number }).line)}  ${String((s as { fix: string }).fix)}`).join('\n') : 'no survivors');
    return data;
  },
});

export const program = defineProgram({
  name: 'oxmutate',
  version: VERSION,
  description: 'Mutation testing on the oxc engine: Stryker-compatible, built for CI and coding agents',
  commands: [runCommand, survivorsCommand, pruneCommand],
});
