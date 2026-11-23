// oxmutate in container mode on real repositories: how long a run takes, where the time goes, and
// every mutant's verdict, for one build. The speed target of oxmutate-x2 is measured with this, on
// the machines it is for (a corporate laptop whose endpoint scanner makes host runs slow).
//
//   node packages/oxmutate/bench/container.mjs --candidate <oxmutate.tgz> --label <name>
//        with any of --targets ufo,pathe,defu,gen · --rounds 3 · --out <dir> · --host <dist/bin.js>
//        · --concurrency N (workers inside the container; default: the tool's own)
//        · --env NAME=value (repeatable: set in the container, e.g. OXMUTATE_LIVE_CONFIRM=1; the
//        fresh-worker reference sets OXMUTATE_ISOLATE_ALL, _ISOLATE_STATIC and _ISOLATE_POLLUTION to 1)
//
// Each target is a repository pinned to a commit, cloned once under ~/.cache/oxmutate-bench. The
// candidate tarball goes into the repository as an untracked file, so container mode sends it in,
// and the install puts it under /w/tools: the oxmutate inside is the candidate, whatever the
// project depends on. The host side is `--host` (default: this checkout's dist/bin.js). The first
// run of a target only warms its volume and is not counted. Every run's report is kept, and the
// summary is written to <out>/<label>.json: per target, the median wall and phases, and a digest
// of every verdict, so two builds are compared on time and on quality (`--compare a.json b.json`).
// A verdict that differs from the baseline is accepted only when a fresh worker gives it too:
// `--compare a.json b.json --fresh ref.json` lists every differing row with the reference's verdict
// for it (oxmutate-x2 intent, 2026-11-20), and exits 1 for any row the reference does not confirm.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, '..');
const ROOT = path.join(homedir(), '.cache', 'oxmutate-bench');
const MS_PER_S = 1000;
/** Part of the install's key, so each invocation installs its tarball on its uncounted first run: a volume another run used keeps the engine it was left with otherwise. */
const INVOCATION = Date.now();
/** Hex digits kept of a verdict digest, and of the candidate tarball's hash in the install line. */
const DIGEST_HEX = 16;
const TGZ_HEX = 12;
/** A run's output is read only for its last lines when it leaves no report. */
const OUTPUT_BYTES = 256 * 1024 * 1024;
const ERROR_LINES = 4;
const DIFFERENCES_SHOWN = 3;

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
  // eslint-disable-next-line conventions/prefer-dependency-version-strategy -- a benchmark target is pinned, so every run measures the same Vitest
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
  if (!t) throw new Error(`unknown target ${name}: one of ${Object.keys(TARGETS).join(', ')}`);
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
  return { sha: createHash('sha256').update(rows.join('\n')).digest('hex').slice(0, DIGEST_HEX), rows };
}

function runOne(name, dir, candidate, host) {
  const tgz = path.join(dir, '.oxmutate-candidate.tgz');
  copyFileSync(candidate, tgz);
  const sum = createHash('sha256').update(readFileSync(tgz)).digest('hex').slice(0, TGZ_HEX);
  // `|| exit 1`: errexit ignores a failing command in the middle of an `&&` chain, so without it a failed pnpm install was swallowed, the install stamp written, and the volume kept the engine it had.
  const install = `export CI=true && ${TARGETS[name].install} && rm -rf /w/tools/node_modules /w/tools/package-lock.json && npm i --no-save --no-audit --no-fund --prefix /w/tools /w/src/.oxmutate-candidate.tgz && : ${sum}-${INVOCATION} || exit 1`;
  writeFileSync(path.join(dir, 'oxmutate.config.json'), JSON.stringify({ reporters: ['json'], ...(opt('concurrency') ? { concurrency: Number(opt('concurrency')) } : {}), container: { install, command: '/w/tools/node_modules/.bin/oxmutate', network: 'none', env: args.flatMap((a, i) => (args[i - 1] === '--env' ? [a] : [])) } }));
  // Container mode sends git's files: stage the tarball, so no .gitignore of the project can drop it.
  execFileSync('git', ['add', '-f', '.oxmutate-candidate.tgz', 'oxmutate.config.json'], { cwd: dir });
  // A run that fails before it writes a report must not be read as the previous run's.
  const reportFile = path.join(dir, 'reports/mutation/mutation.json');
  rmSync(reportFile, { force: true });
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [host, 'run', '--container'], { cwd: dir, encoding: 'utf8', maxBuffer: OUTPUT_BYTES });
  const wallMs = performance.now() - t0;
  const tail = () => `${r.stderr || r.stdout || ''}`.split('\n').filter(Boolean).slice(-ERROR_LINES).join(' | ');
  if (r.status !== 0 && r.status !== 1) return { wallMs, error: tail() };
  if (!existsSync(reportFile)) return { wallMs, error: `no report (exit ${String(r.status)}): ${tail()}` };
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  // An engine that exits 1 at once (a config key it does not know) leaves the volume's old report to be copied back: a run cannot have taken longer than the wall time it was measured over.
  if ((report['x-oxmutate']?.stats?.wallMs ?? 0) > wallMs) return { wallMs, error: `stale report: its run took ${String(Math.round(report['x-oxmutate'].stats.wallMs))} ms of a ${String(Math.round(wallMs))} ms wall; the engine inside exited at once: ${tail()}` };
  return { wallMs, stats: report['x-oxmutate']?.stats ?? {}, digest: digest(report) };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const PHASES = ['dryRunMs', 'mutationMs', 'staticMs', 'isolatedMs'];

function bench() {
  const candidate = path.resolve(opt('candidate'));
  // The container is Linux: a tarball without a Linux native core fails fast inside every run.
  const entries = execFileSync('tar', ['-tzf', candidate], { encoding: 'utf8' }).split('\n');
  if (!entries.some((e) => /^package\/binding\/[^/]*linux[^/]*\.node$/u.test(e))) {
    throw new Error(`${candidate} has no binding/*linux*.node. fix: copy the Linux cores into packages/oxmutate/binding/ (from a released tarball when native/ is unchanged, or cargo build them) before npm pack`);
  }
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
      // eslint-disable-next-line secure-coding/detect-object-injection -- `name` is a key of TARGETS, which prepare() checked
      summary.targets[name] = { error: warm.error };
      console.log(`${name}: ${warm.error}`);
      continue;
    }
    const runs = Array.from({ length: rounds }, () => runOne(name, dir, candidate, host));
    const ok = runs.filter((r) => !r.error);
    const shas = [...new Set(ok.map((r) => r.digest.sha))];
    // eslint-disable-next-line secure-coding/detect-object-injection -- `name` is a key of TARGETS, which prepare() checked
    summary.targets[name] = {
      wallMs: median(ok.map((r) => r.wallMs)),
      ...Object.fromEntries(PHASES.map((p) => [p, median(ok.map((r) => r.stats[p] ?? 0))])),
      isolatedByCause: ok.at(-1)?.stats.isolatedByCause,
      confirmLive: ok.at(-1)?.stats.confirmLive,
      isolatedStages: ok.at(-1)?.stats.isolatedStages,
      warmByFile: ok.at(-1)?.stats.warmByFile,
      dryFiles: ok.at(-1)?.stats.dryFiles,
      freshByFile: ok.at(-1)?.stats.freshByFile,
      freshFirst: ok.at(-1)?.stats.freshFirst,
      mutants: ok.at(-1)?.digest.rows.length,
      digest: shas.length === 1 ? shas[0] : `unstable: ${shas.join(',')}`,
      rows: ok.at(-1)?.digest.rows,
      errors: runs.filter((r) => r.error).map((r) => r.error),
    };
    const s = summary.targets[name];
    console.log(`${name}: wall ${(s.wallMs / MS_PER_S).toFixed(1)} s · ${PHASES.map((p) => `${p.replace('Ms', '')} ${((s[p] ?? 0) / MS_PER_S).toFixed(1)}`).join(' · ')} · ${s.mutants} mutants · ${s.digest}`);
  }
  writeFileSync(path.join(out, `${label}.json`), `${JSON.stringify(summary, null, 2)}\n`);
}

/** A digest row as its key and verdict: `file:line:col:mutator:replacement` and `Killed|Survived|...`. */
const split = (row) => {
  const at = row.lastIndexOf('=');
  return [row.slice(0, at), row.slice(at + 1)];
};

/** Each differing row, with the verdict a fresh worker gives that mutant: proven when they agree. Returns the unproven count. */
function prove(changed, before, freshRows) {
  const reference = new Map(freshRows.map(split));
  const was = new Map(before.map(split));
  let unproven = 0;
  for (const row of changed) {
    const [key, verdict] = split(row);
    const ref = reference.get(key);
    if (ref !== verdict) unproven++;
    console.log(`  ${ref === verdict ? 'proven' : 'UNPROVEN'}  ${key}: ${was.get(key) ?? 'absent'} -> ${verdict}; fresh worker: ${ref ?? 'no row'}`);
  }
  return unproven;
}

const provenLine = (unproven) => (unproven ? `${unproven} differing verdicts the fresh worker does not give` : "every differing verdict is a fresh worker's");

function compare() {
  const i = args.indexOf('--compare');
  const [a, b] = [args[i + 1], args[i + 2]].map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const freshFile = opt('fresh', '');
  const fresh = freshFile ? JSON.parse(readFileSync(freshFile, 'utf8')) : undefined;
  let differ = 0;
  let unproven = 0;
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
    unproven += fresh ? prove(changed, x.rows, fresh.targets[name]?.rows ?? []) : 0;
    wa += x.wallMs;
    wb += y.wallMs;
    console.log(`${name}: ${(x.wallMs / MS_PER_S).toFixed(1)} s -> ${(y.wallMs / MS_PER_S).toFixed(1)} s (${(x.wallMs / y.wallMs).toFixed(2)}x) · verdicts ${changed.length ? `${changed.length} differ: ${changed.slice(0, DIFFERENCES_SHOWN).join('; ')}` : 'equal'}`);
  }
  console.log(`total: ${(wa / MS_PER_S).toFixed(1)} s -> ${(wb / MS_PER_S).toFixed(1)} s (${(wa / wb).toFixed(2)}x) · ${differ ? `${differ} verdicts differ` : 'every verdict equal'}`);
  if (fresh) console.log(provenLine(unproven));
  const failing = fresh ? unproven : differ;
  process.exitCode = failing ? 1 : 0;
}

if (args.includes('--compare')) compare();
else bench();
