/**
 * Stryker and oxmutate on the same burgee package, the same mutate list, the same Vitest wrapper
 * and the same concurrency, one after the other on one machine.
 *
 *   npx tsx packages/oxmutate/bench/burgee-pair.mts --package paratext [--concurrency 4] [--out <dir>] [--only oxmutate|stryker]
 *
 * Stryker runs exactly as `scripts/mutation.ts full` runs it (its exported config and wrapper),
 * except that its JSON report is kept for the verdict comparison. Writes `<out>/<pkg>/`:
 * `stryker.json`, `oxmutate.json`, `pair.json` (times, CPU, verdicts, agreement).
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
    writeFileSync(configFile, JSON.stringify({ mutate: sources, vitest: { configFile: vitestConfig }, concurrency }));
    const loadBefore = loadavg()[0];
    const t = timed(process.execPath, [path.join(REPO_ROOT, 'packages/oxmutate/dist/bin.js'), 'run', '--config', configFile, '--report-dir', reportDir, '--reporter', 'json'], packageDir, { ...process.env, FORCE_COLOR: '0' });
    // A 1-minute load average above the core count means another job shared the machine.
    result['oxmutate'] = { ...t, report: existsSync(path.join(reportDir, 'mutation.json')), loadBefore, loadAfter: loadavg()[0] };
  }
} finally {
  rmSync(wrapperDir, { recursive: true, force: true });
}
writeFileSync(path.join(out, 'pair.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, (k, v) => (k === 'stderrTail' ? undefined : v), 2));
