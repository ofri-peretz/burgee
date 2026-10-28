import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { loadOptions } from './config.js';
import { type MutantResult, type RunResult, type RunStats } from './coordinator.js';
import { VERSION, describe as describeMutant, htmlReport, sarifReport, strykerReport, textSummary, writeReports } from './reports.js';

const root = mkdtempSync(path.join(tmpdir(), 'oxmutate-reports-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const stats = (s: Partial<RunStats> = {}): RunStats => ({
  files: 2,
  mutants: 0,
  instrumentMs: 3.4,
  dryRunMs: 1250,
  mutationMs: 4049,
  isolatedMs: 951,
  wallMs: 6789,
  testExecutions: 0,
  watchdogKills: 0,
  crashes: 0,
  canaryFiles: 0,
  pollutionRestarts: 0,
  survivorsOverturned: 0,
  timeoutsOverturned: 0,
  compileErrors: 0,
  isolatedRuns: 0,
  reused: 0,
  flakyTests: 0,
  flakyMutants: 0,
  units: 0,
  serversSpawned: 0,
  ...s,
});

let next = 0;
const mutant = (m: Partial<MutantResult> = {}): MutantResult => ({
  id: `m${String(next++)}`,
  file: 'src/a.ts',
  mutatorName: 'StringLiteral',
  replacement: '""',
  start: { line: 1, column: 1 },
  end: { line: 1, column: 5 },
  status: 'Killed',
  coveredBy: [],
  ...m,
});

const run = async (r: Partial<RunResult> = {}): Promise<RunResult> => ({
  root,
  options: await loadOptions(root, {}),
  sources: { 'src/a.ts': 'a\n', 'src/b.js': 'b\n', 'src/untouched.ts': 'c\n' },
  mutants: [],
  tests: [],
  stats: stats(),
  score: { detected: 3, undetected: 2, total: 5, mutationScore: 60, covered: 75 },
  ...r,
});

describe('the JSON report (mutation-testing-report-schema 2)', () => {
  it('lists each file with mutants, its tests by file, and oxmutate extras', async () => {
    const killed = mutant({ id: 'k', status: 'Killed', coveredBy: ['t1'], killedBy: ['t1'], testsCompleted: 1, statusReason: 'expected 1 to be 2' });
    const survived = mutant({ id: 's', file: 'src/b.js', mutatorName: 'Regex', replacement: '/a/', start: { line: 2, column: 3 }, end: { line: 2, column: 9 }, status: 'Survived', coveredBy: ['t1', 't3'], static: true });
    const r = await run({
      mutants: [killed, survived],
      tests: [
        { id: 't1', file: path.join(root, 'src/a.test.ts'), name: 'a works', ms: 1 },
        { id: 't2', file: path.join(root, 'src/a.test.ts'), name: 'a again', ms: 1 },
        { id: 't3', file: path.join(root, 'test/b.test.js'), name: 'b', ms: 1 },
      ],
      spec: [],
    });
    expect(strykerReport(r)).toEqual({
      schemaVersion: '2',
      thresholds: { high: 80, low: 60 },
      projectRoot: root,
      files: {
        'src/a.ts': {
          language: 'typescript',
          source: 'a\n',
          mutants: [{ id: 'k', mutatorName: 'StringLiteral', replacement: '""', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } }, status: 'Killed', statusReason: 'expected 1 to be 2', coveredBy: ['t1'], killedBy: ['t1'], testsCompleted: 1, static: false }],
        },
        'src/b.js': {
          language: 'javascript',
          source: 'b\n',
          mutants: [{ id: 's', mutatorName: 'Regex', replacement: '/a/', location: { start: { line: 2, column: 3 }, end: { line: 2, column: 9 } }, status: 'Survived', statusReason: undefined, coveredBy: ['t1', 't3'], killedBy: undefined, testsCompleted: undefined, static: true }],
        },
      },
      testFiles: {
        'src/a.test.ts': { tests: [{ id: 't1', name: 'a works' }, { id: 't2', name: 'a again' }] },
        'test/b.test.js': { tests: [{ id: 't3', name: 'b' }] },
      },
      framework: { name: 'oxmutate', version: VERSION, branding: { homepageUrl: 'https://www.npmjs.com/package/oxmutate' } },
      'x-oxmutate': { stats: r.stats, score: r.score, unusedConfig: [], frozenOracle: undefined, specOracles: [] },
    });
  });

  it('marks TypeScript by extension: .ts, .tsx, .mts, .cts, and nothing else', async () => {
    const files = ['a.ts', 'a.tsx', 'a.mts', 'a.cts', 'a.js', 'a.ts.js', 'a.tsx.map'];
    const r = await run({ sources: Object.fromEntries(files.map((f) => [f, ''])), mutants: files.map((file) => mutant({ file })) });
    const { files: reported } = strykerReport(r) as { files: Record<string, { language: string }> };
    const languages = Object.fromEntries(Object.entries(reported).map(([f, x]) => [f, x.language]));
    expect(languages).toEqual({ 'a.ts': 'typescript', 'a.tsx': 'typescript', 'a.mts': 'typescript', 'a.cts': 'typescript', 'a.js': 'javascript', 'a.ts.js': 'javascript', 'a.tsx.map': 'javascript' });
  });

  it('is the package version', () => {
    expect(VERSION).toBe((JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version);
  });
});

const rule = (id: string): object => ({ id, name: id, shortDescription: { text: `${id} mutant no test detected` }, helpUri: 'https://stryker-mutator.io/docs/mutation-testing-elements/supported-mutators/', defaultConfiguration: { level: 'warning' } });
const at = (uri: string, [startLine, startColumn]: [number, number], [endLine, endColumn]: [number, number]): object[] => [{ physicalLocation: { artifactLocation: { uri }, region: { startLine, startColumn, endLine, endColumn } } }];

describe('the SARIF report', () => {
  it('has one result per surviving or uncovered mutant, rules sorted, fingerprinted by id', async () => {
    const r = await run({
      mutants: [
        mutant({ id: 'a1', status: 'Survived', mutatorName: 'StringLiteral', replacement: '"x"', coveredBy: ['t1', 't2'], start: { line: 3, column: 4 }, end: { line: 5, column: 6 } }),
        mutant({ id: 'a2', status: 'Killed', mutatorName: 'BooleanLiteral' }),
        mutant({ id: 'a3', file: 'src/b.js', status: 'NoCoverage', mutatorName: 'Regex', replacement: '/b/', start: { line: 7, column: 1 }, end: { line: 7, column: 4 } }),
        mutant({ id: 'a4', status: 'Survived', mutatorName: 'StringLiteral', replacement: '""', coveredBy: ['t1'] }),
      ],
    });
    expect(sarifReport(r)).toEqual({
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: { driver: { name: 'oxmutate', version: VERSION, informationUri: 'https://www.npmjs.com/package/oxmutate', rules: [rule('Regex'), rule('StringLiteral')] } },
          results: [
            {
              ruleId: 'StringLiteral',
              ruleIndex: 1,
              level: 'warning',
              message: { text: '2 test(s) run this code, and all still pass when it becomes `"x"` (StringLiteral). fix: assert the behaviour this line decides.' },
              locations: at('src/a.ts', [3, 4], [5, 6]),
              partialFingerprints: { mutationId: 'a1' },
              properties: { status: 'Survived', replacement: '"x"', coveredBy: 2 },
            },
            {
              ruleId: 'Regex',
              ruleIndex: 0,
              level: 'note',
              message: { text: 'No test reaches this code: changing it to `/b/` (Regex) would go unnoticed. fix: add a test that executes src/b.js:7.' },
              locations: at('src/b.js', [7, 1], [7, 4]),
              partialFingerprints: { mutationId: 'a3' },
              properties: { status: 'NoCoverage', replacement: '/b/', coveredBy: 0 },
            },
            {
              ruleId: 'StringLiteral',
              ruleIndex: 1,
              level: 'warning',
              message: { text: '1 test(s) run this code, and all still pass when it becomes `""` (StringLiteral). fix: assert the behaviour this line decides.' },
              locations: at('src/a.ts', [1, 1], [1, 5]),
              partialFingerprints: { mutationId: 'a4' },
              properties: { status: 'Survived', replacement: '""', coveredBy: 1 },
            },
          ],
        },
      ],
    });
  });
});

describe('a mutant described for a reader', () => {
  it('cuts a replacement past 60 characters to 57 and an ellipsis', () => {
    const long = 'x'.repeat(61);
    expect(describeMutant(mutant({ status: 'NoCoverage', replacement: long }))).toBe(`No test reaches this code: changing it to \`${'x'.repeat(57)}...\` (StringLiteral) would go unnoticed. fix: add a test that executes src/a.ts:1.`);
    expect(describeMutant(mutant({ status: 'Survived', replacement: 'y'.repeat(60) }))).toBe(`0 test(s) run this code, and all still pass when it becomes \`${'y'.repeat(60)}\` (StringLiteral). fix: assert the behaviour this line decides.`);
  });
});

const many = (k: number): MutantResult[] => Array.from({ length: k }, (_, i) => mutant({ status: 'Survived', start: { line: i + 1, column: 1 } }));
const listed = (t: string): string[] => t.split('\n').filter((l) => l.startsWith('  src/a.ts:'));

describe('the terminal summary', () => {
  it('after a dry run only: the tests that passed and the mutants they reach', async () => {
    const r = await run({
      dryRunOnly: true,
      tests: [{ id: 't1', file: 'a', name: 'a', ms: 1 }],
      mutants: [mutant({ coveredBy: ['t1'] }), mutant({ static: true }), mutant({ static: false }), mutant()],
    });
    expect(textSummary(r)).toBe(`oxmutate ${VERSION}: dry run only, 6.8 s\n  1 tests passed with every mutant compiled in and none active; 2 of 4 mutants are reached by a test\n`);
  });

  it('counts every status, the phases, and lists the survivors with what to do next', async () => {
    const r = await run({
      mutants: [
        mutant({ status: 'Killed' }),
        mutant({ status: 'Killed' }),
        mutant({ status: 'Timeout' }),
        mutant({ status: 'Survived', file: 'src/b.js', mutatorName: 'Regex', replacement: '/a\n   b/', start: { line: 4, column: 9 }, flaky: true }),
        mutant({ status: 'NoCoverage', replacement: `"${'z'.repeat(70)}"`, start: { line: 2, column: 1 } }),
        mutant({ status: 'Ignored' }),
        mutant({ status: 'RuntimeError' }),
        mutant({ status: 'CompileError' }),
        mutant({ status: 'CompileError' }),
      ],
    });
    expect(textSummary(r)).toBe(
      [
        `oxmutate ${VERSION}: 9 mutants in 2 files, 6.8 s`,
        '  mutation score 60.00% (covered 75.00%)',
        '  killed 2 · timeout 1 · survived 1 · no coverage 1 · ignored 1 · errors 3',
        '  instrument 3 ms · dry run 1.3 s · mutants 4.0 s · isolated 1.0 s',
        '',
        'Survivors (2):',
        '  src/b.js:4:9  Regex  → /a b/  (flaky)',
        `  src/a.ts:2:1  StringLiteral  → "${'z'.repeat(59)}`,
        '',
        'fix: run `oxmutate survivors --json` to hand the list to an agent, or kill the first one above with a test.',
        '',
      ].join('\n'),
    );
  });

  it('names each correction the run made, in a fixed order', async () => {
    const r = await run({ stats: stats({ watchdogKills: 1, pollutionRestarts: 2, canaryFiles: 3, flakyMutants: 4, survivorsOverturned: 5, timeoutsOverturned: 6, compileErrors: 7, reused: 8, crashes: 9 }) });
    expect(textSummary(r).split('\n')[4]).toBe(
      '  corrected: 1 runaway(s) stopped · 2 polluted context(s) restarted (in 3 file(s)) · 4 flaky verdict(s) · 5 survivor(s) killed by a whole-file re-run · 6 timeout(s) that finished given 3x the time · 7 survivor(s) that do not type-check, out of the score · 8 verdict(s) reused · 9 worker crash(es)',
    );
    expect(textSummary(await run({ stats: stats({ crashes: 1 }) })).split('\n')[4]).toBe('  corrected: 1 worker crash(es)');
    expect(textSummary(await run())).not.toContain('corrected');
  });

  it('shows the first ten survivors unless told otherwise, and says how many it left out', async () => {
    const eleven = textSummary(await run({ mutants: many(11) }));
    expect(eleven).toContain('\nSurvivors (11, first 10):\n');
    expect(listed(eleven)).toHaveLength(10);
    const ten = textSummary(await run({ mutants: many(10) }));
    expect(ten).toContain('\nSurvivors (10):\n');
    expect(listed(ten)).toHaveLength(10);
    const two = textSummary(await run({ mutants: many(3) }), { survivors: 2 });
    expect(two).toContain('\nSurvivors (3, first 2):\n');
    expect(listed(two)).toEqual(['  src/a.ts:1:1  StringLiteral  → ""', '  src/a.ts:2:1  StringLiteral  → ""']);
  });

  it('the frozen oracle line, signed, only when the change edited tests', async () => {
    const frozen = { base: 'origin/main', changedTests: ['src/a.test.ts'], baseScore: 80, headScore: 81.5, delta: 1.5, weakened: [] };
    const line = async (f: object): Promise<string | undefined> => textSummary(await run({ frozen: { ...frozen, ...f } })).split('\n')[4];
    expect(await line({})).toBe("  frozen oracle vs origin/main: 81.50% with the change's tests, 80.00% with the base's (+1.50), 0 mutant(s) the change stopped detecting");
    expect(await line({ delta: 0, headScore: 80 })).toBe("  frozen oracle vs origin/main: 80.00% with the change's tests, 80.00% with the base's (+0.00), 0 mutant(s) the change stopped detecting");
    expect(await line({ delta: -2.25, headScore: 77.75, weakened: [{ id: 'x', file: 'f', line: 1, mutatorName: 'M', replacement: 'r' }] })).toBe("  frozen oracle vs origin/main: 77.75% with the change's tests, 80.00% with the base's (-2.25), 1 mutant(s) the change stopped detecting");
    expect(textSummary(await run({ frozen: { ...frozen, changedTests: [] } })).split('\n')).toHaveLength(5);
  });

  it('one line per spec oracle with its F metrics', async () => {
    const located = { id: 'x', file: 'f', line: 1, mutatorName: 'M', replacement: 'r' };
    const spec = [{ name: 'counter', backend: 'quint' as const, traces: 100, modelled: 12, mappingCoverage: 91.666, specKillShare: 58.333, testSpecGap: [{ ...located, trace: 't' }], specEscapes: [located, located], msPerSpecExecution: 3 }];
    expect(textSummary(await run({ spec })).split('\n')[4]).toBe('  spec counter (quint, 100 traces): kills 58.3% of 12 modelled mutants, reaches 91.7%; 1 test-spec gap(s), 2 escape(s)');
  });

  it('lists config keys not used, unless warnings are off', async () => {
    const r = await run();
    r.options.unused = [
      { key: 'inPlace', why: 'a' },
      { key: 'plugins', why: 'b' },
    ];
    expect(textSummary(r).endsWith('\n\nConfig keys not used: inPlace, plugins (see the JSON report for why)\n')).toBe(true);
    r.options.warnUnused = false;
    expect(textSummary(r)).not.toContain('Config keys');
  });
});

const sourceWithTag = async (): Promise<RunResult> =>
  run({
    // A source that contains the very tag the report is embedded in.
    sources: { 'src/a.ts': "export const tag = '</script><script>alert(1)</script>';\n" },
    mutants: [mutant({ status: 'Survived', start: { line: 1, column: 20 }, end: { line: 1, column: 54 } })],
  });

describe('the HTML report', () => {

  it('embeds the JSON report so no source can close its script tag', async () => {
    const r = await sourceWithTag();
    const html = htmlReport(r);
    // One `</script>` per tag the page writes (component, report), none from the source.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const embedded = /app\.report = (.*);\n/.exec(html)?.[1] ?? '';
    expect(embedded).not.toContain('<');
    expect(JSON.parse(embedded)).toEqual(JSON.parse(JSON.stringify(strykerReport(r))));
  });

  it('loads the component from a pinned CDN version, with its hash, when the project has none installed', async () => {
    const r = await run({ sources: {} });
    expect(htmlReport(r)).toBe(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>oxmutate report</title>
  <script src="https://cdn.jsdelivr.net/npm/mutation-testing-elements@3.8.4/dist/mutation-test-elements.js" integrity="sha384-xebNisAYQHHbrYIm991U9KOZ96oO+vRACR8kd+zHzWkU3pcRuigrsI7XS2tj3rqq" crossorigin="anonymous"></script>
</head>
<body>
  <mutation-test-report-app titlePostfix="oxmutate">Your browser does not support custom elements.</mutation-test-report-app>
  <script>
    const app = document.querySelector('mutation-test-report-app');
    app.report = ${JSON.stringify(strykerReport(r))};
    const theme = () => { document.body.style.backgroundColor = app.themeBackgroundColor; };
    app.addEventListener('theme-changed', theme);
    theme();
  </script>
</body>
</html>
`);
  });

  it('inlines the component from the project install, so the page works offline', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'oxmutate-reports-elements-'));
    try {
      const dist = path.join(project, 'node_modules/mutation-testing-elements/dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(path.join(project, 'node_modules/mutation-testing-elements/package.json'), '{"name":"mutation-testing-elements"}');
      writeFileSync(path.join(dist, 'mutation-test-elements.js'), 'customElements.define("x", class {});');
      const html = htmlReport(await run({ root: project }));
      expect(html).toContain('\n  <script>customElements.define("x", class {});</script>\n</head>');
      expect(html).not.toContain('cdn.jsdelivr.net');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

describe('writeReports', () => {
  it('writes each configured reporter, creating directories, and returns the paths', async () => {
    const r = await run({ mutants: [mutant({ status: 'Survived' })] });
    const out = path.join(root, 'out', 'deep');
    r.options.reporters = ['json', 'sarif', 'html', 'clear-text'];
    r.options.jsonReport = path.join(out, 'm.json');
    r.options.sarifReport = path.join(out, 's', 'm.sarif');
    r.options.htmlReport = path.join(out, 'h', 'm.html');
    expect(writeReports(r)).toEqual([r.options.jsonReport, r.options.sarifReport, r.options.htmlReport]);
    expect(readFileSync(r.options.jsonReport, 'utf8')).toBe(JSON.stringify(strykerReport(r), null, 2));
    expect(readFileSync(r.options.sarifReport, 'utf8')).toBe(JSON.stringify(sarifReport(r), null, 2));
    expect(readFileSync(r.options.htmlReport, 'utf8')).toBe(htmlReport(r));
  });

  it('writes only the reporters named', async () => {
    const runs = await Promise.all([run(), run()]);
    for (const [i, reporters] of [['sarif'], ['json', 'html']].entries()) {
      const r = runs[i] as RunResult;
      r.options.reporters = reporters;
      r.options.jsonReport = path.join(root, `only${String(i)}`, 'm.json');
      r.options.sarifReport = path.join(root, `only${String(i)}`, 'm.sarif');
      r.options.htmlReport = path.join(root, `only${String(i)}`, 'm.html');
      const written = writeReports(r);
      expect([r.options.jsonReport, r.options.sarifReport, r.options.htmlReport].map(existsSync)).toEqual(['json', 'sarif', 'html'].map((k) => reporters.includes(k)));
      expect(written).toHaveLength(reporters.length);
    }
  });

  it('writes nothing after a dry run only', async () => {
    const r = await run({ dryRunOnly: true });
    r.options.jsonReport = path.join(root, 'dry', 'm.json');
    expect(writeReports(r)).toEqual([]);
    expect(existsSync(r.options.jsonReport)).toBe(false);
  });
});
