/**
 * The three readers of a run: Stryker's JSON report (dashboards, the HTML elements, burgee's
 * ratchet), SARIF 2.1.0 (code scanning annotates the pull request), and a terminal summary that
 * ends with what to do next.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { MutantResult, RunResult } from './coordinator.js';

/** The package's own version, read from its manifest so `--version` and the reports never drift from it. */
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** A replacement longer than this is cut, in the SARIF message and in the terminal list. */
const REPLACEMENT_WIDTH = 60;
const ELLIPSIS = '...';
const MS_PER_S = 1000;
/** Survivors the terminal summary lists before it says how many it left out. */
const DEFAULT_SURVIVORS_SHOWN = 10;

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
  const testFiles = new Map<string, { tests: { id: string; name: string }[] }>();
  for (const t of r.tests) {
    // Forward slashes on every OS, as Stryker's report keys its files.
    const file = path.relative(r.root, t.file).split(path.sep).join('/');
    // Stryker disable next-line OptionalChaining: the get after a set always finds the entry; `?.` is only for the type
    (testFiles.get(file) ?? testFiles.set(file, { tests: [] }).get(file))?.tests.push({ id: t.id, name: t.name });
  }
  return {
    schemaVersion: '2',
    thresholds: { high: r.options.thresholds.high, low: r.options.thresholds.low },
    projectRoot: r.root,
    files,
    testFiles: Object.fromEntries(testFiles),
    framework: { name: 'oxmutate', version: VERSION, branding: { homepageUrl: 'https://www.npmjs.com/package/oxmutate' } },
    'x-oxmutate': { stats: r.stats, score: r.score, unusedConfig: r.options.unused, frozenOracle: r.frozen, specOracles: r.spec },
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
  const change = m.replacement.length > REPLACEMENT_WIDTH ? `${m.replacement.slice(0, REPLACEMENT_WIDTH - ELLIPSIS.length)}${ELLIPSIS}` : m.replacement;
  if (m.status === 'NoCoverage') return `No test reaches this code: changing it to \`${change}\` (${m.mutatorName}) would go unnoticed. fix: add a test that executes ${m.file}:${String(m.start.line)}.`;
  return `${String(m.coveredBy.length)} test(s) run this code, and all still pass when it becomes \`${change}\` (${m.mutatorName}). fix: assert the behaviour this line decides.`;
}

/** What the run had to correct, one phrase per kind of correction that happened. */
function corrections(s: RunResult['stats']): string[] {
  return [
    s.watchdogKills && `${String(s.watchdogKills)} runaway(s) stopped`,
    s.pollutionRestarts && `${String(s.pollutionRestarts)} polluted context(s) restarted (in ${String(s.canaryFiles)} file(s))`,
    s.flakyMutants && `${String(s.flakyMutants)} flaky verdict(s)`,
    s.survivorsOverturned && `${String(s.survivorsOverturned)} survivor(s) killed by a whole-file re-run`,
    s.timeoutsOverturned && `${String(s.timeoutsOverturned)} timeout(s) that finished given 3x the time`,
    s.compileErrors && `${String(s.compileErrors)} survivor(s) that do not type-check, out of the score`,
    s.reused && `${String(s.reused)} verdict(s) reused`,
    s.crashes && `${String(s.crashes)} worker crash(es)`,
  ].filter((c): c is string => Boolean(c));
}

/** One line per spec oracle: its F metrics (metrics.md §6). */
function specLines(r: RunResult): string[] {
  return (r.spec ?? []).map(
    (o) => `  spec ${o.name} (${o.backend}, ${String(o.traces)} traces): kills ${o.specKillShare.toFixed(1)}% of ${String(o.modelled)} modelled mutants, reaches ${o.mappingCoverage.toFixed(1)}%; ${String(o.testSpecGap.length)} test-spec gap(s), ${String(o.specEscapes.length)} escape(s)`,
  );
}

/** The frozen oracle's line, when the change edited tests. */
function frozenLine(r: RunResult): string[] {
  const f = r.frozen;
  if (!f?.changedTests.length) return [];
  const sign = f.delta >= 0 ? '+' : '';
  return [`  frozen oracle vs ${f.base}: ${f.headScore.toFixed(2)}% with the change's tests, ${f.baseScore.toFixed(2)}% with the base's (${sign}${f.delta.toFixed(2)}), ${String(f.weakened.length)} mutant(s) the change stopped detecting`];
}

/** The terminal summary: the score, what to look at first, what the run corrected. */
export function textSummary(r: RunResult, opts: { survivors?: number } = {}): string {
  const count = (s: string): number => r.mutants.filter((m) => m.status === s).length;
  const s = r.stats;
  if (r.dryRunOnly) {
    const covered = r.mutants.filter((m) => m.static || m.coveredBy.length > 0).length;
    return `oxmutate ${VERSION}: dry run only, ${(s.wallMs / MS_PER_S).toFixed(1)} s\n  ${String(r.tests.length)} tests passed with every mutant compiled in and none active; ${String(covered)} of ${String(r.mutants.length)} mutants are reached by a test\n`;
  }
  const lines = [
    `oxmutate ${VERSION}: ${String(r.mutants.length)} mutants in ${String(s.files)} files, ${(s.wallMs / MS_PER_S).toFixed(1)} s`,
    `  mutation score ${r.score.mutationScore.toFixed(2)}% (covered ${r.score.covered.toFixed(2)}%)`,
    `  killed ${String(count('Killed'))} · timeout ${String(count('Timeout'))} · survived ${String(count('Survived'))} · no coverage ${String(count('NoCoverage'))} · ignored ${String(count('Ignored'))} · errors ${String(count('RuntimeError') + count('CompileError'))}`,
    `  instrument ${s.instrumentMs.toFixed(0)} ms · dry run ${(s.dryRunMs / MS_PER_S).toFixed(1)} s · mutants ${(s.mutationMs / MS_PER_S).toFixed(1)} s · isolated ${(s.isolatedMs / MS_PER_S).toFixed(1)} s`,
  ];
  const corrected = corrections(s);
  if (corrected.length) lines.push(`  corrected: ${corrected.join(' · ')}`);
  lines.push(...frozenLine(r));
  lines.push(...specLines(r));
  const survivors = r.mutants.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');
  const limit = opts.survivors ?? DEFAULT_SURVIVORS_SHOWN;
  if (survivors.length) {
    lines.push('', `Survivors (${String(survivors.length)}${survivors.length > limit ? `, first ${String(limit)}` : ''}):`);
    for (const m of survivors.slice(0, limit)) lines.push(`  ${m.file}:${String(m.start.line)}:${String(m.start.column)}  ${m.mutatorName}  → ${m.replacement.replace(/\s+/g, ' ').slice(0, REPLACEMENT_WIDTH)}${m.flaky ? '  (flaky)' : ''}`);
    lines.push('', 'fix: run `oxmutate survivors --json` to hand the list to an agent, or kill the first one above with a test.');
  }
  if (r.options.unused.length && r.options.warnUnused) lines.push('', `Config keys not used: ${r.options.unused.map((u) => u.key).join(', ')} (see the JSON report for why)`);
  return `${lines.join('\n')}\n`;
}

/** The web component Stryker's HTML report renders with, at the version Stryker 10.0.0 ships. */
const ELEMENTS = 'mutation-testing-elements/dist/mutation-test-elements.js';
const ELEMENTS_CDN = 'https://cdn.jsdelivr.net/npm/mutation-testing-elements@3.8.4/dist/mutation-test-elements.js';
/** sha384 of that file, the same bytes as the npm tarball's (both measured 2026-10-27). */
const ELEMENTS_SRI = 'sha384-xebNisAYQHHbrYIm991U9KOZ96oO+vRACR8kd+zHzWkU3pcRuigrsI7XS2tj3rqq';

/**
 * Stryker's HTML report: the JSON report rendered by `mutation-testing-elements`. The component is
 * inlined from the project's own install when it has one (Stryker brings it), so the page works
 * offline as Stryker's does; otherwise the page loads that exact version from a CDN. oxmutate does
 * not depend on it.
 */
export function htmlReport(r: RunResult): string {
  let script: string;
  try {
    const elements = createRequire(path.join(r.root, 'package.json')).resolve(ELEMENTS);
    // Stryker disable next-line StringLiteral: without an encoding readFileSync returns a Buffer, which the template turns into the same UTF-8 text
    const component = readFileSync(elements, 'utf8');
    script = `<script>${component}</script>`;
  } catch {
    script = `<script src="${ELEMENTS_CDN}" integrity="${ELEMENTS_SRI}" crossorigin="anonymous"></script>`;
  }
  // `<` as \u003c: still the same JSON, and no `</script>` inside a source file can end the tag.
  const report = JSON.stringify(strykerReport(r)).replaceAll('<', '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>oxmutate report</title>
  ${script}
</head>
<body>
  <mutation-test-report-app titlePostfix="oxmutate">Your browser does not support custom elements.</mutation-test-report-app>
  <script>
    const app = document.querySelector('mutation-test-report-app');
    app.report = ${report};
    const theme = () => { document.body.style.backgroundColor = app.themeBackgroundColor; };
    app.addEventListener('theme-changed', theme);
    theme();
  </script>
</body>
</html>
`;
}

export function writeReports(r: RunResult): string[] {
  if (r.dryRunOnly) return [];
  const written: string[] = [];
  const write = (file: string, body: object | string): void => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    written.push(file);
  };
  if (r.options.reporters.includes('json')) write(r.options.jsonReport, strykerReport(r));
  if (r.options.reporters.includes('sarif')) write(r.options.sarifReport, sarifReport(r));
  if (r.options.reporters.includes('html')) write(r.options.htmlReport, htmlReport(r));
  return written;
}
