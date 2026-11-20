// oxmutate in container mode on real repositories: how long a run takes, where the time goes, and
// every mutant's verdict, for one build. The speed target of oxmutate-x2 is measured with this, on
// the machines it is for (a corporate laptop whose endpoint scanner makes host runs slow).
//
//   node packages/oxmutate/bench/container.mjs --candidate <oxmutate.tgz> --label <name>
//        [--targets ufo,pathe,defu,gen] [--rounds 3] [--out <dir>] [--host <dist/bin.js>]
//
// Each target is a repository pinned to a commit, cloned once under ~/.cache/oxmutate-bench. The
// candidate tarball goes into the repository as an untracked file, so container mode sends it in,
// and the install puts it under /w/tools: the oxmutate inside is the candidate, whatever the
// project depends on. The host side is `--host` (default: this checkout's dist/bin.js). The first
// run of a target only warms its volume and is not counted. Every run's report is kept, and the
// summary is written to <out>/<label>.json: per target, the median wall and phases, and a digest
// of every verdict, so two builds are compared on time and on quality (`--compare a.json b.json`).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, '..');
const ROOT = path.join(homedir(), '.cache', 'oxmutate-bench');

/** Pinned repositories: real libraries on Vitest 4, each with what it needs to install. */
const TARGETS = {
  ufo: { repo: 'https://github.com/unjs/ufo.git', commit: 'f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6', install: 'corepack enable && pnpm install --frozen-lockfile' },
  pathe: { repo: 'https://github.com/unjs/pathe.git', commit: 'bc7477a01f0bd60ada017add8142c9f9d69ccdc5', install: 'corepack enable && pnpm install --frozen-lockfile' },
  defu: { repo: 'https://github.com/unjs/defu.git', commit: '82632b66f5914e9946edce300e10633a3d5c0cb7', install: 'corepack enable && pnpm install --frozen-lockfile' },
  gen: { generate: 60, install: 'npm install --no-audit --no-fund' },
};

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

/** A generated project: n modules with branches, each with a test file, so the size is known. */
function generate(dir, n) {
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'bench-gen', private: true, type: 'module', devDependencies: { vitest: '4.1.9' } }));
  for (let i = 1; i <= n; i++) {
    writeFileSync(path.join(dir, `src/m${i}.ts`), `export function f${i}(a: number, b: number, flag: boolean): number {\n  if (a > b && flag) return a - b + ${i};\n  if (a === b || !flag) return a * 2 + b;\n  return Math.max(a, b) % (${i} + 1);\n}\nexport const label${i} = (s: string): string => (s.length > 3 ? \`[\${s.toUpperCase()}]\` : s + '${i}');\n`);
    writeFileSync(path.join(dir, `src/m${i}.test.ts`), `import { expect, it } from 'vitest';\nimport { f${i}, label${i} } from './m${i}.js';\nit('subtracts', () => { expect(f${i}(5, 2, true)).toBe(3 + ${i}); });\nit('doubles equal', () => { expect(f${i}(4, 4, true)).toBe(12); });\nit('doubles unflagged', () => { expect(f${i}(1, 9, false)).toBe(11); });\nit('wraps', () => { expect(label${i}('abcd')).toBe('[ABCD]'); });\nit('suffixes', () => { expect(label${i}('ab')).toBe('ab${i}'); });\n`);
  }
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules\nreports\n');
  for (const a of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=b', '-c', 'user.email=b@b', 'commit', '-qm', 'gen']]) execFileSync('git', a, { cwd: dir });
}

function prepare(name) {
  const t = TARGETS[name];
  const dir = path.join(ROOT, name);
  if (!existsSync(dir)) {
    mkdirSync(ROOT, { recursive: true });
    if (t.generate) generate(dir, t.generate);
    else {
      execFileSync('git', ['clone', '-q', t.repo, dir]);
      execFileSync('git', ['checkout', '-q', t.commit], { cwd: dir });
    }
  }
  return dir;
}

/** Every verdict as a row; Killed and Timeout are both detections (a loaded machine moves one to the other), as in ab.mjs. */
function digest(report) {
  const rows = Object.entries(report.files).flatMap(([f, x]) => x.mutants.map((m) => `${f}:${m.location.start.line}:${m.location.start.column}:${m.mutatorName}:${m.replacement ?? ''}=${m.status === 'Timeout' ? 'Killed' : m.status}`)).sort();
  return { sha: createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, 16), rows };
}

function runOne(name, dir, candidate, host) {
  const tgz = path.join(dir, '.oxmutate-candidate.tgz');
  copyFileSync(candidate, tgz);
  const sum = createHash('sha256').update(readFileSync(tgz)).digest('hex').slice(0, 12);
  const install = `${TARGETS[name].install} && npm i --no-save --no-audit --no-fund --prefix /w/tools /w/src/.oxmutate-candidate.tgz && : ${sum}`;
  writeFileSync(path.join(dir, 'oxmutate.config.json'), JSON.stringify({ reporters: ['json'], container: { install, command: '/w/tools/node_modules/.bin/oxmutate', network: 'none' } }));
  // Container mode sends git's files: stage the tarball, so no .gitignore of the project can drop it.
  execFileSync('git', ['add', '-f', '.oxmutate-candidate.tgz', 'oxmutate.config.json'], { cwd: dir });
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [host, 'run', '--container'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  const wallMs = performance.now() - t0;
  const reportFile = path.join(dir, 'reports/mutation/mutation.json');
  if (r.status !== 0 && r.status !== 1) return { wallMs, error: (r.stderr || r.stdout).split('\n').filter(Boolean).slice(-4).join(' | ') };
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  return { wallMs, stats: report['x-oxmutate']?.stats ?? {}, digest: digest(report) };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const PHASES = ['dryRunMs', 'mutationMs', 'staticMs', 'isolatedMs'];

function bench() {
  const candidate = path.resolve(opt('candidate'));
  const label = opt('label', 'run');
  const rounds = Number(opt('rounds', '3'));
  const out = path.resolve(opt('out', path.join(ROOT, 'results')));
  const host = path.resolve(opt('host', path.join(PACKAGE, 'dist/bin.js')));
  const names = opt('targets', 'ufo,pathe,defu,gen').split(',');
  mkdirSync(out, { recursive: true });
  const summary = { label, candidate, at: new Date().toISOString(), targets: {} };
  for (const name of names) {
    const dir = prepare(name);
    const warm = runOne(name, dir, candidate, host);
    if (warm.error) {
      summary.targets[name] = { error: warm.error };
      console.log(`${name}: ${warm.error}`);
      continue;
    }
    const runs = Array.from({ length: rounds }, () => runOne(name, dir, candidate, host));
    const ok = runs.filter((r) => !r.error);
    const shas = [...new Set(ok.map((r) => r.digest.sha))];
    summary.targets[name] = {
      wallMs: median(ok.map((r) => r.wallMs)),
      ...Object.fromEntries(PHASES.map((p) => [p, median(ok.map((r) => r.stats[p] ?? 0))])),
      isolatedByCause: ok.at(-1)?.stats.isolatedByCause,
      confirmLive: ok.at(-1)?.stats.confirmLive,
      mutants: ok.at(-1)?.digest.rows.length,
      digest: shas.length === 1 ? shas[0] : `unstable: ${shas.join(',')}`,
      rows: ok.at(-1)?.digest.rows,
      errors: runs.filter((r) => r.error).map((r) => r.error),
    };
    const s = summary.targets[name];
    console.log(`${name}: wall ${(s.wallMs / 1000).toFixed(1)} s · ${PHASES.map((p) => `${p.replace('Ms', '')} ${((s[p] ?? 0) / 1000).toFixed(1)}`).join(' · ')} · ${s.mutants} mutants · ${s.digest}`);
  }
  writeFileSync(path.join(out, `${label}.json`), `${JSON.stringify(summary, null, 2)}\n`);
}

function compare() {
  const i = args.indexOf('--compare');
  const [a, b] = [args[i + 1], args[i + 2]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  let differ = 0;
  let wa = 0;
  let wb = 0;
  for (const name of Object.keys(a.targets)) {
    const x = a.targets[name];
    const y = b.targets[name];
    if (!y || x.error || y.error) {
      console.log(`${name}: not comparable (${x.error ?? y?.error ?? 'missing'})`);
      continue;
    }
    const before = new Set(x.rows);
    const changed = y.rows.filter((r) => !before.has(r));
    differ += changed.length;
    wa += x.wallMs;
    wb += y.wallMs;
    console.log(`${name}: ${(x.wallMs / 1000).toFixed(1)} s -> ${(y.wallMs / 1000).toFixed(1)} s (${(x.wallMs / y.wallMs).toFixed(2)}x) · verdicts ${changed.length ? `${changed.length} differ: ${changed.slice(0, 3).join('; ')}` : 'equal'}`);
  }
  console.log(`total: ${(wa / 1000).toFixed(1)} s -> ${(wb / 1000).toFixed(1)} s (${(wa / wb).toFixed(2)}x) · ${differ ? `${differ} verdicts differ` : 'every verdict equal'}`);
  process.exitCode = differ ? 1 : 0;
}

if (args.includes('--compare')) compare();
else bench();
