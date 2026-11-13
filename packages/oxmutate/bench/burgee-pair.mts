/**
 * Stryker and oxmutate on the same burgee package, the same mutate list, the same Vitest wrapper
 * and the same concurrency, one after the other on one machine.
 *
 *   npx tsx packages/oxmutate/bench/burgee-pair.mts --package paratext [--concurrency 4] [--out <dir>] [--only oxmutate|stryker]
 *       [--clip <file>:<from>-<to>] [--stryker-compat]
 *
 * `--clip src/hosts.ts:1-801` (repeatable) gives oxmutate that range of the file instead of all of
 * it, for a file Stryker grades only part of: in compat-oracle's `hosts.ts`, Stryker cannot see the
 * `restore` comments and ignores everything from the first `disable all`, line 802, to the end
 * (sc8-profile.md §1). `--stryker-compat` runs oxmutate with `strykerCompat: true`, which generates
 * Stryker's mutant set. Together they make the two tools grade the same mutants; `pair.json`'s
 * `sets` says how many each graded and how many matched.
 *
 * Stryker runs exactly as `scripts/mutation.ts full` runs it (its exported config and wrapper),
 * except that its JSON report is kept for the verdict comparison. Writes `<out>/<pkg>/`:
 * `stryker.json`, `oxmutate.json`, `pair.json` (times, CPU, verdicts, agreement).
 * `OXMUTATE_BIN=<dist>/bin.js` runs another build of oxmutate, for an A/B of two builds.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import path from 'node:path';

import { isMutationSource, REPO_ROOT, SKIPPED_TESTS, strykerConfig, wrapperConfig } from '../../../scripts/mutation.ts';

const arg = (n: string, d?: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const pkg = arg('package') ?? 'paratext';
const concurrency = Number(arg('concurrency', '4'));
const only = arg('only');
const clips = new Map(process.argv.flatMap((a, i) => (a === '--clip' ? [process.argv[i + 1] ?? ''] : [])).map((c) => [c.replace(/:\d+-\d+$/u, ''), c]));
const strykerCompat = process.argv.includes('--stryker-compat');
const out = path.resolve(arg('out', path.join(REPO_ROOT, 'packages/oxmutate/bench/results')) as string, pkg);
mkdirSync(out, { recursive: true });

const packageDir = path.join(REPO_ROOT, 'packages', pkg);
const sources: string[] = [];
const walk = (dir: string): void => {
  for (const e of readdirSync(path.join(packageDir, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (isMutationSource(rel)) sources.push(rel);
  }
};
walk('src');
sources.sort();

const wrapperDir = path.join(packageDir, '.mutation');
const vitestConfig = path.join(wrapperDir, 'vitest.config.ts');
mkdirSync(wrapperDir, { recursive: true });
writeFileSync(vitestConfig, wrapperConfig(packageDir, Object.keys(SKIPPED_TESTS[pkg] ?? {})));

const KIB = 1024;
const MIB = KIB * KIB;
const MS_PER_S = 1000;
/** 1 GiB: the child's whole stdout and stderr are buffered. */
const MAX_OUTPUT_BYTES = KIB * MIB;
const STDERR_TAIL = 2000;
/** `time -l` reports max RSS in bytes; `time -v` in kilobytes. */
const RSS_UNIT_BYTES = process.platform === 'darwin' ? 1 : KIB;

/** wall, user+sys CPU and max RSS of a child, from /usr/bin/time -l (macOS) or -v (Linux). */
function timed(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): { wallS: number; cpuS: number; maxRssMb: number; status: number | null; stderrTail: string } {
  const flag = process.platform === 'darwin' ? '-l' : '-v';
  const t0 = Date.now();
  const r = spawnSync('/usr/bin/time', [flag, cmd, ...args], { cwd, env, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  const wallS = (Date.now() - t0) / MS_PER_S;
  const err = r.stderr ?? '';
  const mac = /([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/.exec(err);
  const linuxUser = /User time \(seconds\): ([\d.]+)/.exec(err);
  const linuxSys = /System time \(seconds\): ([\d.]+)/.exec(err);
  const cpuS = mac ? Number(mac[2]) + Number(mac[3]) : Number(linuxUser?.[1] ?? 0) + Number(linuxSys?.[1] ?? 0);
  const rss = /(\d+)\s+maximum resident set size/.exec(err) ?? /Maximum resident set size \(kbytes\): (\d+)/.exec(err);
  const maxRssMb = rss ? (Number(rss[1]) * RSS_UNIT_BYTES) / MIB : 0;
  return { wallS, cpuS, maxRssMb, status: r.status, stderrTail: err.slice(-STDERR_TAIL) };
}

const result: Record<string, unknown> = { package: pkg, concurrency, mutate: sources.length, date: new Date().toISOString(), machine: `${process.platform}-${process.arch}` };
try {
  if (only !== 'oxmutate') {
    const reportFile = path.join(out, 'stryker.json');
    rmSync(reportFile, { force: true });
    const configFile = path.join(out, 'stryker.config.json');
    writeFileSync(configFile, JSON.stringify(strykerConfig({ vitestConfig, mutate: sources, concurrency, timeoutMS: 5000, dryRunTimeoutMinutes: 10, reportFile }), null, 2));
    const before = new Map(sources.map((f) => [f, readFileSync(path.join(packageDir, f), 'utf8')]));
    const loadBefore = loadavg()[0];
    const t = timed(process.execPath, [path.join(REPO_ROOT, 'node_modules/@stryker-mutator/core/bin/stryker.js'), 'run', configFile], packageDir, { ...process.env, FORCE_COLOR: '0' });
    for (const [f, text] of before) if (readFileSync(path.join(packageDir, f), 'utf8') !== text) writeFileSync(path.join(packageDir, f), text);
    result['stryker'] = { ...t, report: existsSync(reportFile), loadBefore, loadAfter: loadavg()[0] };
  }
  if (only !== 'stryker') {
    const reportDir = path.join(out, 'oxmutate');
    const configFile = path.join(out, 'oxmutate.config.json');
    writeFileSync(configFile, JSON.stringify({ mutate: sources.map((f) => clips.get(f) ?? f), vitest: { configFile: vitestConfig }, concurrency, ...(strykerCompat ? { strykerCompat: true } : {}) }));
    const loadBefore = loadavg()[0];
    const t = timed(process.execPath, [process.env['OXMUTATE_BIN'] ?? path.join(REPO_ROOT, 'packages/oxmutate/dist/bin.js'), 'run', '--config', configFile, '--report-dir', reportDir, '--reporter', 'json'], packageDir, { ...process.env, FORCE_COLOR: '0' });
    // A 1-minute load average above the core count means another job shared the machine.
    result['oxmutate'] = { ...t, report: existsSync(path.join(reportDir, 'mutation.json')), loadBefore, loadAfter: loadavg()[0] };
  }
} finally {
  rmSync(wrapperDir, { recursive: true, force: true });
}
/** The mutants a report graded (not Ignored), as `file:line:column:mutator`. */
const graded = (file: string): string[] => {
  const report = JSON.parse(readFileSync(file, 'utf8')) as { files: Record<string, { mutants: { status: string; mutatorName: string; location: { start: { line: number; column: number } } }[] }> };
  return Object.entries(report.files).flatMap(([f, x]) => x.mutants.filter((m) => m.status !== 'Ignored').map((m) => `${f.replace(/^.*?(src\/)/u, '$1')}:${String(m.location.start.line)}:${String(m.location.start.column)}:${m.mutatorName}`));
};

// Which mutants each tool graded, and how many are the same mutant: the comparison is only like for
// like when `onlyA` and `onlyB` are near zero. Ignored mutants are in both reports and are not graded.
const strykerReport = path.join(out, 'stryker.json');
const oxmutateReport = path.join(out, 'oxmutate', 'mutation.json');
if (existsSync(strykerReport) && existsSync(oxmutateReport)) {
  const a = graded(strykerReport);
  const left = new Map<string, number>();
  for (const k of graded(oxmutateReport)) left.set(k, (left.get(k) ?? 0) + 1);
  let matched = 0;
  for (const k of a) {
    const n = left.get(k) ?? 0;
    if (n > 0) {
      matched++;
      left.set(k, n - 1);
    }
  }
  const onlyOxmutate = [...left.values()].reduce((sum, n) => sum + n, 0);
  result['sets'] = { stryker: a.length, oxmutate: matched + onlyOxmutate, matched, onlyStryker: a.length - matched, onlyOxmutate };
}
writeFileSync(path.join(out, 'pair.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, (k, v) => (k === 'stderrTail' ? undefined : v), 2));
