// Every metric in .sdlc/intents/oxmutate/metrics.md that one Stryker/oxmutate pair can answer,
// from the files `burgee-pair.mts` writes. Metrics that need a different experiment (A1, A2, A4,
// A8, S5, S6, T3, T6, C2, C3, D*) are listed as `needs` with the command that measures them.
//   node metrics.mjs <pair-dir> [<pair-dir> ...]      e.g. bench/results/paratext
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mutantsOf = (r) => Object.values(r.files).flatMap((f) => f.mutants);
const scored = (ms) => ms.filter((m) => m.status !== 'Ignored' && m.status !== 'CompileError' && m.status !== 'RuntimeError');
const survivorsOf = (ms) => ms.filter((m) => m.status === 'Survived' || m.status === 'NoCoverage');
const round = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);
const PERCENT = 100;
const S_PER_HOUR = 3600;

/** The metrics both sides of a pair answer the same way. */
const side = (run, ms, executions) => ({
  'S3 wall s': round(run.wallS, 1),
  'E1 cpu s/mutant': round(run.cpuS / scored(ms).length),
  'E2 executions/mutant': round(executions / scored(ms).length, 2),
  'E4 mutants/core-hour': Math.round(scored(ms).length / (run.cpuS / S_PER_HOUR)),
  'C4 peak RSS MB': Math.round(run.maxRssMb),
  scored: scored(ms).length,
});

function measure(dir) {
  const pair = JSON.parse(readFileSync(path.join(dir, 'pair.json'), 'utf8'));
  const sFile = path.join(dir, 'stryker.json');
  const oFile = path.join(dir, 'oxmutate', 'mutation.json');
  const s = JSON.parse(readFileSync(sFile, 'utf8'));
  const o = JSON.parse(readFileSync(oFile, 'utf8'));
  const sm = mutantsOf(s);
  const om = mutantsOf(o);
  const stats = o['x-oxmutate'].stats;
  const agreement = JSON.parse(execFileSync(process.execPath, [path.join(here, 'compare-reports.mjs'), oFile, sFile]).toString().split('\n')[0]);
  const survivorsJson = execFileSync(process.execPath, [path.join(here, '..', 'dist', 'bin.js'), 'survivors', '--report', oFile, '--json']).toString();
  const records = JSON.parse(survivorsJson).data.survivors;
  const staticO = om.filter((m) => m.static);
  const staticS = sm.filter((m) => m.static);
  return {
    package: pair.package,
    date: pair.date,
    machine: pair.machine,
    concurrency: pair.concurrency,
    stryker: {
      ...side(pair.stryker, sm, sm.reduce((n, m) => n + (m.testsCompleted ?? 0), 0)),
      'T4 static scored %': staticS.length ? round((PERCENT * scored(staticS).length) / staticS.length, 1) : null,
      // An agent without a survivors command reads the JSON report to find them.
      'A5 bytes/survivor': Math.round(statSync(sFile).size / Math.max(1, survivorsOf(sm).length)),
      'A7 fix-line %': 0,
    },
    oxmutate: {
      ...side(pair.oxmutate, om, stats.testExecutions),
      'S2 instrument ms': round(stats.instrumentMs, 0),
      'T4 static scored %': staticO.length ? round((PERCENT * scored(staticO).length) / staticO.length, 1) : null,
      'A5 bytes/survivor': Math.round(Buffer.byteLength(survivorsJson) / Math.max(1, records.length)),
      'A7 fix-line %': records.length ? round((PERCENT * records.filter((r) => typeof r.fix === 'string' && r.fix.length).length) / records.length, 1) : PERCENT,
      corrections: { watchdogKills: stats.watchdogKills, pollutionRestarts: stats.pollutionRestarts, survivorsOverturned: stats.survivorsOverturned, flakyMutants: stats.flakyMutants },
    },
    'T1 agreement %': agreement.agreementPct,
    speedup: round(pair.stryker.wallS / pair.oxmutate.wallS, 2),
    cpuRatio: round(pair.stryker.cpuS / pair.oxmutate.cpuS, 2),
    needs: {
      'A1 time to first survivor': 'streaming --json (not built)',
      'A2/S6 loop latency': 'oxmutate run --incremental after a one-file edit',
      'T3 stability': 'three oxmutate runs, compare-reports pairwise',
      'C3 shard balance': 'oxmutate run --shard i/n for i in 1..n',
    },
  };
}

console.log(JSON.stringify(process.argv.slice(2).map(measure), null, 2));
