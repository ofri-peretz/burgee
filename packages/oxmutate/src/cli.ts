/**
 * oxmutate's command line, declared once on burgee: help, `--json`, `--schema`, `--format=agent`,
 * completions and the MCP server are projected from this declaration (spec R17). Handlers return
 * data; the text a person reads rides along under burgee's text symbol, so the agent surfaces
 * carry exactly the data.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineCommand, defineProgram, ExitCode } from 'burgee';

import { loadOptions, type Options } from './config.js';
import { InstrumentFault, run, type MutantResult, type RunResult } from './coordinator.js';
import { parseShard } from './lanes.js';
import { describe, textSummary, VERSION, writeReports } from './reports.js';

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
function overridesFrom(o: Record<string, unknown>, root: string): Partial<Options> {
  const overrides: Partial<Options> = {};
  if (typeof o['since'] === 'string') overrides.since = o['since'];
  if (typeof o['shard'] === 'string') overrides.shard = parseShard(o['shard']);
  if (typeof o['concurrency'] === 'number') overrides.concurrency = o['concurrency'];
  if (typeof o['mutantTimeout'] === 'number') overrides.timeoutMS = o['mutantTimeout'];
  if (o['strykerCompat'] === true) overrides.strykerCompat = true;
  if (o['incremental'] === true) overrides.incremental = true;
  if (typeof o['flakyReruns'] === 'number') overrides.flakyReruns = o['flakyReruns'];
  if (typeof o['reporter'] === 'string') overrides.reporters = o['reporter'].split(',').map((s) => s.trim());
  if (typeof o['reportDir'] === 'string') {
    overrides.jsonReport = path.resolve(root, o['reportDir'], 'mutation.json');
    overrides.sarifReport = path.resolve(root, o['reportDir'], 'mutation.sarif');
  }
  return overrides;
}

const runCommand = defineCommand({
  name: 'run',
  description: 'Mutation-test the project in the current directory',
  default: true,
  effects: 'idempotent',
  examples: [
    { command: 'oxmutate run', description: 'every mutant, with the Stryker config if there is one' },
    { command: 'oxmutate run --since origin/main --reporter sarif', description: 'the PR lane: only lines the change touched, annotated in code scanning' },
    { command: 'oxmutate run --shard 2/8 --json', description: 'one cell of a CI matrix, as the --json envelope' },
  ],
  options: {
    since: { type: 'string', description: 'only mutants on lines changed since this git ref (the PR lane)' },
    shard: { type: 'string', description: 'run one deterministic share, i/n, for a CI matrix' },
    concurrency: { type: 'number', description: 'worker processes (default: cores - 1, at most 8)' },
    mutantTimeout: { type: 'number', description: 'absolute slack per mutant, ms (default 500; Stryker 5000)' },
    strykerCompat: { type: 'boolean', description: 'reproduce Stryker 10.0.0 skips (no mutants inside `as` casts or enums)' },
    incremental: { type: 'boolean', description: 'reuse verdicts whose source and covering tests did not change' },
    flakyReruns: { type: 'number', description: 're-runs for verdicts with nondeterministic tests (default 2; 0 disables)' },
    reporter: { type: 'string', description: 'comma-separated: clear-text, json, sarif (default clear-text,json)' },
    break: { type: 'number', description: 'exit 1 when the mutation score is below this' },
    reportDir: { type: 'string', description: 'write mutation.json and mutation.sarif here instead of the configured paths' },
    config: { type: 'string', description: 'an oxmutate config file (JSON or JS) instead of oxmutate.config.*' },
  },
  run: async ({ options, exit }) => {
    const root = process.cwd();
    const o = options as Record<string, unknown>;
    const options_ = await loadOptions(root, overridesFrom(o, root), typeof o['config'] === 'string' ? o['config'] : undefined);
    if (typeof o['break'] === 'number') options_.thresholds.break = o['break'];
    let result: RunResult;
    try {
      result = await run(options_);
    } catch (e) {
      if (e instanceof InstrumentFault) {
        process.stderr.write(`oxmutate: ${e.message}\n`);
        exit(ExitCode.CONFIG);
      }
      throw e;
    }
    const written = writeReports(result);
    const data = summaryData(result, written);
    const floor = options_.thresholds.break;
    if (floor !== null && result.score.mutationScore < floor) {
      process.stderr.write(`oxmutate: mutation score ${result.score.mutationScore.toFixed(2)}% is below the break threshold ${String(floor)}%. fix: kill the survivors listed above, or lower thresholds.break deliberately\n`);
      process.exitCode = ExitCode.RUNTIME;
    }
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
  commands: [runCommand, survivorsCommand],
});
