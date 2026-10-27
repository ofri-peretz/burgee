/**
 * The three readers of a run: Stryker's JSON report (dashboards, the HTML elements, burgee's
 * ratchet), SARIF 2.1.0 (code scanning annotates the pull request), and a terminal summary that
 * ends with what to do next.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { MutantResult, RunResult } from './coordinator.js';

export const VERSION = '0.1.0';

/** `mutation-testing-report-schema` 2, the format Stryker writes (`jsonReporter`). */
export function strykerReport(r: RunResult): object {
  const files: Record<string, { language: string; source: string; mutants: object[] }> = {};
  for (const [file, source] of Object.entries(r.sources)) {
    const mutants = r.mutants.filter((m) => m.file === file);
    if (!mutants.length) continue;
    files[file] = {
      language: /\.(ts|tsx|mts|cts)$/.test(file) ? 'typescript' : 'javascript',
      source,
      mutants: mutants.map((m) => ({
        id: m.id,
        mutatorName: m.mutatorName,
        replacement: m.replacement,
        location: { start: m.start, end: m.end },
        status: m.status,
        statusReason: m.statusReason,
        coveredBy: m.coveredBy,
        killedBy: m.killedBy,
        testsCompleted: m.testsCompleted,
        static: m.static ?? false,
      })),
    };
  }
  const testFiles: Record<string, { tests: { id: string; name: string }[] }> = {};
  for (const t of r.tests) (testFiles[path.relative(r.root, t.file)] ??= { tests: [] }).tests.push({ id: t.id, name: t.name });
  return {
    schemaVersion: '2',
    thresholds: { high: r.options.thresholds.high, low: r.options.thresholds.low },
    projectRoot: r.root,
    files,
    testFiles,
    framework: { name: 'oxmutate', version: VERSION, branding: { homepageUrl: 'https://www.npmjs.com/package/oxmutate' } },
    'x-oxmutate': { stats: r.stats, score: r.score, unusedConfig: r.options.unused },
  };
}

/** SARIF 2.1.0: one result per surviving or uncovered mutant, fingerprinted by stable id. */
export function sarifReport(r: RunResult): object {
  const reported = r.mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');
  const rules = [...new Set(reported.map((m) => m.mutatorName))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'oxmutate',
            version: VERSION,
            informationUri: 'https://www.npmjs.com/package/oxmutate',
            rules: rules.map((id) => ({
              id,
              name: id,
              shortDescription: { text: `${id} mutant no test detected` },
              helpUri: 'https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/',
              defaultConfiguration: { level: 'warning' },
            })),
          },
        },
        results: reported.map((m) => ({
          ruleId: m.mutatorName,
          ruleIndex: rules.indexOf(m.mutatorName),
          level: m.status === 'Survived' ? 'warning' : 'note',
          message: { text: describe(m) },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: m.file },
                region: { startLine: m.start.line, startColumn: m.start.column, endLine: m.end.line, endColumn: m.end.column },
              },
            },
          ],
          partialFingerprints: { mutationId: m.id },
          properties: { status: m.status, replacement: m.replacement, coveredBy: m.coveredBy.length },
        })),
      },
    ],
  };
}

export function describe(m: MutantResult): string {
  const change = m.replacement.length > 60 ? `${m.replacement.slice(0, 57)}...` : m.replacement;
  if (m.status === 'NoCoverage') return `No test reaches this code: changing it to \`${change}\` (${m.mutatorName}) would go unnoticed. fix: add a test that executes ${m.file}:${String(m.start.line)}.`;
  return `${String(m.coveredBy.length)} test(s) run this code, and all still pass when it becomes \`${change}\` (${m.mutatorName}). fix: assert the behaviour this line decides.`;
}

/** The terminal summary: the score, what to look at first, what the run corrected. */
export function textSummary(r: RunResult, opts: { survivors?: number } = {}): string {
  const count = (s: string): number => r.mutants.filter((m) => m.status === s).length;
  const s = r.stats;
  const lines = [
    `oxmutate ${VERSION}: ${String(r.mutants.length)} mutants in ${String(s.files)} files, ${(s.wallMs / 1000).toFixed(1)} s`,
    `  mutation score ${r.score.mutationScore.toFixed(2)}% (covered ${r.score.covered.toFixed(2)}%)`,
    `  killed ${String(count('Killed'))} · timeout ${String(count('Timeout'))} · survived ${String(count('Survived'))} · no coverage ${String(count('NoCoverage'))} · ignored ${String(count('Ignored'))} · errors ${String(count('RuntimeError') + count('CompileError'))}`,
    `  instrument ${s.instrumentMs.toFixed(0)} ms · dry run ${(s.dryRunMs / 1000).toFixed(1)} s · mutants ${(s.mutationMs / 1000).toFixed(1)} s · isolated ${(s.isolatedMs / 1000).toFixed(1)} s`,
  ];
  const corrections = [
    s.watchdogKills && `${String(s.watchdogKills)} runaway(s) stopped`,
    s.pollutionRestarts && `${String(s.pollutionRestarts)} polluted context(s) restarted (in ${String(s.canaryFiles)} file(s))`,
    s.flakyMutants && `${String(s.flakyMutants)} flaky verdict(s)`,
    s.survivorsOverturned && `${String(s.survivorsOverturned)} survivor(s) killed by a whole-file re-run`,
    s.timeoutsOverturned && `${String(s.timeoutsOverturned)} timeout(s) that finished given 3x the time`,
    s.reused && `${String(s.reused)} verdict(s) reused`,
    s.crashes && `${String(s.crashes)} worker crash(es)`,
  ].filter(Boolean);
  if (corrections.length) lines.push(`  corrected: ${corrections.join(' · ')}`);
  const survivors = r.mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');
  const limit = opts.survivors ?? 10;
  if (survivors.length) {
    lines.push('', `Survivors (${String(survivors.length)}${survivors.length > limit ? `, first ${String(limit)}` : ''}):`);
    for (const m of survivors.slice(0, limit)) lines.push(`  ${m.file}:${String(m.start.line)}:${String(m.start.column)}  ${m.mutatorName}  → ${m.replacement.replace(/\s+/g, ' ').slice(0, 60)}${m.flaky ? '  (flaky)' : ''}`);
    lines.push('', 'fix: run `oxmutate survivors --json` to hand the list to an agent, or kill the first one above with a test.');
  }
  if (r.options.unused.length) lines.push('', `Config keys not used: ${r.options.unused.map((u) => u.key).join(', ')} (see the JSON report for why)`);
  return `${lines.join('\n')}\n`;
}

export function writeReports(r: RunResult): string[] {
  const written: string[] = [];
  const write = (file: string, body: object | string): void => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    written.push(file);
  };
  if (r.options.reporters.includes('json')) write(r.options.jsonReport, strykerReport(r));
  if (r.options.reporters.includes('sarif')) write(r.options.sarifReport, sarifReport(r));
  return written;
}
